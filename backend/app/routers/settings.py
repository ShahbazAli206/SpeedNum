"""Firm profile, white-label branding and the audit trail."""

from __future__ import annotations

from fastapi import APIRouter, Query, Request
from sqlalchemy import desc, select

from ..deps import AdminUserDep, SessionDep, TenantUserDep, client_ip
from ..models import AuditLog
from ..schemas import AuditLogRead, TenantRead, TenantUpdate
from ..services import audit
from ..utils import apply_updates

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/tenant", response_model=TenantRead)
async def get_tenant(user: TenantUserDep) -> TenantRead:
    return TenantRead.model_validate(user.tenant)


@router.patch("/tenant", response_model=TenantRead)
async def update_tenant(
    payload: TenantUpdate, session: SessionDep, user: AdminUserDep, request: Request
) -> TenantRead:
    changed = apply_updates(user.tenant, payload)
    await session.flush()
    if changed:
        await audit.record(
            session,
            tenant_id=user.tenant_id,
            actor_id=user.profile.id,
            actor_email=user.profile.email,
            action="updated",
            entity="tenant",
            entity_id=user.tenant_id,
            summary=f"Updated firm settings ({', '.join(changed)})",
            ip_address=client_ip(request),
        )
    return TenantRead.model_validate(user.tenant)


@router.get("/audit-log", response_model=list[AuditLogRead])
async def audit_log(
    session: SessionDep,
    user: AdminUserDep,
    limit: int = Query(default=100, ge=1, le=500),
    entity: str | None = None,
) -> list[AuditLogRead]:
    stmt = select(AuditLog).where(AuditLog.tenant_id == user.tenant_id)
    if entity:
        stmt = stmt.where(AuditLog.entity == entity)
    stmt = stmt.order_by(desc(AuditLog.created_at)).limit(limit)
    rows = (await session.scalars(stmt)).all()
    return [
        AuditLogRead(
            id=row.id,
            actor_email=row.actor_email,
            action=row.action,
            entity=row.entity,
            entity_id=row.entity_id,
            summary=row.summary,
            created_at=row.created_at,
        )
        for row in rows
    ]
