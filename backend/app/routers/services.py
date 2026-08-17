"""Service catalogue and client service assignments."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import func, select, text

from ..deps import AdminUserDep, SessionDep, TenantUserDep, client_ip
from ..models import Client, ClientService, Deadline, Service
from .deadlines import generate_deadlines
from ..schemas import (
    ClientServiceCreate,
    ClientServiceRead,
    ClientServiceUpdate,
    Ok,
    ServiceCreate,
    ServiceRead,
    ServiceUpdate,
)
from ..services import audit
from ..utils import apply_updates, ensure_found, profile_names, read

router = APIRouter(tags=["services"])


@router.get("/services", response_model=list[ServiceRead])
async def list_services(
    session: SessionDep,
    user: TenantUserDep,
    category: str | None = None,
    active_only: bool = Query(default=False),
) -> list[ServiceRead]:
    stmt = select(Service).where(Service.tenant_id == user.tenant_id)
    if category:
        stmt = stmt.where(Service.category == category)
    if active_only:
        stmt = stmt.where(Service.is_active.is_(True))
    rows = (await session.scalars(stmt.order_by(Service.category, Service.name))).all()

    counts = dict(
        (
            await session.execute(
                select(ClientService.service_id, func.count(ClientService.id))
                .where(ClientService.tenant_id == user.tenant_id, ClientService.is_active.is_(True))
                .group_by(ClientService.service_id)
            )
        ).all()
    )
    return [read(ServiceRead, row, client_count=counts.get(row.id, 0)) for row in rows]


@router.post("/services", response_model=ServiceRead, status_code=status.HTTP_201_CREATED)
async def create_service(
    payload: ServiceCreate, session: SessionDep, user: TenantUserDep
) -> ServiceRead:
    exists = await session.scalar(
        select(Service.id).where(Service.tenant_id == user.tenant_id, Service.code == payload.code)
    )
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Service code '{payload.code}' already exists.")

    row = Service(tenant_id=user.tenant_id, **payload.model_dump())
    session.add(row)
    await session.flush()
    return read(ServiceRead, row)


@router.patch("/services/{service_id}", response_model=ServiceRead)
async def update_service(
    service_id: uuid.UUID, payload: ServiceUpdate, session: SessionDep, user: TenantUserDep
) -> ServiceRead:
    row = await session.scalar(
        select(Service).where(Service.id == service_id, Service.tenant_id == user.tenant_id)
    )
    ensure_found(row, "Service")
    apply_updates(row, payload)
    await session.flush()
    return read(ServiceRead, row)


@router.delete("/services/{service_id}", response_model=Ok)
async def delete_service(service_id: uuid.UUID, session: SessionDep, user: TenantUserDep) -> Ok:
    row = await session.scalar(
        select(Service).where(Service.id == service_id, Service.tenant_id == user.tenant_id)
    )
    ensure_found(row, "Service")

    in_use = await session.scalar(
        select(func.count(ClientService.id)).where(ClientService.service_id == service_id)
    )
    if in_use:
        # Keep history intact — retire it instead of breaking existing deadlines.
        row.is_active = False
        return Ok(message=f"{row.name} is assigned to {in_use} client(s); marked inactive instead.")

    await session.delete(row)
    return Ok(message="Service deleted")


@router.post("/services/seed-defaults", response_model=list[ServiceRead])
async def seed_defaults(session: SessionDep, user: AdminUserDep) -> list[ServiceRead]:
    """Re-install the built-in Canadian catalogue (existing codes are left alone)."""
    await session.execute(
        text("select public.seed_default_services(:tenant_id)"), {"tenant_id": str(user.tenant_id)}
    )
    await session.flush()
    rows = (
        await session.scalars(
            select(Service).where(Service.tenant_id == user.tenant_id).order_by(Service.category, Service.name)
        )
    ).all()
    return [read(ServiceRead, row) for row in rows]


# --- assignments --------------------------------------------------------------
@router.get("/client-services", response_model=list[ClientServiceRead])
async def list_assignments(
    session: SessionDep,
    user: TenantUserDep,
    client_id: uuid.UUID | None = None,
    service_id: uuid.UUID | None = None,
    active_only: bool = True,
) -> list[ClientServiceRead]:
    stmt = (
        select(ClientService, Service, Client)
        .join(Service, Service.id == ClientService.service_id)
        .join(Client, Client.id == ClientService.client_id)
        .where(ClientService.tenant_id == user.tenant_id)
    )
    if client_id:
        stmt = stmt.where(ClientService.client_id == client_id)
    if service_id:
        stmt = stmt.where(ClientService.service_id == service_id)
    if active_only:
        stmt = stmt.where(ClientService.is_active.is_(True))

    rows = (await session.execute(stmt.order_by(Client.legal_name, Service.name))).all()
    names = await profile_names(session, user.tenant_id)
    return [
        read(
            ClientServiceRead,
            assignment,
            service_name=service.name,
            service_code=service.code,
            client_name=client.legal_name,
            frequency=assignment.frequency_override or service.frequency,
            assignee_name=names.get(assignment.assignee_id),
        )
        for assignment, service, client in rows
    ]


@router.post("/client-services", response_model=ClientServiceRead, status_code=status.HTTP_201_CREATED)
async def assign_service(
    payload: ClientServiceCreate, session: SessionDep, user: TenantUserDep, request: Request
) -> ClientServiceRead:
    client = await session.scalar(
        select(Client).where(Client.id == payload.client_id, Client.tenant_id == user.tenant_id)
    )
    ensure_found(client, "Client")
    service = await session.scalar(
        select(Service).where(Service.id == payload.service_id, Service.tenant_id == user.tenant_id)
    )
    ensure_found(service, "Service")

    existing = await session.scalar(
        select(ClientService).where(
            ClientService.client_id == payload.client_id,
            ClientService.service_id == payload.service_id,
        )
    )
    if existing is not None:
        existing.is_active = True
        if payload.price is not None:
            existing.price = payload.price
        await session.flush()
        assignment = existing
    else:
        data = payload.model_dump(exclude_none=True)
        assignment = ClientService(tenant_id=user.tenant_id, **data)
        if assignment.price is None:
            assignment.price = service.default_price
        session.add(assignment)
        await session.flush()

    await audit.record(
        session,
        tenant_id=user.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="assigned",
        entity="client_service",
        entity_id=assignment.id,
        summary=f"Assigned {service.name} to {client.legal_name}",
        ip_address=client_ip(request),
    )

    # Project this one assignment forward into dated deadlines immediately,
    # rather than leaving it to the next manually-triggered /deadlines/generate
    # run — an admin assigning "Monthly Accounting" expects the compliance
    # calendar to reflect it right away, not after a separate step they have
    # to remember. Scoped to this client only (cheap; the dedup-safe
    # generator would otherwise redo every other client's projection too),
    # and silent (notify=False) since a single-assignment deadline batch
    # isn't worth its own "N deadlines added" notification on top of the
    # "assigned" audit entry just above.
    await generate_deadlines(
        session,
        tenant_id=user.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        client_id=client.id,
        ip_address=client_ip(request),
        notify=False,
    )

    names = await profile_names(session, user.tenant_id)
    return read(
        ClientServiceRead,
        assignment,
        service_name=service.name,
        service_code=service.code,
        client_name=client.legal_name,
        frequency=assignment.frequency_override or service.frequency,
        assignee_name=names.get(assignment.assignee_id),
    )


@router.patch("/client-services/{assignment_id}", response_model=ClientServiceRead)
async def update_assignment(
    assignment_id: uuid.UUID,
    payload: ClientServiceUpdate,
    session: SessionDep,
    user: TenantUserDep,
) -> ClientServiceRead:
    assignment = await session.scalar(
        select(ClientService).where(
            ClientService.id == assignment_id, ClientService.tenant_id == user.tenant_id
        )
    )
    ensure_found(assignment, "Assignment")
    apply_updates(assignment, payload)
    await session.flush()

    service = await session.get(Service, assignment.service_id)
    client = await session.get(Client, assignment.client_id)
    names = await profile_names(session, user.tenant_id)
    return read(
        ClientServiceRead,
        assignment,
        service_name=service.name if service else None,
        service_code=service.code if service else None,
        client_name=client.legal_name if client else None,
        frequency=assignment.frequency_override or (service.frequency if service else None),
        assignee_name=names.get(assignment.assignee_id),
    )


@router.delete("/client-services/{assignment_id}", response_model=Ok)
async def remove_assignment(
    assignment_id: uuid.UUID,
    session: SessionDep,
    user: TenantUserDep,
    drop_future_deadlines: bool = Query(default=True),
) -> Ok:
    assignment = await session.scalar(
        select(ClientService).where(
            ClientService.id == assignment_id, ClientService.tenant_id == user.tenant_id
        )
    )
    ensure_found(assignment, "Assignment")

    removed = 0
    if drop_future_deadlines:
        pending = (
            await session.scalars(
                select(Deadline).where(
                    Deadline.client_service_id == assignment.id,
                    Deadline.status == "open",
                    Deadline.is_auto.is_(True),
                )
            )
        ).all()
        for deadline in pending:
            await session.delete(deadline)
            removed += 1

    await session.delete(assignment)
    return Ok(message=f"Assignment removed ({removed} scheduled deadline(s) cleared)")
