"""Practice overview shown on the landing screen after login."""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter
from sqlalchemy import desc, func, select

from ..deps import SessionDep, TenantUserDep
from ..models import AuditLog, Client, ClientInvoice, ClientService, Deadline, EngagementLetter, Profile, Service, Task
from ..schemas import AuditLogRead, DashboardResponse, DeadlineBuckets, RevenueSummary
from ..services.deadlines import urgency_for
from ..utils import as_float, profile_names, today_utc
from .deadlines import _decorate

router = APIRouter(tags=["dashboard"])

OPEN_TASK_STATES = ("todo", "in_progress", "review", "blocked")
PERIODS_PER_YEAR = {"annual": 1, "semi_annual": 2, "quarterly": 4, "monthly": 12, "one_time": 1}


def summarise_invoice_revenue(rows: list[tuple[str, object]]) -> RevenueSummary:
    """Turn `(status, sum(amount+tax))` rows — already grouped by status and
    already excluding void invoices — into the four real, invoice-derived
    figures. An unpaid invoice is never counted as paid (section 20's explicit
    requirement); `outstanding` is everything not yet paid, `overdue` is the
    subset of that which is also overdue, so `overdue <= outstanding` always.
    """
    summary = RevenueSummary()
    for invoice_status, total in rows:
        amount = as_float(total)
        summary.invoiced += amount
        if invoice_status == "paid":
            summary.paid += amount
        elif invoice_status == "sent":
            summary.outstanding += amount
        elif invoice_status == "overdue":
            summary.outstanding += amount
            summary.overdue += amount
    summary.invoiced = round(summary.invoiced, 2)
    summary.paid = round(summary.paid, 2)
    summary.outstanding = round(summary.outstanding, 2)
    summary.overdue = round(summary.overdue, 2)
    return summary


@router.get("/dashboard", response_model=DashboardResponse)
async def dashboard(session: SessionDep, user: TenantUserDep) -> DashboardResponse:
    tenant_id = user.tenant_id
    today = today_utc()
    month_start = date(today.year, today.month, 1)
    week_end = today + timedelta(days=7)

    clients_total = await session.scalar(
        select(func.count(Client.id)).where(Client.tenant_id == tenant_id)
    ) or 0
    clients_active = await session.scalar(
        select(func.count(Client.id)).where(Client.tenant_id == tenant_id, Client.status == "active")
    ) or 0

    # Urgency is derived from due_date at read time, so pull the open rows once.
    open_rows = (
        await session.execute(
            select(Deadline.due_date, Deadline.status, Deadline.snoozed_until).where(
                Deadline.tenant_id == tenant_id, Deadline.status.in_(("open", "snoozed"))
            )
        )
    ).all()
    buckets = DeadlineBuckets()
    for due, status_value, snoozed in open_rows:
        bucket, _ = urgency_for(due, status_value, today, snoozed)
        if bucket == "overdue":
            buckets.overdue += 1
        elif bucket == "due_soon":
            buckets.due_soon += 1
        elif bucket == "upcoming":
            buckets.upcoming += 1
    buckets.filed_this_month = await session.scalar(
        select(func.count(Deadline.id)).where(
            Deadline.tenant_id == tenant_id,
            Deadline.status == "filed",
            Deadline.filed_at >= month_start,
        )
    ) or 0

    tasks_open = await session.scalar(
        select(func.count(Task.id)).where(
            Task.tenant_id == tenant_id, Task.status.in_(OPEN_TASK_STATES)
        )
    ) or 0
    tasks_due_this_week = await session.scalar(
        select(func.count(Task.id)).where(
            Task.tenant_id == tenant_id,
            Task.status.in_(OPEN_TASK_STATES),
            Task.due_date.is_not(None),
            Task.due_date <= week_end,
        )
    ) or 0

    letters_awaiting = await session.scalar(
        select(func.count(EngagementLetter.id)).where(
            EngagementLetter.tenant_id == tenant_id,
            EngagementLetter.status.in_(("sent", "viewed")),
        )
    ) or 0

    revenue_rows = (
        await session.execute(
            select(ClientService.price, Service.default_price, Service.frequency, ClientService.frequency_override)
            .join(Service, Service.id == ClientService.service_id)
            .where(ClientService.tenant_id == tenant_id, ClientService.is_active.is_(True))
        )
    ).all()
    revenue = 0.0
    for price, default_price, frequency, override in revenue_rows:
        unit = as_float(price if price is not None else default_price)
        revenue += unit * PERIODS_PER_YEAR.get(override or frequency, 1)

    # Real invoice-derived figures, distinct from the contract-value
    # projection above — an unpaid invoice is never counted as paid revenue
    # (section 20's explicit requirement). `total` is amount+tax so
    # outstanding/overdue reflect what a client actually owes, not the
    # pre-tax line-item price.
    invoice_total = (ClientInvoice.amount + ClientInvoice.tax)
    invoice_rows = (
        await session.execute(
            select(ClientInvoice.status, func.coalesce(func.sum(invoice_total), 0))
            .where(ClientInvoice.tenant_id == tenant_id, ClientInvoice.status != "void")
            .group_by(ClientInvoice.status)
        )
    ).all()
    revenue_summary = summarise_invoice_revenue(invoice_rows)

    upcoming_rows = (
        await session.execute(
            select(Deadline, Client.legal_name, Service.code)
            .join(Client, Client.id == Deadline.client_id)
            .outerjoin(Service, Service.id == Deadline.service_id)
            .where(Deadline.tenant_id == tenant_id, Deadline.status.in_(("open", "snoozed")))
            .order_by(Deadline.due_date)
            .limit(8)
        )
    ).all()
    names = await profile_names(session, tenant_id)
    next_deadlines = [
        _decorate(deadline, code, client_name, names.get(deadline.assignee_id))
        for deadline, client_name, code in upcoming_rows
    ]

    activity_rows = (
        await session.scalars(
            select(AuditLog)
            .where(AuditLog.tenant_id == tenant_id)
            .order_by(desc(AuditLog.created_at))
            .limit(8)
        )
    ).all()
    recent_activity = [
        AuditLogRead(
            id=row.id,
            actor_email=row.actor_email,
            action=row.action,
            entity=row.entity,
            entity_id=row.entity_id,
            summary=row.summary,
            created_at=row.created_at,
        )
        for row in activity_rows
    ]

    workload_rows = (
        await session.execute(
            select(
                Profile.id,
                Profile.full_name,
                Profile.email,
                func.count(Task.id).filter(Task.status.in_(OPEN_TASK_STATES)),
            )
            .outerjoin(Task, Task.assignee_id == Profile.id)
            .where(Profile.tenant_id == tenant_id, Profile.is_active.is_(True))
            .group_by(Profile.id, Profile.full_name, Profile.email)
            .order_by(desc(func.count(Task.id).filter(Task.status.in_(OPEN_TASK_STATES))))
        )
    ).all()
    workload = [
        {"id": str(pid), "name": full_name or email, "open_tasks": count}
        for pid, full_name, email, count in workload_rows
    ]

    return DashboardResponse(
        firm_name=user.tenant.name,
        clients_total=clients_total,
        clients_active=clients_active,
        deadlines=buckets,
        tasks_open=tasks_open,
        tasks_due_this_week=tasks_due_this_week,
        letters_awaiting_signature=letters_awaiting,
        revenue_under_contract=round(revenue, 2),
        revenue=revenue_summary,
        next_deadlines=next_deadlines,
        recent_activity=recent_activity,
        workload=workload,
    )
