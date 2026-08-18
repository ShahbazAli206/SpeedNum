"""Request-scoped dependencies: authentication, tenant scoping, roles."""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Depends, HTTPException, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_session
from .models import Profile, Tenant
from .security import TokenClaims, verify_token

log = logging.getLogger(__name__)

bearer_scheme = HTTPBearer(auto_error=False, description="SpeedNum access token (self-hosted local auth by default; see security.py)")

SessionDep = Annotated[AsyncSession, Depends(get_session)]


@dataclass(slots=True)
class CurrentUser:
    profile: Profile
    tenant: Tenant | None
    claims: TokenClaims

    @property
    def id(self) -> uuid.UUID:
        return self.profile.id

    @property
    def tenant_id(self) -> uuid.UUID:
        if self.tenant is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "This account is not linked to a firm yet.")
        return self.tenant.id

    @property
    def is_admin(self) -> bool:
        return self.profile.role in ("owner", "admin") or bool(self.profile.is_superadmin)


async def get_claims(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> TokenClaims:
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return verify_token(credentials.credentials)


async def _provision_profile(session: AsyncSession, claims: TokenClaims) -> Profile:
    """Create the profile row when the auth.users trigger has not (yet) run."""
    firm_name = (claims.metadata.get("firm_name") or "").strip()
    full_name = (claims.metadata.get("full_name") or "").strip() or (claims.email or "").split("@")[0]
    tenant_id: uuid.UUID | None = None

    if firm_name:
        slug = await session.scalar(text("select public.unique_tenant_slug(:name)"), {"name": firm_name})
        tenant = Tenant(
            name=firm_name,
            slug=slug or firm_name.lower().replace(" ", "-"),
            email=claims.email,
            email_from_name=firm_name,
            trial_ends_at=datetime.now(timezone.utc) + timedelta(days=14),
        )
        session.add(tenant)
        await session.flush()
        tenant_id = tenant.id
        await session.execute(
            text("select public.seed_default_services(:tenant_id)"), {"tenant_id": str(tenant_id)}
        )

    profile = Profile(
        id=uuid.UUID(claims.user_id),
        tenant_id=tenant_id,
        email=claims.email or f"{claims.user_id}@unknown.local",
        full_name=full_name,
        role="owner" if tenant_id else "member",
    )
    session.add(profile)
    await session.flush()
    log.info("Provisioned profile %s (tenant=%s)", profile.id, tenant_id)
    return profile


async def get_current_user(
    session: SessionDep,
    claims: Annotated[TokenClaims, Depends(get_claims)],
) -> CurrentUser:
    try:
        user_id = uuid.UUID(claims.user_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Access token subject is not a UUID") from exc

    profile = await session.scalar(select(Profile).where(Profile.id == user_id))
    if profile is None:
        profile = await _provision_profile(session, claims)

    if not profile.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been deactivated.")

    tenant = None
    if profile.tenant_id is not None:
        tenant = await session.get(Tenant, profile.tenant_id)

    now = datetime.now(timezone.utc)
    if profile.last_seen_at is None or (now - profile.last_seen_at) > timedelta(minutes=10):
        profile.last_seen_at = now

    return CurrentUser(profile=profile, tenant=tenant, claims=claims)


CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]


async def get_firm_linked_user(user: CurrentUserDep) -> CurrentUser:
    """Any authenticated user with a tenant — firm staff OR a client-portal
    account. This is the broad check; almost everything wants the stricter
    get_tenant_user below instead. It exists only for BookScope, which is the
    one place both kinds of account are meant to land.

    Also the choke point for the temporary-password rule, for the same reason
    the portal/staff split lives here: every data-carrying dependency in this
    module is built on top of it, so one check covers them all and no router
    has to remember."""
    if user.tenant is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "No firm is linked to this account. Create one via POST /auth/bootstrap.",
        )
    if user.profile.must_change_password:
        # An admin-generated temporary password is a shared secret: it was
        # emailed in plaintext, and often read out or pasted into a chat. Until
        # it is replaced the account can see nothing. The frontend forces the
        # prompt, but a forced prompt in a browser is not a control — anyone
        # holding the temp password can call this API directly.
        #
        # 428 rather than 403 so the client can tell "finish setting up" apart
        # from "you lack the role" without matching on the message. The
        # /auth/* endpoints take CurrentUserDep, so /auth/me and
        # /auth/complete-password-change stay reachable and the user can
        # actually get out of this state.
        raise HTTPException(
            status.HTTP_428_PRECONDITION_REQUIRED,
            "Set a new password before continuing.",
        )
    return user


AnyTenantUserDep = Annotated[CurrentUser, Depends(get_firm_linked_user)]


async def get_tenant_user(user: AnyTenantUserDep) -> CurrentUser:
    """Firm staff only. A client-portal account (profile.client_id set) is
    rejected here, not just at individual actions — every firm-internal
    router (clients, team, deadlines, reporting, ...) depends on this, and
    without the check a portal account's token could list every other
    client of the same firm. Portal accounts belong on /client-portal/*
    (BookScopeDep) instead, which pins them to their own client."""
    if user.profile.client_id is not None:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Client-portal accounts cannot use this endpoint."
        )
    return user


TenantUserDep = Annotated[CurrentUser, Depends(get_tenant_user)]


async def require_admin(user: TenantUserDep) -> CurrentUser:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Requires an owner or admin role.")
    return user


AdminUserDep = Annotated[CurrentUser, Depends(require_admin)]


async def require_superadmin(user: CurrentUserDep) -> CurrentUser:
    if not user.profile.is_superadmin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Requires the platform superadmin role.")
    if user.profile.must_change_password:
        # Same reasoning as get_firm_linked_user's identical check below: an
        # admin-issued temporary password is a shared secret until replaced,
        # and a platform superadmin is the single most sensitive account type
        # in the system — this dependency doesn't build on get_firm_linked_user
        # (a superadmin legitimately has tenant=None), so without this check
        # a temp-password superadmin session could reach every /admin/* route
        # immediately, unlike every tenant-scoped account.
        raise HTTPException(
            status.HTTP_428_PRECONDITION_REQUIRED,
            "Set a new password before continuing.",
        )
    return user


SuperadminDep = Annotated[CurrentUser, Depends(require_superadmin)]

# TenantUserDep already excludes portal accounts (see get_tenant_user above);
# this name exists purely so staff-only action endpoints (approve an expense,
# process payroll, file a return) read clearly at the call site.
StaffUserDep = TenantUserDep


@dataclass(slots=True)
class BookScope:
    """Tenant + client scoping for the client-portal 'books' (invoices, expenses,
    payroll, tax obligations, documents).

    Firm staff (profile.client_id is null) may read/write any client's book under
    their tenant, optionally narrowed with `?client_id=`. A portal account
    (profile.client_id set) is always pinned to that one client — the query
    param is ignored for them, it can never widen access.
    """

    tenant_id: uuid.UUID
    client_id: uuid.UUID | None
    is_portal: bool
    user: CurrentUser


async def get_book_scope(
    user: AnyTenantUserDep,
    client_id: Annotated[
        uuid.UUID | None, Query(description="Firm staff only: narrow to one client's book.")
    ] = None,
) -> BookScope:
    if user.profile.client_id is not None:
        return BookScope(tenant_id=user.tenant_id, client_id=user.profile.client_id, is_portal=True, user=user)
    return BookScope(tenant_id=user.tenant_id, client_id=client_id, is_portal=False, user=user)


BookScopeDep = Annotated[BookScope, Depends(get_book_scope)]


async def require_client_scope(scope: BookScopeDep) -> BookScope:
    """Same as get_book_scope, but for endpoints that always need exactly one client
    (e.g. create). Firm staff must pass `?client_id=`; portal accounts already have one.
    """
    if scope.client_id is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "client_id is required.")
    return scope


ClientScopeDep = Annotated[BookScope, Depends(require_client_scope)]


def client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None
