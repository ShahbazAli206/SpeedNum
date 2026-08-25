"""Client CRM: records, contacts and their service assignments."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select

from ..deps import AdminUserDep, SessionDep, TenantUserDep, client_ip
from ..models import Client, ClientService, Contact, Deadline, Profile, Service, Task
from ..schemas import (
    ClientCreate,
    ClientRead,
    ClientServiceCreate,
    ClientServiceRead,
    ClientServiceUpdate,
    ClientUpdate,
    ContactCreate,
    ContactRead,
    ContactUpdate,
    Ok,
    PortalInviteResult,
)
from ..services import accounts, audit
from ..services.accounts import AccountError
from ..services.rate_limit import rate_limit_by_tenant
from ..utils import apply_updates, ensure_found, now_utc, profile_names, read, today_utc

router = APIRouter(tags=["clients"])

# Same reasoning as team.py's/users.py's identically-shaped limit — portal
# invites create a client-portal login, the same kind of account-creation
# action, just from a different surface.
_portal_invite_rate_limit = rate_limit_by_tenant("clients-portal-invite", limit=20, window_seconds=3600)

OPEN_TASK_STATES = ("todo", "in_progress", "review", "blocked")

# A client with no fee yet (0, e.g. a prospect) is fine; a nonzero fee below
# this is almost always a typo (missing a digit) rather than an intentional
# rate, so it's rejected rather than silently stored.
MIN_ANNUAL_FEE = 50


def _check_annual_fee(annual_fee: float | None) -> None:
    if annual_fee is not None and 0 < annual_fee < MIN_ANNUAL_FEE:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Annual fee must be at least ${MIN_ANNUAL_FEE}, or 0 if none yet.",
        )


async def _aggregates(session: SessionDep, client_ids: list[uuid.UUID]) -> dict[uuid.UUID, dict]:
    if not client_ids:
        return {}

    today = today_utc()
    out: dict[uuid.UUID, dict] = {
        cid: {
            "open_tasks": 0,
            "open_deadlines": 0,
            "overdue_deadlines": 0,
            "next_due_date": None,
            "service_count": 0,
        }
        for cid in client_ids
    }

    task_rows = await session.execute(
        select(Task.client_id, func.count(Task.id))
        .where(Task.client_id.in_(client_ids), Task.status.in_(OPEN_TASK_STATES))
        .group_by(Task.client_id)
    )
    for cid, count in task_rows:
        out[cid]["open_tasks"] = count

    deadline_rows = await session.execute(
        select(
            Deadline.client_id,
            func.count(Deadline.id),
            func.count(Deadline.id).filter(Deadline.due_date < today),
            func.min(Deadline.due_date),
        )
        .where(Deadline.client_id.in_(client_ids), Deadline.status.in_(("open", "snoozed")))
        .group_by(Deadline.client_id)
    )
    for cid, total, overdue, next_due in deadline_rows:
        out[cid]["open_deadlines"] = total
        out[cid]["overdue_deadlines"] = overdue
        out[cid]["next_due_date"] = next_due

    service_rows = await session.execute(
        select(ClientService.client_id, func.count(ClientService.id))
        .where(ClientService.client_id.in_(client_ids), ClientService.is_active.is_(True))
        .group_by(ClientService.client_id)
    )
    for cid, count in service_rows:
        out[cid]["service_count"] = count

    return out


@router.get("/clients", response_model=list[ClientRead])
async def list_clients(
    session: SessionDep,
    user: TenantUserDep,
    search: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    client_type: str | None = None,
    owner_id: uuid.UUID | None = None,
    tag: str | None = None,
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    sort: str = Query(default="legal_name"),
) -> list[ClientRead]:
    stmt = select(Client).where(Client.tenant_id == user.tenant_id)

    if search:
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Client.legal_name.ilike(pattern),
                Client.business_name.ilike(pattern),
                Client.email.ilike(pattern),
                Client.code.ilike(pattern),
                Client.city.ilike(pattern),
            )
        )
    if status_filter:
        stmt = stmt.where(Client.status == status_filter)
    if client_type:
        stmt = stmt.where(Client.client_type == client_type)
    if owner_id:
        stmt = stmt.where(Client.owner_id == owner_id)
    if tag:
        stmt = stmt.where(Client.tags.any(tag))

    sort_map = {
        "legal_name": Client.legal_name.asc(),
        "-legal_name": Client.legal_name.desc(),
        "created_at": Client.created_at.asc(),
        "-created_at": Client.created_at.desc(),
        "annual_fee": Client.annual_fee.asc(),
        "-annual_fee": Client.annual_fee.desc(),
    }
    stmt = stmt.order_by(sort_map.get(sort, Client.legal_name.asc())).limit(limit).offset(offset)

    rows = (await session.scalars(stmt)).all()
    aggregates = await _aggregates(session, [row.id for row in rows])
    names = await profile_names(session, user.tenant_id)

    return [
        read(
            ClientRead,
            row,
            owner_name=names.get(row.owner_id),
            **aggregates.get(row.id, {}),
        )
        for row in rows
    ]


@router.post("/clients", response_model=ClientRead, status_code=status.HTTP_201_CREATED)
async def create_client(
    payload: ClientCreate, session: SessionDep, user: TenantUserDep, request: Request
) -> ClientRead:
    _check_annual_fee(payload.annual_fee)
    row = Client(tenant_id=user.tenant_id, created_by=user.profile.id, **payload.model_dump())
    session.add(row)
    await session.flush()

    await audit.record(
        session,
        tenant_id=user.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="created",
        entity="client",
        entity_id=row.id,
        summary=f"Added client {row.legal_name}",
        ip_address=client_ip(request),
    )
    names = await profile_names(session, user.tenant_id)
    return read(ClientRead, row, owner_name=names.get(row.owner_id))


@router.get("/clients/{client_id}", response_model=ClientRead)
async def get_client(client_id: uuid.UUID, session: SessionDep, user: TenantUserDep) -> ClientRead:
    row = await session.scalar(
        select(Client).where(Client.id == client_id, Client.tenant_id == user.tenant_id)
    )
    ensure_found(row, "Client")
    aggregates = await _aggregates(session, [row.id])
    names = await profile_names(session, user.tenant_id)
    return read(ClientRead, row, owner_name=names.get(row.owner_id), **aggregates.get(row.id, {}))


@router.patch("/clients/{client_id}", response_model=ClientRead)
async def update_client(
    client_id: uuid.UUID,
    payload: ClientUpdate,
    session: SessionDep,
    user: TenantUserDep,
    request: Request,
) -> ClientRead:
    _check_annual_fee(payload.annual_fee)
    row = await session.scalar(
        select(Client).where(Client.id == client_id, Client.tenant_id == user.tenant_id)
    )
    ensure_found(row, "Client")

    changed = apply_updates(row, payload)
    await session.flush()

    if changed:
        await audit.record(
            session,
            tenant_id=user.tenant_id,
            actor_id=user.profile.id,
            actor_email=user.profile.email,
            action="updated",
            entity="client",
            entity_id=row.id,
            summary=f"Updated {row.legal_name} ({', '.join(changed)})",
            ip_address=client_ip(request),
        )

    aggregates = await _aggregates(session, [row.id])
    names = await profile_names(session, user.tenant_id)
    return read(ClientRead, row, owner_name=names.get(row.owner_id), **aggregates.get(row.id, {}))


@router.delete("/clients/{client_id}", response_model=Ok)
async def delete_client(
    client_id: uuid.UUID, session: SessionDep, user: AdminUserDep, request: Request
) -> Ok:
    """Admin-gated: this is a hard delete of the client and everything FK'd to
    it (deadlines, tasks, letters, files) — too destructive to leave open to
    any staff member the way read/update access is."""
    row = await session.scalar(
        select(Client).where(Client.id == client_id, Client.tenant_id == user.tenant_id)
    )
    ensure_found(row, "Client")
    name = row.legal_name
    await session.delete(row)
    await audit.record(
        session,
        tenant_id=user.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="deleted",
        entity="client",
        entity_id=client_id,
        summary=f"Deleted client {name}",
        ip_address=client_ip(request),
    )
    return Ok(message=f"Deleted {name}")


@router.post(
    "/clients/{client_id}/portal-invite",
    response_model=PortalInviteResult,
    dependencies=[Depends(_portal_invite_rate_limit)],
)
async def invite_to_portal(
    client_id: uuid.UUID, session: SessionDep, user: TenantUserDep, request: Request
) -> PortalInviteResult:
    """Send (or resend) the client's portal welcome email.

    First call: creates a local-auth login (services/accounts.provision) and a
    `profiles` row pinned to this client. Later calls — the client record's
    "Resend welcome email" button — reuse that same login and only rotate its
    password, since the original is never retrievable once it's Argon2id-hashed;
    a magic sign-in link is regenerated too, as the previous one may have
    expired.
    """
    client = await session.scalar(
        select(Client).where(Client.id == client_id, Client.tenant_id == user.tenant_id)
    )
    ensure_found(client, "Client")
    if not client.email:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Add a primary email to this client before inviting them to the portal.",
        )

    email = client.email.strip().lower()
    existing_profile = await session.scalar(select(Profile).where(Profile.client_id == client_id))

    try:
        if existing_profile is None:
            result = await accounts.provision(
                session,
                tenant=user.tenant,
                email=email,
                full_name=client.business_name or client.legal_name,
                client_id=client_id,
                reply_to=user.profile.email,
            )
        else:
            existing_profile.email = email
            result = await accounts.reissue(
                session,
                tenant=user.tenant,
                profile=existing_profile,
                reply_to=user.profile.email,
            )
    except AccountError as exc:
        raise HTTPException(exc.status_code, str(exc)) from exc

    email_sent = result.email_sent

    client.portal_enabled = True
    client.portal_invited_at = now_utc()
    client.portal_invited_by = user.profile.id
    await session.flush()

    await audit.record(
        session,
        tenant_id=user.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="invited" if existing_profile is None else "reinvited",
        entity="client_portal",
        entity_id=client.id,
        summary=f"{'Invited' if existing_profile is None else 'Resent portal invite to'} {client.legal_name}",
        ip_address=client_ip(request),
    )

    return PortalInviteResult(
        email=email,
        invited_at=client.portal_invited_at,
        email_sent=email_sent,
        temp_password=result.temp_password,
        login_url=accounts.login_url(),
        message=(
            "Welcome email sent."
            if email_sent
            else "Portal login is ready, but email delivery isn't configured — share the credentials manually."
        ),
    )


# --- contacts -----------------------------------------------------------------
@router.get("/clients/{client_id}/contacts", response_model=list[ContactRead])
async def list_contacts(
    client_id: uuid.UUID, session: SessionDep, user: TenantUserDep
) -> list[ContactRead]:
    rows = (
        await session.scalars(
            select(Contact)
            .where(Contact.client_id == client_id, Contact.tenant_id == user.tenant_id)
            .order_by(Contact.is_primary.desc(), Contact.full_name)
        )
    ).all()
    return [ContactRead.model_validate(row) for row in rows]


@router.post("/contacts", response_model=ContactRead, status_code=status.HTTP_201_CREATED)
async def create_contact(
    payload: ContactCreate, session: SessionDep, user: TenantUserDep
) -> ContactRead:
    owner = await session.scalar(
        select(Client.id).where(Client.id == payload.client_id, Client.tenant_id == user.tenant_id)
    )
    if owner is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")

    row = Contact(tenant_id=user.tenant_id, **payload.model_dump())
    session.add(row)
    await session.flush()

    if row.is_primary:
        await _demote_other_primaries(session, row)
    return ContactRead.model_validate(row)


@router.patch("/contacts/{contact_id}", response_model=ContactRead)
async def update_contact(
    contact_id: uuid.UUID, payload: ContactUpdate, session: SessionDep, user: TenantUserDep
) -> ContactRead:
    row = await session.scalar(
        select(Contact).where(Contact.id == contact_id, Contact.tenant_id == user.tenant_id)
    )
    ensure_found(row, "Contact")
    apply_updates(row, payload)
    await session.flush()
    if row.is_primary:
        await _demote_other_primaries(session, row)
    return ContactRead.model_validate(row)


@router.delete("/contacts/{contact_id}", response_model=Ok)
async def delete_contact(contact_id: uuid.UUID, session: SessionDep, user: TenantUserDep) -> Ok:
    row = await session.scalar(
        select(Contact).where(Contact.id == contact_id, Contact.tenant_id == user.tenant_id)
    )
    ensure_found(row, "Contact")
    await session.delete(row)
    return Ok(message="Contact removed")


async def _demote_other_primaries(session: SessionDep, contact: Contact) -> None:
    others = (
        await session.scalars(
            select(Contact).where(
                Contact.client_id == contact.client_id,
                Contact.id != contact.id,
                Contact.is_primary.is_(True),
            )
        )
    ).all()
    for other in others:
        other.is_primary = False


# --- service assignments for a client ----------------------------------------
@router.get("/clients/{client_id}/services", response_model=list[ClientServiceRead])
async def list_client_services(
    client_id: uuid.UUID, session: SessionDep, user: TenantUserDep
) -> list[ClientServiceRead]:
    rows = (
        await session.execute(
            select(ClientService, Service)
            .join(Service, Service.id == ClientService.service_id)
            .where(ClientService.client_id == client_id, ClientService.tenant_id == user.tenant_id)
            .order_by(Service.name)
        )
    ).all()
    names = await profile_names(session, user.tenant_id)
    return [
        read(
            ClientServiceRead,
            assignment,
            service_name=service.name,
            service_code=service.code,
            frequency=assignment.frequency_override or service.frequency,
            assignee_name=names.get(assignment.assignee_id),
        )
        for assignment, service in rows
    ]


@router.post(
    "/clients/{client_id}/services", response_model=ClientServiceRead, status_code=status.HTTP_201_CREATED
)
async def assign_client_service(
    client_id: uuid.UUID,
    payload: ClientServiceCreate,
    session: SessionDep,
    user: TenantUserDep,
    request: Request,
) -> ClientServiceRead:
    client = await session.scalar(
        select(Client).where(Client.id == client_id, Client.tenant_id == user.tenant_id)
    )
    ensure_found(client, "Client")
    service = await session.scalar(
        select(Service).where(Service.id == payload.service_id, Service.tenant_id == user.tenant_id)
    )
    ensure_found(service, "Service")

    row = ClientService(
        tenant_id=user.tenant_id,
        client_id=client_id,
        service_id=service.id,
        price=payload.price,
        frequency_override=payload.frequency_override,
        assignee_id=payload.assignee_id,
        start_date=payload.start_date or today_utc(),
        end_date=payload.end_date,
        notes=payload.notes,
    )
    session.add(row)
    await session.flush()

    await audit.record(
        session,
        tenant_id=user.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="service_assigned",
        entity="client",
        entity_id=client.id,
        summary=f"Assigned {service.name} to {client.legal_name}",
        ip_address=client_ip(request),
    )

    names = await profile_names(session, user.tenant_id)
    return read(
        ClientServiceRead,
        row,
        service_name=service.name,
        service_code=service.code,
        frequency=row.frequency_override or service.frequency,
        assignee_name=names.get(row.assignee_id),
    )


@router.patch("/clients/{client_id}/services/{assignment_id}", response_model=ClientServiceRead)
async def update_client_service(
    client_id: uuid.UUID,
    assignment_id: uuid.UUID,
    payload: ClientServiceUpdate,
    session: SessionDep,
    user: TenantUserDep,
) -> ClientServiceRead:
    row = await session.scalar(
        select(ClientService).where(
            ClientService.id == assignment_id,
            ClientService.client_id == client_id,
            ClientService.tenant_id == user.tenant_id,
        )
    )
    ensure_found(row, "Service assignment")
    apply_updates(row, payload)
    await session.flush()

    service = await session.get(Service, row.service_id)
    names = await profile_names(session, user.tenant_id)
    return read(
        ClientServiceRead,
        row,
        service_name=service.name if service else None,
        service_code=service.code if service else None,
        frequency=row.frequency_override or (service.frequency if service else None),
        assignee_name=names.get(row.assignee_id),
    )


@router.delete("/clients/{client_id}/services/{assignment_id}", response_model=Ok)
async def remove_client_service(
    client_id: uuid.UUID, assignment_id: uuid.UUID, session: SessionDep, user: TenantUserDep
) -> Ok:
    row = await session.scalar(
        select(ClientService).where(
            ClientService.id == assignment_id,
            ClientService.client_id == client_id,
            ClientService.tenant_id == user.tenant_id,
        )
    )
    ensure_found(row, "Service assignment")
    await session.delete(row)
    return Ok(message="Service removed")
