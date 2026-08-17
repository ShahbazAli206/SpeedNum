"""Deadline (SLA) board plus the automatic compliance-calendar generator."""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Body, HTTPException, Query, Request, status
from sqlalchemy import select

from ..deps import SessionDep, TenantUserDep, client_ip
from ..models import Client, ClientService, Deadline, Project, Service, Task
from ..schemas import (
    DeadlineCreate,
    DeadlineGenerateRequest,
    DeadlineGenerateResult,
    DeadlineRead,
    DeadlineUpdate,
    Ok,
    ProjectRead,
)
from ..services import audit
from ..services.deadlines import plan_deadlines, urgency_for
from ..utils import apply_updates, ensure_found, now_utc, profile_names, read, today_utc

router = APIRouter(tags=["deadlines"])

WORKFLOW_CHECKLIST = (
    "Request records from client",
    "Prepare working papers",
    "Prepare the filing",
    "Partner review",
    "Send to client for approval",
    "File and archive confirmation",
)


def _decorate(row: Deadline, service_code: str | None, client_name: str | None, assignee: str | None):
    bucket, days = urgency_for(row.due_date, row.status, today_utc(), row.snoozed_until)
    return read(
        DeadlineRead,
        row,
        urgency=bucket,
        days_remaining=days,
        service_code=service_code,
        client_name=client_name,
        assignee_name=assignee,
    )


@router.get("/deadlines", response_model=list[DeadlineRead])
async def list_deadlines(
    session: SessionDep,
    user: TenantUserDep,
    client_id: uuid.UUID | None = None,
    assignee_id: uuid.UUID | None = None,
    service_id: uuid.UUID | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    urgency: str | None = Query(default=None, description="overdue | due_soon | upcoming"),
    due_before: date | None = None,
    due_after: date | None = None,
    limit: int = Query(default=500, ge=1, le=1000),
) -> list[DeadlineRead]:
    stmt = (
        select(Deadline, Client.legal_name, Service.code)
        .join(Client, Client.id == Deadline.client_id)
        .outerjoin(Service, Service.id == Deadline.service_id)
        .where(Deadline.tenant_id == user.tenant_id)
    )
    if client_id:
        stmt = stmt.where(Deadline.client_id == client_id)
    if assignee_id:
        stmt = stmt.where(Deadline.assignee_id == assignee_id)
    if service_id:
        stmt = stmt.where(Deadline.service_id == service_id)
    if status_filter:
        stmt = stmt.where(Deadline.status == status_filter)
    if due_before:
        stmt = stmt.where(Deadline.due_date <= due_before)
    if due_after:
        stmt = stmt.where(Deadline.due_date >= due_after)

    rows = (await session.execute(stmt.order_by(Deadline.due_date).limit(limit))).all()
    names = await profile_names(session, user.tenant_id)

    items = [
        _decorate(deadline, service_code, client_name, names.get(deadline.assignee_id))
        for deadline, client_name, service_code in rows
    ]
    if urgency:
        wanted = {u.strip() for u in urgency.split(",") if u.strip()}
        items = [item for item in items if item.urgency in wanted]
    return items


@router.post("/deadlines", response_model=DeadlineRead, status_code=status.HTTP_201_CREATED)
async def create_deadline(
    payload: DeadlineCreate, session: SessionDep, user: TenantUserDep
) -> DeadlineRead:
    client = await session.scalar(
        select(Client).where(Client.id == payload.client_id, Client.tenant_id == user.tenant_id)
    )
    ensure_found(client, "Client")

    row = Deadline(tenant_id=user.tenant_id, is_auto=False, **payload.model_dump())
    session.add(row)
    await session.flush()

    service_code = None
    if row.service_id:
        service_code = await session.scalar(select(Service.code).where(Service.id == row.service_id))
    names = await profile_names(session, user.tenant_id)
    return _decorate(row, service_code, client.legal_name, names.get(row.assignee_id))


@router.patch("/deadlines/{deadline_id}", response_model=DeadlineRead)
async def update_deadline(
    deadline_id: uuid.UUID, payload: DeadlineUpdate, session: SessionDep, user: TenantUserDep
) -> DeadlineRead:
    row = await session.scalar(
        select(Deadline).where(Deadline.id == deadline_id, Deadline.tenant_id == user.tenant_id)
    )
    ensure_found(row, "Deadline")
    apply_updates(row, payload)
    if row.status == "filed" and row.filed_at is None:
        row.filed_at = now_utc()
    await session.flush()
    return await _hydrate(session, user, row)


@router.post("/deadlines/{deadline_id}/file", response_model=DeadlineRead)
async def mark_filed(
    deadline_id: uuid.UUID, session: SessionDep, user: TenantUserDep, request: Request
) -> DeadlineRead:
    row = await session.scalar(
        select(Deadline).where(Deadline.id == deadline_id, Deadline.tenant_id == user.tenant_id)
    )
    ensure_found(row, "Deadline")
    row.status = "filed"
    row.filed_at = now_utc()
    await session.flush()

    await audit.record(
        session,
        tenant_id=user.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="filed",
        entity="deadline",
        entity_id=row.id,
        summary=f"Marked '{row.title}' as filed",
        ip_address=client_ip(request),
    )
    return await _hydrate(session, user, row)


@router.post("/deadlines/{deadline_id}/snooze", response_model=DeadlineRead)
async def snooze(
    deadline_id: uuid.UUID,
    session: SessionDep,
    user: TenantUserDep,
    until: date = Body(embed=True),
) -> DeadlineRead:
    row = await session.scalar(
        select(Deadline).where(Deadline.id == deadline_id, Deadline.tenant_id == user.tenant_id)
    )
    ensure_found(row, "Deadline")
    if until <= today_utc():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Snooze date must be in the future.")
    row.status = "snoozed"
    row.snoozed_until = until
    await session.flush()
    return await _hydrate(session, user, row)


@router.post("/deadlines/{deadline_id}/reopen", response_model=DeadlineRead)
async def reopen(deadline_id: uuid.UUID, session: SessionDep, user: TenantUserDep) -> DeadlineRead:
    row = await session.scalar(
        select(Deadline).where(Deadline.id == deadline_id, Deadline.tenant_id == user.tenant_id)
    )
    ensure_found(row, "Deadline")
    row.status = "open"
    row.snoozed_until = None
    row.filed_at = None
    await session.flush()
    return await _hydrate(session, user, row)


@router.post("/deadlines/{deadline_id}/dismiss", response_model=DeadlineRead)
async def dismiss(deadline_id: uuid.UUID, session: SessionDep, user: TenantUserDep) -> DeadlineRead:
    row = await session.scalar(
        select(Deadline).where(Deadline.id == deadline_id, Deadline.tenant_id == user.tenant_id)
    )
    ensure_found(row, "Deadline")
    row.status = "dismissed"
    await session.flush()
    return await _hydrate(session, user, row)


@router.delete("/deadlines/{deadline_id}", response_model=Ok)
async def delete_deadline(deadline_id: uuid.UUID, session: SessionDep, user: TenantUserDep) -> Ok:
    row = await session.scalar(
        select(Deadline).where(Deadline.id == deadline_id, Deadline.tenant_id == user.tenant_id)
    )
    ensure_found(row, "Deadline")
    await session.delete(row)
    return Ok(message="Deadline removed")


async def generate_deadlines(
    session: SessionDep,
    *,
    tenant_id: uuid.UUID,
    actor_id: uuid.UUID | None,
    actor_email: str | None,
    client_id: uuid.UUID | None = None,
    horizon_months: int = 18,
    ip_address: str | None = None,
    notify: bool = True,
) -> DeadlineGenerateResult:
    """Project every active service assignment forward into dated obligations.

    Extracted from the `POST /deadlines/generate` endpoint so
    `routers/services.py`'s `assign_service` can call the exact same
    dedup-safe logic scoped to one client right after creating the
    assignment, instead of leaving deadline generation as a separate
    manual step an admin has to remember to run (section 13's "the system
    must automatically establish the appropriate task/deadline lifecycle").
    """
    today = today_utc()
    window_start = today - timedelta(days=90)
    window_end = today + timedelta(days=int(horizon_months * 30.5))

    stmt = (
        select(ClientService, Client, Service)
        .join(Client, Client.id == ClientService.client_id)
        .join(Service, Service.id == ClientService.service_id)
        .where(
            ClientService.tenant_id == tenant_id,
            ClientService.is_active.is_(True),
            Service.is_active.is_(True),
            Client.status.in_(("active", "prospect")),
        )
    )
    if client_id:
        stmt = stmt.where(ClientService.client_id == client_id)

    assignments = (await session.execute(stmt)).all()
    if not assignments:
        return DeadlineGenerateResult(created=0, skipped=0, clients_processed=0)

    assignment_ids = [assignment.id for assignment, _, _ in assignments]
    existing_rows = await session.execute(
        select(Deadline.client_service_id, Deadline.period_end).where(
            Deadline.client_service_id.in_(assignment_ids)
        )
    )
    existing = {(cs_id, period_end) for cs_id, period_end in existing_rows}

    created = 0
    skipped = 0
    clients: set[uuid.UUID] = set()

    for assignment, client, service in assignments:
        clients.add(client.id)
        frequency = assignment.frequency_override or service.frequency
        planned = plan_deadlines(
            service_name=service.name,
            frequency=frequency,
            due_rule=service.due_rule,
            year_end_month=client.year_end_month,
            year_end_day=client.year_end_day,
            window_start=window_start,
            window_end=window_end,
            service_start=assignment.start_date,
            service_end=assignment.end_date,
        )
        for item in planned:
            if (assignment.id, item.period_end) in existing:
                skipped += 1
                continue
            session.add(
                Deadline(
                    tenant_id=tenant_id,
                    client_id=client.id,
                    service_id=service.id,
                    client_service_id=assignment.id,
                    title=item.title,
                    period_label=item.period_label,
                    period_start=item.period_start,
                    period_end=item.period_end,
                    due_date=item.due_date,
                    assignee_id=assignment.assignee_id,
                    is_auto=True,
                )
            )
            existing.add((assignment.id, item.period_end))
            created += 1

    await session.flush()

    if created:
        await audit.record(
            session,
            tenant_id=tenant_id,
            actor_id=actor_id,
            actor_email=actor_email,
            action="generated",
            entity="deadline",
            summary=f"Generated {created} deadline(s) across {len(clients)} client(s)",
            metadata={"created": created, "skipped": skipped},
            ip_address=ip_address,
        )
        if notify:
            await audit.notify(
                session,
                tenant_id=tenant_id,
                type="deadline",
                title=f"{created} new deadlines added to your calendar",
                body=f"Covering {len(clients)} client(s) over the next {horizon_months} months.",
                link="/deadlines",
            )

    return DeadlineGenerateResult(created=created, skipped=skipped, clients_processed=len(clients))


@router.post("/deadlines/generate", response_model=DeadlineGenerateResult)
async def generate(
    payload: DeadlineGenerateRequest, session: SessionDep, user: TenantUserDep, request: Request
) -> DeadlineGenerateResult:
    return await generate_deadlines(
        session,
        tenant_id=user.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        client_id=payload.client_id,
        horizon_months=payload.horizon_months,
        ip_address=client_ip(request),
    )


@router.post("/deadlines/{deadline_id}/workflow", response_model=ProjectRead, status_code=201)
async def create_workflow(
    deadline_id: uuid.UUID, session: SessionDep, user: TenantUserDep
) -> ProjectRead:
    """Spin up a project with the standard checklist for a filing."""
    row = await session.scalar(
        select(Deadline).where(Deadline.id == deadline_id, Deadline.tenant_id == user.tenant_id)
    )
    ensure_found(row, "Deadline")

    if row.project_id:
        existing = await session.get(Project, row.project_id)
        if existing is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "A workflow already exists for this deadline.")

    client = await session.get(Client, row.client_id)
    project = Project(
        tenant_id=user.tenant_id,
        client_id=row.client_id,
        service_id=row.service_id,
        name=row.title,
        period_label=row.period_label,
        period_start=row.period_start,
        period_end=row.period_end,
        due_date=row.due_date,
        assignee_id=row.assignee_id,
        status="not_started",
    )
    session.add(project)
    await session.flush()

    for index, title in enumerate(WORKFLOW_CHECKLIST):
        session.add(
            Task(
                tenant_id=user.tenant_id,
                project_id=project.id,
                client_id=row.client_id,
                title=title,
                status="todo",
                priority="medium",
                assignee_id=row.assignee_id,
                due_date=row.due_date,
                position=index,
                created_by=user.profile.id,
            )
        )

    row.project_id = project.id
    await session.flush()

    names = await profile_names(session, user.tenant_id)
    return read(
        ProjectRead,
        project,
        client_name=client.legal_name if client else None,
        assignee_name=names.get(project.assignee_id),
        task_count=len(WORKFLOW_CHECKLIST),
        completed_tasks=0,
    )


async def _hydrate(session: SessionDep, user: TenantUserDep, row: Deadline) -> DeadlineRead:
    client_name = await session.scalar(select(Client.legal_name).where(Client.id == row.client_id))
    service_code = None
    if row.service_id:
        service_code = await session.scalar(select(Service.code).where(Service.id == row.service_id))
    names = await profile_names(session, user.tenant_id)
    return _decorate(row, service_code, client_name, names.get(row.assignee_id))
