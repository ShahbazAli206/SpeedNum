"""In-app alert feed."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Query
from sqlalchemy import desc, or_, select, update

from ..deps import SessionDep, TenantUserDep
from ..models import Notification
from ..schemas import NotificationRead, Ok
from ..utils import ensure_found

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationRead])
async def list_notifications(
    session: SessionDep,
    user: TenantUserDep,
    unread_only: bool = False,
    limit: int = Query(default=50, ge=1, le=200),
) -> list[NotificationRead]:
    stmt = select(Notification).where(
        Notification.tenant_id == user.tenant_id,
        or_(Notification.profile_id == user.profile.id, Notification.profile_id.is_(None)),
    )
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    rows = (await session.scalars(stmt.order_by(desc(Notification.created_at)).limit(limit))).all()
    return [NotificationRead.model_validate(row) for row in rows]


@router.post("/{notification_id}/read", response_model=NotificationRead)
async def mark_read(
    notification_id: uuid.UUID, session: SessionDep, user: TenantUserDep
) -> NotificationRead:
    row = await session.scalar(
        select(Notification).where(
            Notification.id == notification_id, Notification.tenant_id == user.tenant_id
        )
    )
    ensure_found(row, "Notification")
    row.is_read = True
    await session.flush()
    return NotificationRead.model_validate(row)


@router.post("/read-all", response_model=Ok)
async def mark_all_read(session: SessionDep, user: TenantUserDep) -> Ok:
    await session.execute(
        update(Notification)
        .where(
            Notification.tenant_id == user.tenant_id,
            Notification.is_read.is_(False),
            or_(Notification.profile_id == user.profile.id, Notification.profile_id.is_(None)),
        )
        .values(is_read=True)
    )
    return Ok(message="All caught up")


@router.delete("/{notification_id}", response_model=Ok)
async def delete_notification(
    notification_id: uuid.UUID, session: SessionDep, user: TenantUserDep
) -> Ok:
    row = await session.scalar(
        select(Notification).where(
            Notification.id == notification_id, Notification.tenant_id == user.tenant_id
        )
    )
    ensure_found(row, "Notification")
    await session.delete(row)
    return Ok(message="Notification dismissed")
