"""Platform superadmin console (cross-tenant)."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import func, select

from ..deps import SessionDep, SuperadminDep
from ..models import Client, Deadline, EngagementLetter, Profile, Tenant
from ..utils import ensure_found

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
