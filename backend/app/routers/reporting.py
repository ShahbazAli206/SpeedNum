"""Practice analytics."""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from ..deps import SessionDep, TenantUserDep
from ..models import Client, ClientService, Deadline, EngagementLetter, Profile, Service, Task
from ..schemas import ReportingResponse
from ..utils import as_float, now_utc, today_utc

router = APIRouter(tags=["reporting"])

OPEN_TASK_STATES = ("todo", "in_progress", "review", "blocked")
PERIODS_PER_YEAR = {"annual": 1, "semi_annual": 2, "quarterly": 4, "monthly": 12, "one_time": 1}
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


@router.get("/reporting", response_model=ReportingResponse)
async def reporting(
    session: SessionDep,
    user: TenantUserDep,
    horizon_months: int = Query(default=12, ge=3, le=24),
) -> ReportingResponse:
    tenant_id = user.tenant_id
    today = today_utc()

    status_rows = (
        await session.execute(
            select(Client.status, func.count(Client.id))
            .where(Client.tenant_id == tenant_id)
            .group_by(Client.status)
        )
    ).all()
    clients_by_status = [{"key": key, "count": count} for key, count in status_rows]

    type_rows = (
        await session.execute(
            select(Client.client_type, func.count(Client.id))
            .where(Client.tenant_id == tenant_id)
            .group_by(Client.client_type)
        )
    ).all()
    clients_by_type = [{"key": key, "count": count} for key, count in type_rows]

    revenue_rows = (
        await session.execute(
            select(
                Service.name,
                Service.category,
                Service.frequency,
                ClientService.frequency_override,
                ClientService.price,
                Service.default_price,
            )
            .join(Service, Service.id == ClientService.service_id)
            .where(ClientService.tenant_id == tenant_id, ClientService.is_active.is_(True))
        )
    ).all()
    revenue_map: dict[str, dict] = {}
    for name, category, frequency, override, price, default_price in revenue_rows:
        annual = as_float(price if price is not None else default_price) * PERIODS_PER_YEAR.get(
            override or frequency, 1
        )
        entry = revenue_map.setdefault(name, {"key": name, "category": category, "amount": 0.0, "clients": 0})
        entry["amount"] += annual
        entry["clients"] += 1
    revenue_by_service = sorted(
        ({**v, "amount": round(v["amount"], 2)} for v in revenue_map.values()),
        key=lambda item: -item["amount"],
    )

    horizon_end = today + timedelta(days=int(horizon_months * 30.5))
    deadline_rows = (
        await session.execute(
            select(Deadline.due_date, Deadline.status).where(
                Deadline.tenant_id == tenant_id,
                Deadline.due_date >= today.replace(day=1),
                Deadline.due_date <= horizon_end,
            )
        )
    ).all()
    month_map: dict[tuple[int, int], dict] = {}
    cursor = date(today.year, today.month, 1)
    for _ in range(horizon_months):
        month_map[(cursor.year, cursor.month)] = {
            "key": f"{MONTHS[cursor.month - 1]} {str(cursor.year)[2:]}",
            "count": 0,
            "filed": 0,
        }
        cursor = date(cursor.year + (cursor.month == 12), (cursor.month % 12) + 1, 1)
    for due, status_value in deadline_rows:
        bucket = month_map.get((due.year, due.month))
        if bucket is None:
            continue
        bucket["count"] += 1
        if status_value == "filed":
            bucket["filed"] += 1
    deadlines_by_month = list(month_map.values())

    task_rows = (
        await session.execute(
            select(Task.status, func.count(Task.id))
            .where(Task.tenant_id == tenant_id)
            .group_by(Task.status)
        )
    ).all()
    tasks_by_status = [{"key": key, "count": count} for key, count in task_rows]

    workload_rows = (
        await session.execute(
            select(
                Profile.full_name,
                Profile.email,
                Profile.weekly_capacity,
                func.count(Task.id).filter(Task.status.in_(OPEN_TASK_STATES)),
                func.coalesce(func.sum(Task.estimate_hours).filter(Task.status.in_(OPEN_TASK_STATES)), 0),
            )
            .outerjoin(Task, Task.assignee_id == Profile.id)
            .where(Profile.tenant_id == tenant_id, Profile.is_active.is_(True))
            .group_by(Profile.id, Profile.full_name, Profile.email, Profile.weekly_capacity)
        )
    ).all()
    workload = [
        {
            "key": full_name or email,
            "open_tasks": count,
            "estimated_hours": as_float(hours),
            "weekly_capacity": capacity,
        }
        for full_name, email, capacity, count, hours in workload_rows
    ]

    filed_rows = (
        await session.execute(
            select(Deadline.due_date, Deadline.filed_at).where(
                Deadline.tenant_id == tenant_id, Deadline.status == "filed", Deadline.filed_at.is_not(None)
            )
        )
    ).all()
    on_time = sum(1 for due, filed_at in filed_rows if filed_at.date() <= due)
    on_time_rate = round(on_time / len(filed_rows) * 100, 1) if filed_rows else 100.0

    total_fees = await session.scalar(
        select(func.coalesce(func.sum(Client.annual_fee), 0)).where(
            Client.tenant_id == tenant_id, Client.status == "active"
        )
    )
    active_clients = await session.scalar(
        select(func.count(Client.id)).where(Client.tenant_id == tenant_id, Client.status == "active")
    ) or 0

    letter_rows = (
        await session.execute(
            select(EngagementLetter.status, func.count(EngagementLetter.id))
            .where(EngagementLetter.tenant_id == tenant_id)
            .group_by(EngagementLetter.status)
        )
    ).all()
    letters = {key: count for key, count in letter_rows}

    return ReportingResponse(
        generated_at=now_utc(),
        clients_by_status=clients_by_status,
        clients_by_type=clients_by_type,
        revenue_by_service=revenue_by_service,
        deadlines_by_month=deadlines_by_month,
        tasks_by_status=tasks_by_status,
        workload=workload,
        on_time_filing_rate=on_time_rate,
        total_annual_fees=as_float(total_fees),
        average_fee=round(as_float(total_fees) / active_clients, 2) if active_clients else 0.0,
        letters=letters,
    )
