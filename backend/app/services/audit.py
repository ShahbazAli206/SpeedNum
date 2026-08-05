"""Append-only activity trail."""

from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from ..models import AuditLog, Notification

log = logging.getLogger(__name__)


async def record(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID | None,
    actor_id: uuid.UUID | None = None,
    actor_email: str | None = None,
    action: str,
    entity: str,
    entity_id: Any = None,
    summary: str | None = None,
    metadata: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> None:
    session.add(
        AuditLog(
            tenant_id=tenant_id,
            actor_id=actor_id,
            actor_email=actor_email,
            action=action,
            entity=entity,
            entity_id=str(entity_id) if entity_id is not None else None,
            summary=summary,
            audit_metadata=metadata or {},
            ip_address=ip_address,
        )
    )


async def notify(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    title: str,
    body: str | None = None,
    link: str | None = None,
    type: str = "info",
    profile_id: uuid.UUID | None = None,
) -> None:
    session.add(
        Notification(
            tenant_id=tenant_id,
            profile_id=profile_id,
            type=type,
            title=title,
            body=body,
            link=link,
        )
    )
