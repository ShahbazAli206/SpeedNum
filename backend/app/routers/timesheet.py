"""Timesheet: daily staff attendance (first-login/confirmed-logout) plus a
read/adjust view over client-task hours already tracked by TaskTimer.

Two tabs, two authorization shapes, same split as everywhere else in this
codebase: the company Owner (OwnerOrSuperadminDep — is_firm_owner's own
dependency, see deps.require_owner_or_superadmin) can see, edit, export and
filter every staff member's records; a plain staff member (TenantUserDep)
can only view their own, on the `/me` endpoints.

Attendance rows are written by services/attendance.py, hooked into
services/local_auth.issue_tokens (login) and the logout-confirm endpoint
below (explicit staff confirmation only — never a raw session end). Client
task hours are not a new table: they read/adjust the existing
routers/task_timers.py TaskTimer rows, joined with Task/Client/Profile for
display.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Query
from sqlalchemy import select

from ..deps import OwnerOrSuperadminDep, SessionDep, TenantUserDep
from ..models import AttendanceDay, Client, Profile, Task, TaskTimer
from ..schemas import AttendanceDayRead, AttendanceDayUpdate, TaskHourRead, TaskHourUpdate
from ..services.attendance import record_logout_confirm, worked_seconds
from ..utils import apply_updates, ensure_found, now_utc, read, today_utc

router = APIRouter(prefix="/timesheet", tags=["timesheet"])

# A month-ish window when no explicit range is given — generous enough to
# cover "this month" plus a few trailing days without the caller needing to
# compute exact month boundaries just to see something on first load.
_DEFAULT_WINDOW_DAYS = 31


def _default_range(start_date: date | None, end_date: date | None) -> tuple[date, date]:
    end = end_date or today_utc()
    start = start_date or (end - timedelta(days=_DEFAULT_WINDOW_DAYS))
    return start, end


async def _hydrate_attendance(session: SessionDep, rows: list[AttendanceDay]) -> list[AttendanceDayRead]:
    if not rows:
        return []
    profile_ids = {row.profile_id for row in rows}
    profiles = (
        await session.execute(
            select(Profile.id, Profile.full_name, Profile.email, Profile.role).where(
                Profile.id.in_(profile_ids)
            )
        )
    ).all()
    by_id = {p.id: p for p in profiles}
    out: list[AttendanceDayRead] = []
    for row in rows:
        profile = by_id.get(row.profile_id)
        out.append(
            read(
                AttendanceDayRead,
                row,
                profile_name=(profile.full_name or profile.email) if profile else None,
                role=profile.role if profile else None,
                worked_seconds=worked_seconds(row),
            )
        )
    return out


# --- attendance: staff self-view ------------------------------------------
@router.get("/attendance/me", response_model=list[AttendanceDayRead])
async def my_attendance(
    session: SessionDep,
    user: TenantUserDep,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[AttendanceDayRead]:
    start, end = _default_range(start_date, end_date)
    rows = (
        await session.scalars(
            select(AttendanceDay)
            .where(
                AttendanceDay.profile_id == user.profile.id,
                AttendanceDay.work_date >= start,
                AttendanceDay.work_date <= end,
            )
            .order_by(AttendanceDay.work_date.desc())
        )
    ).all()
    return await _hydrate_attendance(session, list(rows))


@router.post("/attendance/logout-confirm", response_model=AttendanceDayRead)
async def confirm_logout(session: SessionDep, user: TenantUserDep) -> AttendanceDayRead:
    """Staff explicitly answered "yes" to "Is this your job end time?" on
    Logout. Banks now() as today's end_time — overwriting an earlier
    confirmed logout the same day, since the ask is "first login, *last*
    confirmed logout" of the day. Called just before the actual sign-out
    request while the access token is still valid."""
    row = await record_logout_confirm(session, user.profile)
    hydrated = await _hydrate_attendance(session, [row])
    return hydrated[0]


# --- attendance: owner management ------------------------------------------
@router.get("/attendance", response_model=list[AttendanceDayRead])
async def list_attendance(
    session: SessionDep,
    user: OwnerOrSuperadminDep,
    start_date: date | None = None,
    end_date: date | None = None,
    profile_id: uuid.UUID | None = None,
    role: str | None = None,
) -> list[AttendanceDayRead]:
    start, end = _default_range(start_date, end_date)
    stmt = select(AttendanceDay).where(
        AttendanceDay.tenant_id == user.tenant_id,
        AttendanceDay.work_date >= start,
        AttendanceDay.work_date <= end,
    )
    if profile_id:
        stmt = stmt.where(AttendanceDay.profile_id == profile_id)
    if role:
        role_profile_ids = (
            await session.scalars(
                select(Profile.id).where(Profile.tenant_id == user.tenant_id, Profile.role == role)
            )
        ).all()
        stmt = stmt.where(AttendanceDay.profile_id.in_(role_profile_ids))
    rows = (await session.scalars(stmt.order_by(AttendanceDay.work_date.desc()))).all()
    return await _hydrate_attendance(session, list(rows))


@router.patch("/attendance/{attendance_id}", response_model=AttendanceDayRead)
async def update_attendance(
    attendance_id: uuid.UUID, payload: AttendanceDayUpdate, session: SessionDep, user: OwnerOrSuperadminDep
) -> AttendanceDayRead:
    row = await session.scalar(
        select(AttendanceDay).where(AttendanceDay.id == attendance_id, AttendanceDay.tenant_id == user.tenant_id)
    )
    row = ensure_found(row, "Attendance record")
    apply_updates(row, payload)
    await session.flush()
    hydrated = await _hydrate_attendance(session, [row])
    return hydrated[0]


# --- client task hours -----------------------------------------------------
async def _hydrate_task_hours(session: SessionDep, timers: list[TaskTimer]) -> list[TaskHourRead]:
    if not timers:
        return []
    task_ids = {t.task_id for t in timers}
    assignee_ids = {t.assignee_id for t in timers}
    tasks = {t.id: t for t in (await session.scalars(select(Task).where(Task.id.in_(task_ids)))).all()}
    client_ids = {t.client_id for t in tasks.values() if t.client_id}
    clients = (
        {
            c.id: c.legal_name
            for c in (await session.scalars(select(Client).where(Client.id.in_(client_ids)))).all()
        }
        if client_ids
        else {}
    )
    profiles = (
        await session.execute(
            select(Profile.id, Profile.full_name, Profile.email).where(Profile.id.in_(assignee_ids))
        )
    ).all()
    profile_names = {p.id: (p.full_name or p.email) for p in profiles}

    out: list[TaskHourRead] = []
    for timer in timers:
        task = tasks.get(timer.task_id)
        if task is None:
            continue
        live_elapsed = 0
        if timer.status == "running" and timer.started_at is not None:
            live_elapsed = max(0, int((now_utc() - timer.started_at).total_seconds()))
        out.append(
            TaskHourRead(
                id=timer.id,
                task_id=timer.task_id,
                task_title=task.title,
                client_id=task.client_id,
                client_name=clients.get(task.client_id) if task.client_id else None,
                assignee_id=timer.assignee_id,
                assignee_name=profile_names.get(timer.assignee_id),
                status="running" if timer.status == "running" else "stopped",
                accumulated_seconds=timer.accumulated_seconds,
                started_at=timer.started_at if timer.status == "running" else None,
                last_stopped_at=timer.last_stopped_at,
                total_seconds=timer.accumulated_seconds + live_elapsed,
            )
        )
    return out


@router.get("/task-hours/me", response_model=list[TaskHourRead])
async def my_task_hours(session: SessionDep, user: TenantUserDep) -> list[TaskHourRead]:
    timers = (
        await session.scalars(
            select(TaskTimer).where(
                TaskTimer.tenant_id == user.tenant_id, TaskTimer.assignee_id == user.profile.id
            )
        )
    ).all()
    return await _hydrate_task_hours(session, list(timers))


@router.get("/task-hours", response_model=list[TaskHourRead])
async def list_task_hours(
    session: SessionDep,
    user: OwnerOrSuperadminDep,
    assignee_id: uuid.UUID | None = None,
    client_id: uuid.UUID | None = None,
) -> list[TaskHourRead]:
    stmt = select(TaskTimer).where(TaskTimer.tenant_id == user.tenant_id)
    if assignee_id:
        stmt = stmt.where(TaskTimer.assignee_id == assignee_id)
    if client_id:
        task_ids = (
            await session.scalars(
                select(Task.id).where(Task.tenant_id == user.tenant_id, Task.client_id == client_id)
            )
        ).all()
        stmt = stmt.where(TaskTimer.task_id.in_(task_ids))
    timers = (await session.scalars(stmt)).all()
    return await _hydrate_task_hours(session, list(timers))


@router.patch("/task-hours/{timer_id}", response_model=TaskHourRead)
async def update_task_hours(
    timer_id: uuid.UUID, payload: TaskHourUpdate, session: SessionDep, user: OwnerOrSuperadminDep
) -> TaskHourRead:
    timer = await session.scalar(
        select(TaskTimer).where(TaskTimer.id == timer_id, TaskTimer.tenant_id == user.tenant_id)
    )
    timer = ensure_found(timer, "Time entry")
    timer.accumulated_seconds = payload.accumulated_seconds
    await session.flush()
    hydrated = await _hydrate_task_hours(session, [timer])
    return hydrated[0]
