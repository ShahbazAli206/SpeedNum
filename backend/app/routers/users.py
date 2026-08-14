"""Platform accounts — every login in the firm, staff and client-portal alike.

Overlaps /team deliberately but is not the same list. /team is the accountant
roster: firm staff, with workload columns, used for assigning work. /users is
the administrator's view of *access*: who can sign in at all, on what role, when
they last did, and whether they are still on a temporary password. A
client-portal login appears here and nowhere else on the firm side.

Creating and reissuing credentials both go through services/accounts.py, so an
account made here is indistinguishable from one made on the Accountants page or
by the bulk importer.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import func, select

from ..deps import AdminUserDep, SessionDep, TenantUserDep, client_ip
from ..models import Client, Profile
from ..schemas import (
    CredentialResult,
    Ok,
    PlatformUserCreate,
    PlatformUserRead,
    PlatformUserUpdate,
)
from ..services import accounts, audit
from ..services.accounts import AccountError
from ..utils import apply_updates, ensure_found, read

router = APIRouter(prefix="/users", tags=["users"])


def _decorate(row: Profile, client_name: str | None) -> PlatformUserRead:
    return read(
        PlatformUserRead,
        row,
        source="client" if row.client_id is not None else "team",
        client_name=client_name,
        # last_seen_at is refreshed by deps.get_current_user on each request, so
        # it is the closest signal we hold to "last signed in".
        last_sign_in=row.last_seen_at,
    )


@router.get("", response_model=list[PlatformUserRead])
async def list_users(
    session: SessionDep,
    user: TenantUserDep,
    source: str | None = Query(default=None, description="team | client"),
    role: str | None = None,
    active_only: bool = False,
) -> list[PlatformUserRead]:
    stmt = (
        select(Profile, func.coalesce(Client.business_name, Client.legal_name))
        .outerjoin(Client, Client.id == Profile.client_id)
        .where(Profile.tenant_id == user.tenant_id)
    )
    if source == "team":
        stmt = stmt.where(Profile.client_id.is_(None))
    elif source == "client":
        stmt = stmt.where(Profile.client_id.is_not(None))
    if role:
        stmt = stmt.where(Profile.role == role)
    if active_only:
        stmt = stmt.where(Profile.is_active.is_(True))

    rows = (
        await session.execute(stmt.order_by(Profile.is_active.desc(), Profile.full_name))
    ).all()
    return [_decorate(profile, client_name) for profile, client_name in rows]


@router.post("", response_model=CredentialResult, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: PlatformUserCreate, session: SessionDep, user: AdminUserDep, request: Request
) -> CredentialResult:
    """Create a login and email its credentials.

    Pass `client_id` for a client-portal account (they get the full onboarding
    email); omit it for firm staff (leaner credentials email).
    """
    try:
        result = await accounts.provision(
            session,
            tenant=user.tenant,
            email=str(payload.email),
            full_name=payload.full_name,
            role=payload.role,
            client_id=payload.client_id,
            title=payload.title,
            phone=payload.phone,
            send_welcome=payload.send_email,
            reply_to=user.profile.email,
        )
    except AccountError as exc:
        raise HTTPException(exc.status_code, str(exc)) from exc

    profile = result.profile
    kind = "client portal" if payload.client_id else profile.role

    await audit.record(
        session,
        tenant_id=user.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="created",
        entity="profile",
        entity_id=profile.id,
        summary=f"Created {kind} account for {profile.full_name} ({profile.email})",
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
            "Credentials emailed."
            if result.email_sent
            else "Account created, but email delivery isn't configured — share the password below."
        ),
    )


async def _load(session: SessionDep, user: AdminUserDep, profile_id: uuid.UUID) -> Profile:
    row = await session.scalar(
        select(Profile).where(Profile.id == profile_id, Profile.tenant_id == user.tenant_id)
    )
    return ensure_found(row, "User")


@router.patch("/{profile_id}", response_model=PlatformUserRead)
async def update_user(
    profile_id: uuid.UUID,
    payload: PlatformUserUpdate,
    session: SessionDep,
    user: AdminUserDep,
    request: Request,
) -> PlatformUserRead:
    profile = await _load(session, user, profile_id)

    if payload.role is not None and profile.client_id is not None and payload.role != "member":
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "A client-portal login cannot be given a firm role. Create a separate staff account.",
        )
    if profile.role == "owner" and payload.is_active is False:
        remaining = await session.scalar(
            select(func.count(Profile.id)).where(
                Profile.tenant_id == user.tenant_id,
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
            tenant_id=user.tenant_id,
            actor_id=user.profile.id,
            actor_email=user.profile.email,
            action="updated",
            entity="profile",
            entity_id=profile.id,
            summary=f"Updated {profile.full_name or profile.email} ({', '.join(changed)})",
            ip_address=client_ip(request),
        )

    client_name = None
    if profile.client_id:
        client_name = await session.scalar(
            select(func.coalesce(Client.business_name, Client.legal_name)).where(
                Client.id == profile.client_id
            )
        )
    return _decorate(profile, client_name)


@router.post("/{profile_id}/resend-credentials", response_model=CredentialResult)
async def resend_credentials(
    profile_id: uuid.UUID, session: SessionDep, user: AdminUserDep, request: Request
) -> CredentialResult:
    profile = await _load(session, user, profile_id)

    try:
        result = await accounts.reissue(
            session, tenant=user.tenant, profile=profile, reply_to=user.profile.email
        )
    except AccountError as exc:
        raise HTTPException(exc.status_code, str(exc)) from exc

    await audit.record(
        session,
        tenant_id=user.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="password_reset",
        entity="profile",
        entity_id=profile.id,
        summary=f"Issued a new temporary password for {profile.full_name or profile.email}",
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


@router.delete("/{profile_id}", response_model=Ok)
async def delete_user(
    profile_id: uuid.UUID,
    session: SessionDep,
    user: AdminUserDep,
    request: Request,
    revoke_login: bool = True,
) -> Ok:
    """Revoke an account's access.

    Staff profiles are deactivated rather than deleted — clients, tasks and
    deadlines reference them as owner/assignee, and a hard delete would blank
    those out. Client-portal profiles own nothing, so they are removed outright
    and the client record simply loses its portal login.
    """
    profile = await _load(session, user, profile_id)

    if profile.id == user.profile.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "You cannot remove your own account.")
    if profile.role == "owner" and profile.client_id is None:
        remaining = await session.scalar(
            select(func.count(Profile.id)).where(
                Profile.tenant_id == user.tenant_id,
                Profile.role == "owner",
                Profile.is_active.is_(True),
                Profile.id != profile.id,
            )
        )
        if not remaining:
            raise HTTPException(status.HTTP_409_CONFLICT, "A firm must keep at least one active owner.")

    label = profile.full_name or profile.email
    is_portal = profile.client_id is not None
    login_revoked = await accounts.revoke(profile) if revoke_login else False

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
        tenant_id=user.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="deleted" if is_portal else "deactivated",
        entity="profile",
        entity_id=profile_id,
        summary=f"Removed {label}'s access",
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
