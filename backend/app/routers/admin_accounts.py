"""Cross-tenant account directory & actions — platform superadmin only.

/users (users.py) is SuperadminTenantUserDep — it operates on whichever
tenant the caller's session claims as the acting tenant, which for a
superadmin means "whichever firm they are currently impersonating." That's
right for "see exactly what this firm's admin sees," but it means searching
or acting on accounts across every tenant requires impersonating each one in
turn, one at a time — there is no single-pane view.

This router is the direct-by-id complement: every action takes profile_id
(or a cross-tenant search filter) and works from *that account's own*
tenant_id, not the caller's impersonation state. No impersonation required.
Deliberately thin: it re-derives each mutation from services/accounts.py the
same way team.py/users.py/clients.py each independently do, rather than
routing through /users — consistent with how this codebase already has three
near-identical "reissue credentials" call sites instead of one shared one.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select

from ..deps import SessionDep, SuperadminDep, client_ip
from ..models import Client, Profile, Tenant
from ..schemas import CredentialResult, Ok, PlatformAccountRead, PlatformUserUpdate
from ..services import accounts, audit
from ..services.accounts import AccountError
from ..services.rate_limit import rate_limit_by_ip
from ..utils import apply_updates, ensure_found, read

router = APIRouter(prefix="/admin/accounts", tags=["admin"])

# By IP, not by (superadmin) tenant like team.py/users.py's identically-shaped
# limits — a superadmin has no tenant of their own for a per-tenant bucket to
# key off, and this endpoint's blast radius (every tenant, not one) warrants
# its own quota rather than borrowing SuperadminDep's other routes' limits.
_account_action_rate_limit = rate_limit_by_ip("admin-accounts-action", limit=60, window_seconds=3600)


async def _load(session: SessionDep, profile_id: uuid.UUID) -> Profile:
    """No tenant filter — unlike users.py's identically-named helper, finding
    an account by id across every tenant is the entire point here."""
    row = await session.get(Profile, profile_id)
    return ensure_found(row, "Account")


@router.get("", response_model=list[PlatformAccountRead])
async def search_accounts(
    session: SessionDep,
    user: SuperadminDep,
    q: str | None = Query(default=None, description="Matches name or email"),
    tenant_id: uuid.UUID | None = None,
    role: str | None = None,
    source: str | None = Query(default=None, description="team | client"),
    active_only: bool = False,
    limit: int = Query(default=200, ge=1, le=1000),
) -> list[PlatformAccountRead]:
    stmt = (
        select(Profile, Tenant.name, func.coalesce(Client.business_name, Client.legal_name))
        .outerjoin(Tenant, Tenant.id == Profile.tenant_id)
        .outerjoin(Client, Client.id == Profile.client_id)
    )
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(or_(Profile.full_name.ilike(pattern), Profile.email.ilike(pattern)))
    if tenant_id:
        stmt = stmt.where(Profile.tenant_id == tenant_id)
    if role:
        stmt = stmt.where(Profile.role == role)
    if source == "team":
        stmt = stmt.where(Profile.client_id.is_(None))
    elif source == "client":
        stmt = stmt.where(Profile.client_id.is_not(None))
    if active_only:
        stmt = stmt.where(Profile.is_active.is_(True))

    rows = (
        await session.execute(
            stmt.order_by(Profile.is_active.desc(), Profile.full_name).limit(limit)
        )
    ).all()
    return [
        read(
            PlatformAccountRead,
            profile,
            source="client" if profile.client_id is not None else "team",
            client_name=client_name,
            tenant_id=profile.tenant_id,
            tenant_name=tenant_name,
            last_sign_in=profile.last_seen_at,
        )
        for profile, tenant_name, client_name in rows
    ]


@router.patch("/{profile_id}", response_model=PlatformAccountRead)
async def update_account(
    profile_id: uuid.UUID,
    payload: PlatformUserUpdate,
    session: SessionDep,
    user: SuperadminDep,
    request: Request,
) -> PlatformAccountRead:
    profile = await _load(session, profile_id)

    if profile.id == user.profile.id and payload.is_active is False:
        raise HTTPException(status.HTTP_409_CONFLICT, "You cannot deactivate your own account.")
    if payload.role is not None and profile.client_id is not None and payload.role != "member":
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "A client-portal login cannot be given a firm role. Create a separate staff account.",
        )
    if profile.role == "owner" and payload.is_active is False:
        remaining = await session.scalar(
            select(func.count(Profile.id)).where(
                Profile.tenant_id == profile.tenant_id,
                Profile.role == "owner",
                Profile.is_active.is_(True),
                Profile.id != profile.id,
            )
        )
        if not remaining:
            raise HTTPException(status.HTTP_409_CONFLICT, "A firm must keep at least one active owner.")

    changed = apply_updates(profile, payload)
    await session.flush()

    if changed:
        await audit.record(
            session,
            tenant_id=profile.tenant_id,
            actor_id=user.profile.id,
            actor_email=user.profile.email,
            action="updated",
            entity="profile",
            entity_id=profile.id,
            summary=f"[cross-tenant console] Updated {profile.full_name or profile.email} ({', '.join(changed)})",
            ip_address=client_ip(request),
        )

    tenant_name = None
    client_name = None
    if profile.tenant_id:
        tenant_name = await session.scalar(select(Tenant.name).where(Tenant.id == profile.tenant_id))
    if profile.client_id:
        client_name = await session.scalar(
            select(func.coalesce(Client.business_name, Client.legal_name)).where(
                Client.id == profile.client_id
            )
        )
    return read(
        PlatformAccountRead,
        profile,
        source="client" if profile.client_id is not None else "team",
        client_name=client_name,
        tenant_id=profile.tenant_id,
        tenant_name=tenant_name,
        last_sign_in=profile.last_seen_at,
    )


@router.post(
    "/{profile_id}/resend-credentials",
    response_model=CredentialResult,
    dependencies=[Depends(_account_action_rate_limit)],
)
async def resend_credentials(
    profile_id: uuid.UUID, session: SessionDep, user: SuperadminDep, request: Request
) -> CredentialResult:
    """The superadmin-console equivalent of team.py's/users.py's/clients.py's
    resend-credentials — the exact "regenerate an owner's password with no
    recovery email" action from the original platform scenario, just usable
    against any tenant directly instead of only the tenant's own primary
    admin (admin.py's resend-invite) or one already-impersonated tenant
    (users.py)."""
    profile = await _load(session, profile_id)
    tenant = await session.get(Tenant, profile.tenant_id) if profile.tenant_id else None
    if tenant is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This account has no firm to issue credentials for.")

    try:
        result = await accounts.reissue(session, tenant=tenant, profile=profile, reply_to=None)
    except AccountError as exc:
        raise HTTPException(exc.status_code, str(exc)) from exc

    await audit.record(
        session,
        tenant_id=tenant.id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="password_reset",
        entity="profile",
        entity_id=profile.id,
        summary=f"[cross-tenant console] Issued a new temporary password for {profile.full_name or profile.email}",
        ip_address=client_ip(request),
    )

    return CredentialResult(
        profile_id=profile.id,
        email=profile.email,
        full_name=profile.full_name,
        role=profile.role,
        temp_password=result.temp_password,
        login_url=accounts.login_url(),
        email_sent=result.email_sent,
        message=(
            "New credentials emailed."
            if result.email_sent
            else "Password reset, but email delivery isn't configured — share the password below."
        ),
    )


@router.delete("/{profile_id}", response_model=Ok, dependencies=[Depends(_account_action_rate_limit)])
async def delete_account(
    profile_id: uuid.UUID,
    session: SessionDep,
    user: SuperadminDep,
    request: Request,
    revoke_login: bool = True,
) -> Ok:
    """Same shape as users.py's delete_user — staff are deactivated, a
    client-portal login is removed outright — just reachable across every
    tenant instead of only an impersonated one."""
    profile = await _load(session, profile_id)

    if profile.id == user.profile.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "You cannot remove your own account.")
    if profile.role == "owner" and profile.client_id is None:
        remaining = await session.scalar(
            select(func.count(Profile.id)).where(
                Profile.tenant_id == profile.tenant_id,
                Profile.role == "owner",
                Profile.is_active.is_(True),
                Profile.id != profile.id,
            )
        )
        if not remaining:
            raise HTTPException(status.HTTP_409_CONFLICT, "A firm must keep at least one active owner.")

    label = profile.full_name or profile.email
    is_portal = profile.client_id is not None
    login_revoked = await accounts.revoke(session, profile) if revoke_login else False

    if is_portal:
        client = await session.get(Client, profile.client_id)
        if client is not None:
            client.portal_enabled = False
        await session.delete(profile)
    else:
        profile.is_active = False
    await session.flush()

    await audit.record(
        session,
        tenant_id=profile.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="deleted" if is_portal else "deactivated",
        entity="profile",
        entity_id=profile_id,
        summary=f"[cross-tenant console] Removed {label}'s access",
        metadata={"login_revoked": login_revoked, "portal": is_portal},
        ip_address=client_ip(request),
    )
    return Ok(
        message=(
            f"{label} removed and their login revoked."
            if login_revoked
            else f"{label} can no longer sign in."
        )
    )
