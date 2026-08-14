"""Task Master: recurring projects and the kanban task board."""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select

from ..deps import SessionDep, TenantUserDep, client_ip
from ..models import Client, Project, Task
from ..schemas import (
    Ok,
    ProjectCreate,
    ProjectRead,
    ProjectUpdate,
    TaskCreate,
    TaskMove,
    TaskRead,
    TaskUpdate,
)
from ..services import audit
from ..utils import apply_updates, ensure_found, now_utc, profile_names, read, today_utc

router = APIRouter(tags=["workflows"])

OPEN_TASK_STATES = ("todo", "in_progress", "review", "blocked")


# --- projects -----------------------------------------------------------------
@router.get("/projects", response_model=list[ProjectRead])
async def list_projects(
    session: SessionDep,
    user: TenantUserDep,
    client_id: uuid.UUID | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    assignee_id: uuid.UUID | None = None,
    limit: int = Query(default=200, ge=1, le=500),
) -> list[ProjectRead]:
    stmt = (
        select(Project, Client.legal_name)
        .join(Client, Client.id == Project.client_id)
        .where(Project.tenant_id == user.tenant_id)
    )
    if client_id:
        stmt = stmt.where(Project.client_id == client_id)
    if status_filter:
        stmt = stmt.where(Project.status == status_filter)
    if assignee_id:
        stmt = stmt.where(Project.assignee_id == assignee_id)

    rows = (
        await session.execute(stmt.order_by(Project.due_date.nulls_last(), Project.name).limit(limit))
    ).all()

    project_ids = [project.id for project, _ in rows]
    task_counts: dict[uuid.UUID, tuple[int, int]] = {}
    if project_ids:
        count_rows = await session.execute(
            select(
                Task.project_id,
                func.count(Task.id),
                func.count(Task.id).filter(Task.status == "complete"),
            )
            .where(Task.project_id.in_(project_ids))
            .group_by(Task.project_id)
        )
        task_counts = {pid: (total, done) for pid, total, done in count_rows}

    names = await profile_names(session, user.tenant_id)
    return [
        read(
            ProjectRead,
            project,
            client_name=client_name,
            assignee_name=names.get(project.assignee_id),
            task_count=task_counts.get(project.id, (0, 0))[0],
            completed_tasks=task_counts.get(project.id, (0, 0))[1],
        )
        for project, client_name in rows
    ]


@router.post("/projects", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate, session: SessionDep, user: TenantUserDep
) -> ProjectRead:
    client = await session.scalar(
        select(Client).where(Client.id == payload.client_id, Client.tenant_id == user.tenant_id)
    )
    ensure_found(client, "Client")

    project = Project(tenant_id=user.tenant_id, **payload.model_dump())
    session.add(project)
    await session.flush()

    names = await profile_names(session, user.tenant_id)
    return read(
        ProjectRead,
        project,
        client_name=client.legal_name,
        assignee_name=names.get(project.assignee_id),
    )


@router.patch("/projects/{project_id}", response_model=ProjectRead)
async def update_project(
    project_id: uuid.UUID, payload: ProjectUpdate, session: SessionDep, user: TenantUserDep
) -> ProjectRead:
    project = await session.scalar(
        select(Project).where(Project.id == project_id, Project.tenant_id == user.tenant_id)
    )
    ensure_found(project, "Project")
    apply_updates(project, payload)
    await session.flush()

    client = await session.get(Client, project.client_id)
    names = await profile_names(session, user.tenant_id)
    return read(
        ProjectRead,
        project,
        client_name=client.legal_name if client else None,
        assignee_name=names.get(project.assignee_id),
    )


@router.delete("/projects/{project_id}", response_model=Ok)
async def delete_project(project_id: uuid.UUID, session: SessionDep, user: TenantUserDep) -> Ok:
    project = await session.scalar(
        select(Project).where(Project.id == project_id, Project.tenant_id == user.tenant_id)
    )
    ensure_found(project, "Project")
    await session.delete(project)
    return Ok(message="Workflow deleted")


# --- tasks --------------------------------------------------------------------
@router.get("/tasks", response_model=list[TaskRead])
async def list_tasks(
    session: SessionDep,
    user: TenantUserDep,
    client_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    assignee_id: uuid.UUID | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    priority: str | None = None,
    search: str | None = None,
    due_within_days: int | None = Query(default=None, ge=0, le=365),
    open_only: bool = False,
    limit: int = Query(default=500, ge=1, le=1000),
) -> list[TaskRead]:
    stmt = select(Task).where(Task.tenant_id == user.tenant_id)

    if client_id:
        stmt = stmt.where(Task.client_id == client_id)
    if project_id:
        stmt = stmt.where(Task.project_id == project_id)
    if assignee_id:
        stmt = stmt.where(Task.assignee_id == assignee_id)
    if status_filter:
        stmt = stmt.where(Task.status == status_filter)
    if priority:
        stmt = stmt.where(Task.priority == priority)
    if open_only:
        stmt = stmt.where(Task.status.in_(OPEN_TASK_STATES))
    if search:
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(or_(Task.title.ilike(pattern), Task.description.ilike(pattern)))
    if due_within_days is not None:
        stmt = stmt.where(Task.due_date <= today_utc() + timedelta(days=due_within_days))

    rows = (await session.scalars(stmt.order_by(Task.status, Task.position, Task.created_at).limit(limit))).all()

    client_names = dict(
        (
            await session.execute(
                select(Client.id, Client.legal_name).where(Client.tenant_id == user.tenant_id)
            )
        ).all()
    )
    project_names = dict(
        (
            await session.execute(
                select(Project.id, Project.name).where(Project.tenant_id == user.tenant_id)
            )
        ).all()
    )
    names = await profile_names(session, user.tenant_id)

    return [
        read(
            TaskRead,
            row,
            client_name=client_names.get(row.client_id),
            project_name=project_names.get(row.project_id),
            assignee_name=names.get(row.assignee_id),
        )
        for row in rows
    ]


async def _next_position(session: SessionDep, tenant_id: uuid.UUID, status_value: str) -> int:
    current = await session.scalar(
        select(func.max(Task.position)).where(Task.tenant_id == tenant_id, Task.status == status_value)
    )
    return (current or 0) + 1


@router.post("/tasks", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
async def create_task(
    payload: TaskCreate, session: SessionDep, user: TenantUserDep, request: Request
) -> TaskRead:
    data = payload.model_dump()
    if data.get("project_id") and not data.get("client_id"):
        project = await session.scalar(
            select(Project).where(Project.id == data["project_id"], Project.tenant_id == user.tenant_id)
        )
        ensure_found(project, "Project")
        data["client_id"] = project.client_id

    if data.get("position") is None:
        data["position"] = await _next_position(session, user.tenant_id, data["status"])

    task = Task(tenant_id=user.tenant_id, created_by=user.profile.id, **data)
    if task.status == "complete":
        task.completed_at = now_utc()
    session.add(task)
    await session.flush()

    await audit.record(
        session,
        tenant_id=user.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="created",
        entity="task",
        entity_id=task.id,
        summary=f"Created task '{task.title}'",
        ip_address=client_ip(request),
    )

    return await _hydrate_task(session, user, task)


@router.get("/tasks/{task_id}", response_model=TaskRead)
async def get_task(task_id: uuid.UUID, session: SessionDep, user: TenantUserDep) -> TaskRead:
    task = await session.scalar(
        select(Task).where(Task.id == task_id, Task.tenant_id == user.tenant_id)
    )
    ensure_found(task, "Task")
    return await _hydrate_task(session, user, task)


@router.patch("/tasks/{task_id}", response_model=TaskRead)
async def update_task(
    task_id: uuid.UUID, payload: TaskUpdate, session: SessionDep, user: TenantUserDep
) -> TaskRead:
    task = await session.scalar(
        select(Task).where(Task.id == task_id, Task.tenant_id == user.tenant_id)
    )
    ensure_found(task, "Task")

    previous_status = task.status
    apply_updates(task, payload)

    if task.status == "complete" and previous_status != "complete":
        task.completed_at = now_utc()
    elif task.status != "complete":
        task.completed_at = None

    await session.flush()
    return await _hydrate_task(session, user, task)


@router.post("/tasks/{task_id}/move", response_model=TaskRead)
async def move_task(
    task_id: uuid.UUID, payload: TaskMove, session: SessionDep, user: TenantUserDep
) -> TaskRead:
    task = await session.scalar(
        select(Task).where(Task.id == task_id, Task.tenant_id == user.tenant_id)
    )
    ensure_found(task, "Task")

    previous_status = task.status
    task.status = payload.status
    task.position = payload.position

    if payload.status == "complete" and previous_status != "complete":
        task.completed_at = now_utc()
    elif payload.status != "complete":
        task.completed_at = None

    # Re-space the destination column so positions stay stable and unique.
    siblings = (
        await session.scalars(
            select(Task)
            .where(
                Task.tenant_id == user.tenant_id,
                Task.status == payload.status,
                Task.id != task.id,
            )
            .order_by(Task.position, Task.created_at)
        )
    ).all()

    ordered = siblings[: payload.position] + [task] + siblings[payload.position :]
    for index, item in enumerate(ordered):
        item.position = index

    await session.flush()
    return await _hydrate_task(session, user, task)


@router.delete("/tasks/{task_id}", response_model=Ok)
async def delete_task(task_id: uuid.UUID, session: SessionDep, user: TenantUserDep) -> Ok:
    task = await session.scalar(
        select(Task).where(Task.id == task_id, Task.tenant_id == user.tenant_id)
    )
    ensure_found(task, "Task")
    await session.delete(task)
    return Ok(message="Task deleted")


async def _hydrate_task(session: SessionDep, user: TenantUserDep, task: Task) -> TaskRead:
    client_name = None
    if task.client_id:
        client_name = await session.scalar(select(Client.legal_name).where(Client.id == task.client_id))
    project_name = None
    if task.project_id:
        project_name = await session.scalar(select(Project.name).where(Project.id == task.project_id))
    assignee_name = None
    if task.assignee_id:
        names = await profile_names(session, user.tenant_id)
        assignee_name = names.get(task.assignee_id)
    return read(
        TaskRead,
        task,
        client_name=client_name,
        project_name=project_name,
        assignee_name=assignee_name,
    )
