"""In-app alert feed."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Query
from sqlalchemy import desc, func, or_, select, update

from ..deps import AnyTenantUserDep, CurrentUser, SessionDep
from ..models import Notification
from ..schemas import NotificationCounts, NotificationRead, Ok
from ..utils import ensure_found

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _visible_to(user: CurrentUser):
    """Rows this account is allowed to see.

    A null `profile_id` is a firm-wide broadcast — "deadlines generated",
    "letter declined" — and must stay with firm staff. A client-portal login
    sees only notifications addressed to it by id, otherwise it would read the
    firm's activity about every *other* client.
    """
    own = Notification.profile_id == user.profile.id
    if user.profile.client_id is not None:
        return own
    return or_(own, Notification.profile_id.is_(None))


@router.get("", response_model=list[NotificationRead])
async def list_notifications(
    session: SessionDep,
    user: AnyTenantUserDep,
    unread_only: bool = False,
    limit: int = Query(default=50, ge=1, le=200),
) -> list[NotificationRead]:
    stmt = select(Notification).where(
        Notification.tenant_id == user.tenant_id,
        _visible_to(user),
    )
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    rows = (await session.scalars(stmt.order_by(desc(Notification.created_at)).limit(limit))).all()
    return [NotificationRead.model_validate(row) for row in rows]


@router.get("/unread-count", response_model=NotificationCounts)
async def unread_count(session: SessionDep, user: AnyTenantUserDep) -> NotificationCounts:
    """Cheap poll for the bell badge.

    `GET /auth/me` already returns this number, but the bell refreshes on a
    timer and /auth/me loads the profile and tenant to do it. This is one
    COUNT(*), which is what a badge that ticks every minute should cost.
    """
    total = await session.scalar(
        select(func.count(Notification.id)).where(
            Notification.tenant_id == user.tenant_id,
            Notification.is_read.is_(False),
            _visible_to(user),
        )
    )
    return NotificationCounts(unread=int(total or 0))


@router.post("/{notification_id}/read", response_model=NotificationRead)
async def mark_read(
    notification_id: uuid.UUID, session: SessionDep, user: AnyTenantUserDep
) -> NotificationRead:
    row = await session.scalar(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.tenant_id == user.tenant_id,
            # Same scoping as the list: without it, one account could act on
            # another's row just by knowing its id.
            _visible_to(user),
        )
    )
    ensure_found(row, "Notification")
    row.is_read = True
    await session.flush()
    return NotificationRead.model_validate(row)


@router.post("/read-all", response_model=Ok)
async def mark_all_read(session: SessionDep, user: AnyTenantUserDep) -> Ok:
    await session.execute(
        update(Notification)
        .where(
            Notification.tenant_id == user.tenant_id,
            Notification.is_read.is_(False),
            _visible_to(user),
        )
        .values(is_read=True)
    )
    return Ok(message="All caught up")


@router.delete("/{notification_id}", response_model=Ok)
async def delete_notification(
    notification_id: uuid.UUID, session: SessionDep, user: AnyTenantUserDep
) -> Ok:
    row = await session.scalar(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.tenant_id == user.tenant_id,
            # Same scoping as the list: without it, one account could act on
            # another's row just by knowing its id.
            _visible_to(user),
        )
    )
    ensure_found(row, "Notification")
    await session.delete(row)
    return Ok(message="Notification dismissed")
