"""Platform superadmin console (cross-tenant)."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import func, select

from ..deps import SessionDep, SuperadminDep
from ..models import AuditLog, Client, Deadline, EngagementLetter, Profile, Tenant
from ..schemas import PlatformAuditLogRead
from ..utils import ensure_found
from .reminders import sweep_tenant

router = APIRouter(prefix="/admin", tags=["admin"])


class TenantAdminUpdate(BaseModel):
    plan: str | None = None
    seats: int | None = None
    is_active: bool | None = None


@router.get("/tenants")
async def list_tenants(session: SessionDep, user: SuperadminDep) -> list[dict[str, Any]]:
    tenants = (await session.scalars(select(Tenant).order_by(Tenant.created_at.desc()))).all()

    client_counts = dict((await session.execute(
        select(Client.tenant_id, func.count(Client.id)).group_by(Client.tenant_id)
    )).all())
    user_counts = dict((await session.execute(
        select(Profile.tenant_id, func.count(Profile.id)).group_by(Profile.tenant_id)
    )).all())
    letter_counts = dict((await session.execute(
        select(EngagementLetter.tenant_id, func.count(EngagementLetter.id))
        .where(EngagementLetter.status == "signed")
        .group_by(EngagementLetter.tenant_id)
    )).all())

    return [
        {
            "id": str(tenant.id),
            "name": tenant.name,
            "slug": tenant.slug,
            "plan": tenant.plan,
            "seats": tenant.seats,
            "is_active": tenant.is_active,
            "custom_domain": tenant.custom_domain,
            "trial_ends_at": tenant.trial_ends_at,
            "created_at": tenant.created_at,
            "clients": client_counts.get(tenant.id, 0),
            "users": user_counts.get(tenant.id, 0),
            "signed_letters": letter_counts.get(tenant.id, 0),
        }
        for tenant in tenants
    ]


@router.patch("/tenants/{tenant_id}")
async def update_tenant(
    tenant_id: uuid.UUID, payload: TenantAdminUpdate, session: SessionDep, user: SuperadminDep
) -> dict[str, Any]:
    tenant = await session.get(Tenant, tenant_id)
    ensure_found(tenant, "Tenant")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(tenant, key, value)
    await session.flush()
    return {"id": str(tenant.id), "plan": tenant.plan, "seats": tenant.seats, "is_active": tenant.is_active}


@router.post("/reminders/sweep")
async def sweep_all_reminders(
    session: SessionDep, user: SuperadminDep, send_emails: bool = True
) -> dict[str, Any]:
    """Run the reminder sweep for every active firm.

    This is the endpoint a scheduler (Render cron, Supabase scheduled function)
    should hit once a day with a superadmin token — POST /reminders/run only
    covers the caller's own firm. Both are idempotent, so an overlapping manual
    run does no harm.
    """
    tenants = (
        await session.scalars(select(Tenant).where(Tenant.is_active.is_(True)))
    ).all()

    totals = {"tenants": 0, "created": 0, "skipped": 0, "emailed": 0, "scanned": 0}
    for tenant in tenants:
        result = await sweep_tenant(session, tenant, send_emails=send_emails)
        totals["tenants"] += 1
        for key, value in result.as_dict().items():
            totals[key] += value
    return totals


@router.get("/audit", response_model=list[PlatformAuditLogRead])
async def platform_audit(
    session: SessionDep, user: SuperadminDep, limit: int = Query(default=100, ge=1, le=500)
) -> list[dict[str, Any]]:
    rows = (
        await session.execute(
            select(AuditLog, Tenant.name)
            .outerjoin(Tenant, Tenant.id == AuditLog.tenant_id)
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
        )
    ).all()
    return [
        {
            "id": entry.id,
            "actor_email": entry.actor_email,
            "action": entry.action,
            "entity": entry.entity,
            "entity_id": entry.entity_id,
            "summary": entry.summary,
            "created_at": entry.created_at,
            "tenant_name": tenant_name,
        }
        for entry, tenant_name in rows
    ]


@router.get("/stats")
async def platform_stats(session: SessionDep, user: SuperadminDep) -> dict[str, Any]:
    return {
        "tenants": await session.scalar(select(func.count(Tenant.id))) or 0,
        "active_tenants": await session.scalar(
            select(func.count(Tenant.id)).where(Tenant.is_active.is_(True))
        ) or 0,
        "users": await session.scalar(select(func.count(Profile.id))) or 0,
        "clients": await session.scalar(select(func.count(Client.id))) or 0,
        "deadlines": await session.scalar(select(func.count(Deadline.id))) or 0,
        "letters_signed": await session.scalar(
            select(func.count(EngagementLetter.id)).where(EngagementLetter.status == "signed")
        ) or 0,
    }
