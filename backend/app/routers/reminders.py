"""Reminders board — the countdown side of the compliance calendar.

Distinct from /deadlines (the obligations themselves) and /notifications (the
read/unread feed). A reminder is a threshold crossing that someone has to look
at: "10 days left on Lakeview Dental's T2". Acknowledging one does not file the
deadline, and filing the deadline retires its remaining reminders.

The sweep is exposed as an endpoint rather than an in-process scheduler so it
can be driven by whatever the host provides — a Render cron job, a Supabase
scheduled function, or the UI's "Check now" button. It is idempotent, so calling
it more often than needed costs nothing but a query.
"""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import Select, desc, func, or_, select, update

from ..config import settings
from ..deps import AdminUserDep, SessionDep, TenantUserDep, client_ip
from ..models import Client, Deadline, Reminder, Tenant
from ..schemas import (
    Ok,
    ReminderBoard,
    ReminderCounts,
    ReminderRead,
    ReminderSnoozeRequest,
    ReminderSweepResult,
)
from ..services import audit, plan_expiry, reminders as engine
from ..services.email import reminder_digest_html, send_email, sender_name
from ..utils import ensure_found, now_utc, profile_names, read, today_utc

router = APIRouter(prefix="/reminders", tags=["reminders"])

# Statuses that still want a human's attention; "done" and "dismissed" don't.
LIVE_STATUSES = ("open", "acknowledged", "snoozed")


def _urgency(due: date, today: date) -> str:
    days = (due - today).days
    if days < 0:
        return "overdue"
    if days == 0:
        return "due_today"
    if days <= 10:
        return "due_soon"
    return "upcoming"


def _decorate(row: Reminder, today: date, client_name: str | None, assignee: str | None) -> ReminderRead:
    return read(
        ReminderRead,
        row,
        client_name=client_name,
        assignee_name=assignee,
        days_remaining=(row.due_date - today).days,
        urgency=_urgency(row.due_date, today),
    )


def _visible_to(stmt: Select, user: TenantUserDep) -> Select:
    """Non-admin staff see firm-wide reminders plus the ones assigned to them;
    owners and admins see everything, because chasing other people's overdue
    work is exactly their job."""
    if user.is_admin:
        return stmt
    return stmt.where(
        or_(Reminder.assignee_id.is_(None), Reminder.assignee_id == user.profile.id)
    )


@router.get("", response_model=ReminderBoard)
async def list_reminders(
    session: SessionDep,
    user: TenantUserDep,
    status_filter: str | None = Query(default=None, alias="status"),
    kind: str | None = None,
    severity: str | None = None,
    client_id: uuid.UUID | None = None,
    assignee_id: uuid.UUID | None = None,
    include_resolved: bool = Query(
        default=False, description="Also return done/dismissed reminders."
    ),
    limit: int = Query(default=300, ge=1, le=1000),
) -> ReminderBoard:
    today = today_utc()

    stmt = select(Reminder).where(Reminder.tenant_id == user.tenant_id)
    stmt = _visible_to(stmt, user)

    if status_filter:
        stmt = stmt.where(Reminder.status == status_filter)
    elif not include_resolved:
        stmt = stmt.where(Reminder.status.in_(LIVE_STATUSES))
    if kind:
        stmt = stmt.where(Reminder.kind == kind)
    if severity:
        stmt = stmt.where(Reminder.severity == severity)
    if client_id:
        stmt = stmt.where(Reminder.client_id == client_id)
    if assignee_id:
        stmt = stmt.where(Reminder.assignee_id == assignee_id)

    rows = (
        await session.scalars(stmt.order_by(Reminder.due_date, desc(Reminder.created_at)).limit(limit))
    ).all()

    client_names: dict[uuid.UUID, str] = {}
    ids = [row.client_id for row in rows if row.client_id]
    if ids:
        client_names = {
            cid: (business or legal)
            for cid, legal, business in (
                await session.execute(
                    select(Client.id, Client.legal_name, Client.business_name).where(
                        Client.id.in_(ids), Client.tenant_id == user.tenant_id
                    )
                )
            ).all()
        }
    assignees = await profile_names(session, user.tenant_id)

    items = [
        _decorate(row, today, client_names.get(row.client_id), assignees.get(row.assignee_id))
        for row in rows
    ]

    counts = ReminderCounts()
    for item in items:
        if item.status in LIVE_STATUSES:
            counts.open += 1
        if item.status == "open":
            counts.unacknowledged += 1
        if item.urgency == "overdue":
            counts.overdue += 1
        elif item.urgency == "due_today":
            counts.due_today += 1
        elif item.urgency == "due_soon":
            counts.due_soon += 1
        else:
            counts.upcoming += 1

    return ReminderBoard(generated_at=now_utc(), counts=counts, reminders=items)


@router.get("/unread-count", response_model=ReminderCounts)
async def unread_count(session: SessionDep, user: TenantUserDep) -> ReminderCounts:
    """Cheap poll for the sidebar badge — counts only, no rows."""
    stmt = select(Reminder.due_date, Reminder.status).where(
        Reminder.tenant_id == user.tenant_id, Reminder.status.in_(LIVE_STATUSES)
    )
    rows = (await session.execute(_visible_to(stmt, user))).all()

    today = today_utc()
    counts = ReminderCounts()
    for due, row_status in rows:
        counts.open += 1
        if row_status == "open":
            counts.unacknowledged += 1
        bucket = _urgency(due, today)
        setattr(counts, bucket, getattr(counts, bucket) + 1)
    return counts


async def _load(session: SessionDep, user: TenantUserDep, reminder_id: uuid.UUID) -> Reminder:
    row = await session.scalar(
        select(Reminder).where(Reminder.id == reminder_id, Reminder.tenant_id == user.tenant_id)
    )
    return ensure_found(row, "Reminder")


async def _hydrate(session: SessionDep, user: TenantUserDep, row: Reminder) -> ReminderRead:
    client_name = None
    if row.client_id:
        client_name = await session.scalar(
            select(func.coalesce(Client.business_name, Client.legal_name)).where(
                Client.id == row.client_id
            )
        )
    assignees = await profile_names(session, user.tenant_id)
    return _decorate(row, today_utc(), client_name, assignees.get(row.assignee_id))


@router.post("/{reminder_id}/acknowledge", response_model=ReminderRead)
async def acknowledge(
    reminder_id: uuid.UUID, session: SessionDep, user: TenantUserDep
) -> ReminderRead:
    row = await _load(session, user, reminder_id)
    row.status = "acknowledged"
    row.acknowledged_at = now_utc()
    row.acknowledged_by = user.profile.id
    row.snoozed_until = None
    await session.flush()
    return await _hydrate(session, user, row)


@router.post("/{reminder_id}/snooze", response_model=ReminderRead)
async def snooze(
    reminder_id: uuid.UUID,
    payload: ReminderSnoozeRequest,
    session: SessionDep,
    user: TenantUserDep,
) -> ReminderRead:
    row = await _load(session, user, reminder_id)
    if payload.until <= today_utc():
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Snooze date must be in the future."
        )
    row.status = "snoozed"
    row.snoozed_until = payload.until
    await session.flush()
    return await _hydrate(session, user, row)


@router.post("/{reminder_id}/done", response_model=ReminderRead)
async def mark_done(
    reminder_id: uuid.UUID, session: SessionDep, user: TenantUserDep, request: Request
) -> ReminderRead:
    """Resolve the reminder and, when it came from a deadline, file that
    deadline too — otherwise the next sweep immediately raises the following
    threshold for work the user has just told us is finished."""
    row = await _load(session, user, reminder_id)
    row.status = "done"
    row.acknowledged_at = now_utc()
    row.acknowledged_by = user.profile.id

    if row.deadline_id:
        deadline = await session.scalar(
            select(Deadline).where(
                Deadline.id == row.deadline_id, Deadline.tenant_id == user.tenant_id
            )
        )
        if deadline is not None and deadline.status in ("open", "snoozed"):
            deadline.status = "filed"
            deadline.filed_at = now_utc()
            await audit.record(
                session,
                tenant_id=user.tenant_id,
                actor_id=user.profile.id,
                actor_email=user.profile.email,
                action="filed",
                entity="deadline",
                entity_id=deadline.id,
                summary=f"Filed '{deadline.title}' from its reminder",
                ip_address=client_ip(request),
            )
            await _retire_siblings(session, user.tenant_id, deadline_id=deadline.id, keep=row.id)

    await session.flush()
    return await _hydrate(session, user, row)


@router.post("/{reminder_id}/dismiss", response_model=ReminderRead)
async def dismiss(reminder_id: uuid.UUID, session: SessionDep, user: TenantUserDep) -> ReminderRead:
    row = await _load(session, user, reminder_id)
    row.status = "dismissed"
    await session.flush()
    return await _hydrate(session, user, row)


@router.post("/{reminder_id}/reopen", response_model=ReminderRead)
async def reopen(reminder_id: uuid.UUID, session: SessionDep, user: TenantUserDep) -> ReminderRead:
    row = await _load(session, user, reminder_id)
    row.status = "open"
    row.snoozed_until = None
    row.acknowledged_at = None
    row.acknowledged_by = None
    await session.flush()
    return await _hydrate(session, user, row)


@router.post("/acknowledge-all", response_model=Ok)
async def acknowledge_all(session: SessionDep, user: TenantUserDep) -> Ok:
    stmt = (
        update(Reminder)
        .where(
            Reminder.tenant_id == user.tenant_id,
            Reminder.status == "open",
        )
        .values(status="acknowledged", acknowledged_at=now_utc(), acknowledged_by=user.profile.id)
    )
    if not user.is_admin:
        stmt = stmt.where(
            or_(Reminder.assignee_id.is_(None), Reminder.assignee_id == user.profile.id)
        )
    result = await session.execute(stmt)
    return Ok(message=f"{result.rowcount or 0} reminder(s) acknowledged")


async def _retire_siblings(
    session: SessionDep, tenant_id: uuid.UUID, *, deadline_id: uuid.UUID, keep: uuid.UUID
) -> None:
    """Once a deadline is filed, its other open reminders are noise."""
    await session.execute(
        update(Reminder)
        .where(
            Reminder.tenant_id == tenant_id,
            Reminder.deadline_id == deadline_id,
            Reminder.id != keep,
            Reminder.status.in_(LIVE_STATUSES),
        )
        .values(status="done")
    )


@router.delete("/{reminder_id}", response_model=Ok)
async def delete_reminder(
    reminder_id: uuid.UUID, session: SessionDep, user: AdminUserDep
) -> Ok:
    row = await _load(session, user, reminder_id)
    await session.delete(row)
    return Ok(message="Reminder removed")


@router.post("/run", response_model=ReminderSweepResult)
async def run_sweep(
    session: SessionDep,
    user: AdminUserDep,
    send_emails: bool = Query(default=True, description="Email owners/admins about new reminders."),
) -> ReminderSweepResult:
    """Generate reminders for this firm and email the owners/admins about any
    that are new. Safe to call repeatedly — see services/reminders.py.

    Admin-gated: this sends mail to every owner and administrator of the firm,
    so it should not be triggerable by any staff member who finds the button.
    The daily sweep (services/scheduler.py) is what normally drives this;
    "Check now" on the reminders board is the manual escape hatch.
    """
    tenant = await session.get(Tenant, user.tenant_id)
    ensure_found(tenant, "Firm")
    result = await sweep_tenant(session, tenant, send_emails=send_emails)

    return ReminderSweepResult(
        **result.as_dict(),
        message=(
            f"{result.created} new reminder(s) from {result.scanned} open item(s)."
            if result.created
            else f"Nothing new — {result.scanned} open item(s) checked."
        ),
    )


async def sweep_tenant(
    session: SessionDep, tenant: Tenant, *, send_emails: bool = True
) -> engine.SweepResult:
    """Shared by POST /reminders/run and the cross-tenant superadmin sweep."""
    today = today_utc()
    # Company-level plan / server-domain expiry reminders (0024) ride the same
    # per-tenant sweep — independent of whether any work-item reminders fire, so
    # it must run before the early return below.
    await plan_expiry.sweep_tenant_expiry(session, tenant, today=today)
    planned = await engine.collect(session, tenant, today=today)
    created = await engine.persist(session, tenant.id, planned)

    result = engine.SweepResult(
        created=len(created),
        skipped=len(planned) - len(created),
        scanned=len(planned),
    )
    if not created:
        return result

    # Mirror each new reminder into the notification feed so the bell picks it
    # up. profile_id follows the reminder's assignee: unassigned work is the
    # whole firm's problem and shows for everyone.
    for row in created:
        await audit.notify(
            session,
            tenant_id=tenant.id,
            profile_id=row.assignee_id,
            type=f"{row.kind}_reminder",
            title=row.title,
            body=row.body,
            link="/reminders",
        )

    if send_emails:
        recipients = await engine.admin_recipients(session, tenant.id)
        items = [
            {
                "title": row.title,
                "body": row.body,
                "due_date": row.due_date.isoformat(),
                "severity": row.severity,
                "link": row.link,
            }
            for row in created
        ]
        for recipient in recipients:
            delivered = await send_email(
                to=recipient.email,
                subject=(
                    f"{len(created)} reminder{'' if len(created) == 1 else 's'} "
                    f"from {tenant.name}"
                ),
                html=reminder_digest_html(
                    firm_name=tenant.name,
                    recipient_name=(recipient.full_name or recipient.email).split()[0],
                    items=items,
                    app_url=settings.public_app_url,
                    brand_color=tenant.brand_color,
                ),
                from_name=sender_name(tenant.name, tenant.email_from_name),
            )
            if delivered:
                result.emailed += 1

        if result.emailed:
            stamped = now_utc()
            for row in created:
                row.emailed_at = stamped

    await audit.record(
        session,
        tenant_id=tenant.id,
        action="generated",
        entity="reminder",
        summary=f"Raised {len(created)} reminder(s)",
        metadata=result.as_dict(),
    )
    await session.flush()
    return result
