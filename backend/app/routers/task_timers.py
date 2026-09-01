"""Per-task, per-assignee time tracking — the small digital timer an assignee
starts/stops from Task Master, shown live in the firm sidebar and reflected
in each task's "time spent" figure for anyone who can already see that task.

Staff-only (TenantUserDep), the same reach as the rest of Task Master.
Client-portal task visibility doesn't exist at all yet (see
task_attachments.py's own docstring), so there is nothing for a client-portal
login to reach here either — this router has no client-portal counterpart.

One timer row per (task_id, assignee_id) pair — reassigning a task later
doesn't erase a previous assignee's own logged time, it just starts a fresh
row for whoever picks it up next. Only the task's *current* assignee may
start or stop their own row; nobody can drive another profile's timer, not
even an Owner. A database-level partial unique index
(task_timers_one_running_per_assignee) guarantees one running timer per
assignee tenant-wide; start_task_timer double-checks it first for a clean 409
instead of a raw constraint violation.

Every endpoint here is idempotent on purpose: a second tab, a retried
request, or the tab-close auto-stop beacon racing a manual Stop click should
never surface as an error, just return the current state.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from ..deps import SessionDep, TenantUserDep
from ..models import Client, Task, TaskTimer
from ..schemas import TaskTimerRead
from ..utils import ensure_found, now_utc

router = APIRouter(prefix="/tasks", tags=["workflows"])


async def _load_task(session: SessionDep, user: TenantUserDep, task_id: uuid.UUID) -> Task:
    task = await session.scalar(select(Task).where(Task.id == task_id, Task.tenant_id == user.tenant_id))
    return ensure_found(task, "Task")


def _assert_is_assignee(user: TenantUserDep, task: Task) -> None:
    if task.assignee_id != user.profile.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only this task's assignee can control its timer.")


async def _read_timer(session: SessionDep, task: Task, timer: TaskTimer | None) -> TaskTimerRead:
    client_name = None
    if task.client_id:
        client_name = await session.scalar(select(Client.legal_name).where(Client.id == task.client_id))
    return TaskTimerRead(
        task_id=task.id,
        task_title=task.title,
        client_id=task.client_id,
        client_name=client_name,
        status=timer.status if timer and timer.status == "running" else "stopped",
        accumulated_seconds=timer.accumulated_seconds if timer else 0,
        started_at=timer.started_at if timer and timer.status == "running" else None,
    )


@router.get("/{task_id}/timer", response_model=TaskTimerRead)
async def get_task_timer(task_id: uuid.UUID, session: SessionDep, user: TenantUserDep) -> TaskTimerRead:
    """The caller's own timer state on this task — lets Task Master's detail
    page word its button ("Start" vs "Resume") before the caller clicks
    anything. Same reach as workflows.py's get_task: any tenant staff who can
    open this task's detail page by id can read this."""
    task = await _load_task(session, user, task_id)
    timer = await session.scalar(
        select(TaskTimer).where(TaskTimer.task_id == task_id, TaskTimer.assignee_id == user.profile.id)
    )
    return await _read_timer(session, task, timer)


@router.get("/timers/active", response_model=TaskTimerRead | None)
async def get_active_timer(session: SessionDep, user: TenantUserDep) -> TaskTimerRead | None:
    """The caller's single running timer, if any, across every task — powers
    the persistent sidebar widget so it survives a page reload or a fresh
    tab without the assignee re-clicking Start."""
    timer = await session.scalar(
        select(TaskTimer).where(TaskTimer.assignee_id == user.profile.id, TaskTimer.status == "running")
    )
    if timer is None:
        return None
    task = await session.scalar(select(Task).where(Task.id == timer.task_id, Task.tenant_id == user.tenant_id))
    if task is None:
        # Orphaned by a deleted task — clear it rather than surfacing a
        # timer the sidebar can never resolve a title for.
        await session.delete(timer)
        return None
    return await _read_timer(session, task, timer)


@router.post("/{task_id}/timer/start", response_model=TaskTimerRead)
async def start_task_timer(task_id: uuid.UUID, session: SessionDep, user: TenantUserDep) -> TaskTimerRead:
    """Start or resume the caller's own timer on this task. The confirmation
    popup ("Are you sure you're starting this for {client}?") is entirely a
    frontend concern — by the time this is called the assignee has already
    confirmed, so this just does the work."""
    task = await _load_task(session, user, task_id)
    _assert_is_assignee(user, task)

    other_running = await session.scalar(
        select(TaskTimer).where(
            TaskTimer.assignee_id == user.profile.id,
            TaskTimer.status == "running",
            TaskTimer.task_id != task_id,
        )
    )
    if other_running is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "You already have a timer running on another task. Stop it before starting a new one.",
        )

    timer = await session.scalar(
        select(TaskTimer).where(TaskTimer.task_id == task_id, TaskTimer.assignee_id == user.profile.id)
    )
    if timer is None:
        timer = TaskTimer(tenant_id=user.tenant_id, task_id=task_id, assignee_id=user.profile.id)
        session.add(timer)
    elif timer.status == "running":
        return await _read_timer(session, task, timer)  # already running — idempotent

    timer.status = "running"
    timer.started_at = now_utc()
    await session.flush()
    return await _read_timer(session, task, timer)


@router.post("/{task_id}/timer/stop", response_model=TaskTimerRead)
async def stop_task_timer(task_id: uuid.UUID, session: SessionDep, user: TenantUserDep) -> TaskTimerRead:
    """Stop (pause) the caller's own timer on this task, banking the elapsed
    seconds. Called from the sidebar's Stop button (after its own confirm
    popup) and from the tab-close/logout auto-stop path — both hit the exact
    same endpoint, since either way the intent is "bank what's elapsed and
    stop the clock"."""
    task = await _load_task(session, user, task_id)
    _assert_is_assignee(user, task)

    timer = await session.scalar(
        select(TaskTimer).where(TaskTimer.task_id == task_id, TaskTimer.assignee_id == user.profile.id)
    )
    if timer is None or timer.status != "running" or timer.started_at is None:
        return await _read_timer(session, task, timer)  # already stopped — idempotent

    timer.accumulated_seconds += max(0, int((now_utc() - timer.started_at).total_seconds()))
    timer.started_at = None
    timer.status = "stopped"
    timer.last_stopped_at = now_utc()
    await session.flush()
    return await _read_timer(session, task, timer)
