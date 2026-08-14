"""Session bootstrap: who am I, and which firm do I belong to."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select, text

from ..deps import CurrentUserDep, SessionDep
from ..models import Notification, Tenant
from ..schemas import BootstrapRequest, MeResponse, ProfileRead, ProfileUpdate, TenantRead
from ..services import audit
from ..utils import apply_updates

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=MeResponse)
async def me(session: SessionDep, user: CurrentUserDep) -> MeResponse:
    unread = 0
    if user.tenant is not None:
        unread = await session.scalar(
            select(func.count(Notification.id)).where(
                Notification.tenant_id == user.tenant.id,
                Notification.is_read.is_(False),
                (Notification.profile_id == user.profile.id) | (Notification.profile_id.is_(None)),
            )
        ) or 0

    return MeResponse(
        profile=ProfileRead.model_validate(user.profile),
        tenant=TenantRead.model_validate(user.tenant) if user.tenant else None,
        unread_notifications=unread,
    )


@router.patch("/me", response_model=ProfileRead)
async def update_me(payload: ProfileUpdate, session: SessionDep, user: CurrentUserDep) -> ProfileRead:
    apply_updates(user.profile, payload, allowed={"full_name", "title", "phone", "avatar_url", "weekly_capacity"})
    await session.flush()
    return ProfileRead.model_validate(user.profile)


@router.post("/complete-password-change", response_model=ProfileRead)
async def complete_password_change(session: SessionDep, user: CurrentUserDep) -> ProfileRead:
    """Called after the client (or any user) has set a real password to
    replace a temporary one, so the forced "set a new password" prompt does
    not keep reappearing. Uses CurrentUserDep, not TenantUserDep — a
    client-portal account must be able to call this about itself."""
    user.profile.must_change_password = False
    await session.flush()
    return ProfileRead.model_validate(user.profile)


@router.post("/bootstrap", response_model=MeResponse, status_code=status.HTTP_201_CREATED)
async def bootstrap_firm(
    payload: BootstrapRequest, session: SessionDep, user: CurrentUserDep
) -> MeResponse:
    """Create a firm for an account that signed up without one."""
    if user.tenant is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This account already belongs to a firm.")

    slug = await session.scalar(
        text("select public.unique_tenant_slug(:name)"), {"name": payload.firm_name}
    )
    tenant = Tenant(
        name=payload.firm_name.strip(),
        slug=slug or payload.firm_name.strip().lower().replace(" ", "-"),
        email=user.profile.email,
        email_from_name=payload.firm_name.strip(),
        trial_ends_at=datetime.now(timezone.utc) + timedelta(days=14),
    )
    session.add(tenant)
    await session.flush()

    await session.execute(
        text("select public.seed_default_services(:tenant_id)"), {"tenant_id": str(tenant.id)}
    )

    user.profile.tenant_id = tenant.id
    user.profile.role = "owner"
    if payload.full_name:
        user.profile.full_name = payload.full_name

    await audit.record(
        session,
        tenant_id=tenant.id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="created",
        entity="tenant",
        entity_id=tenant.id,
        summary=f"Created firm {tenant.name}",
    )
    await audit.notify(
        session,
        tenant_id=tenant.id,
        profile_id=user.profile.id,
        type="welcome",
        title="Welcome to your practice workspace",
        body="Import your client list, assign services, and your compliance calendar builds itself.",
        link="/clients",
    )
    await session.flush()

    return MeResponse(
        profile=ProfileRead.model_validate(user.profile),
        tenant=TenantRead.model_validate(tenant),
        unread_notifications=1,
    )
