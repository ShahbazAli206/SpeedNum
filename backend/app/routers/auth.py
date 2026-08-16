"""Session bootstrap and authentication: who am I, and how did I sign in.

Registration/login/logout/refresh/password-reset/email-verification live
here — services/local_auth.py owns the actual logic (password hashing,
token issuance and rotation); this module is just the HTTP shape around it,
including the one part that has to live at the transport layer: the
refresh token's HttpOnly cookie.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select, text

from ..config import settings
from ..deps import CurrentUserDep, SessionDep, client_ip
from ..models import Notification, Tenant
from ..schemas import (
    AuthResult,
    BootstrapRequest,
    ForgotPasswordRequest,
    LoginRequest,
    MagicLoginRequest,
    MeResponse,
    Ok,
    ProfileRead,
    ProfileUpdate,
    RegisterRequest,
    ResetPasswordRequest,
    TenantRead,
    VerifyEmailRequest,
)
from ..services import audit, local_auth
from ..services.email import password_reset_html, send_email, verify_email_html
from ..services.local_auth import AuthError, TokenPair
from ..services.rate_limit import rate_limit_by_ip
from ..utils import apply_updates

router = APIRouter(prefix="/auth", tags=["auth"])

# Generous enough that a legitimate user retrying a typo'd password isn't
# blocked; tight enough to slow down a credential-stuffing script. Login
# also has its own per-account lockout (services/local_auth.py) — this is
# the per-IP layer on top of it.
_login_rate_limit = rate_limit_by_ip("auth-login", limit=10, window_seconds=300)
_register_rate_limit = rate_limit_by_ip("auth-register", limit=5, window_seconds=3600)
_forgot_password_rate_limit = rate_limit_by_ip("auth-forgot-password", limit=5, window_seconds=3600)
_verify_email_rate_limit = rate_limit_by_ip("auth-verify-email", limit=10, window_seconds=3600)
_refresh_rate_limit = rate_limit_by_ip("auth-refresh", limit=60, window_seconds=300)


def _set_refresh_cookie(response: Response, tokens: TokenPair) -> None:
    max_age = int((tokens.refresh_expires_at - datetime.now(timezone.utc)).total_seconds())
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=tokens.refresh_token,
        max_age=max(max_age, 0),
        httponly=True,
        secure=True,
        # "none" because the frontend (Vercel) and this API are different
        # origins — a same-site default would never be attached to the
        # cross-origin fetch(..., {credentials: "include"}) calls the
        # frontend makes. Requires Secure, which this deployment always is
        # (HTTPS-only via Caddy).
        samesite="none",
        domain=settings.refresh_cookie_domain or None,
        path="/",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.refresh_cookie_name,
        domain=settings.refresh_cookie_domain or None,
        path="/",
        secure=True,
        samesite="none",
    )


def _auth_result(profile, tokens: TokenPair) -> AuthResult:
    return AuthResult(
        access_token=tokens.access_token,
        expires_in=settings.access_token_ttl_seconds,
        profile=ProfileRead.model_validate(profile),
    )


RefreshCookie = Annotated[str | None, Cookie(alias=settings.refresh_cookie_name)]


@router.post(
    "/register",
    response_model=AuthResult,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_register_rate_limit)],
)
async def register(
    payload: RegisterRequest, request: Request, response: Response, session: SessionDep
) -> AuthResult:
    try:
        profile, tokens = await local_auth.register(
            session,
            email=str(payload.email),
            password=payload.password,
            full_name=payload.full_name,
            user_agent=request.headers.get("user-agent"),
            ip_address=client_ip(request),
        )
    except AuthError as exc:
        raise HTTPException(exc.status_code, str(exc)) from exc

    raw_verify_token = await local_auth.request_email_verification(session, profile.id)
    verify_url = (
        f"{settings.public_app_url.rstrip('/')}/verify-email?token={raw_verify_token}"
    )
    await send_email(
        to=profile.email, subject="Confirm your SpeedNum account", html=verify_email_html(url=verify_url)
    )

    _set_refresh_cookie(response, tokens)
    return _auth_result(profile, tokens)


@router.post("/login", response_model=AuthResult, dependencies=[Depends(_login_rate_limit)])
async def login(
    payload: LoginRequest, request: Request, response: Response, session: SessionDep
) -> AuthResult:
    try:
        profile, tokens = await local_auth.login(
            session,
            email=str(payload.email),
            password=payload.password,
            user_agent=request.headers.get("user-agent"),
            ip_address=client_ip(request),
        )
    except AuthError as exc:
        raise HTTPException(exc.status_code, str(exc)) from exc

    _set_refresh_cookie(response, tokens)
    return _auth_result(profile, tokens)


@router.post("/refresh", response_model=AuthResult, dependencies=[Depends(_refresh_rate_limit)])
async def refresh_session(
    request: Request, response: Response, session: SessionDep, sn_refresh: RefreshCookie = None
) -> AuthResult:
    if not sn_refresh:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No session to refresh.")
    try:
        profile, tokens = await local_auth.refresh(
            session,
            raw_token=sn_refresh,
            user_agent=request.headers.get("user-agent"),
            ip_address=client_ip(request),
        )
    except AuthError as exc:
        _clear_refresh_cookie(response)
        raise HTTPException(exc.status_code, str(exc)) from exc

    _set_refresh_cookie(response, tokens)
    return _auth_result(profile, tokens)


@router.post("/logout", response_model=Ok)
async def logout(response: Response, session: SessionDep, sn_refresh: RefreshCookie = None) -> Ok:
    if sn_refresh:
        await local_auth.logout(session, raw_token=sn_refresh)
    _clear_refresh_cookie(response)
    return Ok(message="Signed out.")


@router.post("/magic-login", response_model=AuthResult)
async def magic_login(
    payload: MagicLoginRequest, request: Request, response: Response, session: SessionDep
) -> AuthResult:
    """The one-click "Sign in to your dashboard" link in welcome emails —
    exchanges the token embedded in the URL for a real session, same shape
    as the old Supabase verifyOtp(type: 'magiclink') flow it replaces."""
    try:
        profile, tokens = await local_auth.consume_magic_link(
            session,
            raw_token=payload.token,
            user_agent=request.headers.get("user-agent"),
            ip_address=client_ip(request),
        )
    except AuthError as exc:
        raise HTTPException(exc.status_code, str(exc)) from exc

    _set_refresh_cookie(response, tokens)
    return _auth_result(profile, tokens)


@router.post(
    "/verify-email", response_model=ProfileRead, dependencies=[Depends(_verify_email_rate_limit)]
)
async def verify_email(payload: VerifyEmailRequest, session: SessionDep) -> ProfileRead:
    try:
        profile = await local_auth.verify_email(session, raw_token=payload.token)
    except AuthError as exc:
        raise HTTPException(exc.status_code, str(exc)) from exc
    return ProfileRead.model_validate(profile)


@router.post(
    "/forgot-password", response_model=Ok, dependencies=[Depends(_forgot_password_rate_limit)]
)
async def forgot_password(payload: ForgotPasswordRequest, session: SessionDep) -> Ok:
    # Same response whether the email exists or not — anything else would
    # let a caller enumerate registered addresses one guess at a time.
    generic = Ok(message="If that email has an account, a reset link has been sent.")

    result = await local_auth.request_password_reset(session, email=str(payload.email))
    if result is None:
        return generic

    profile, raw_token = result
    reset_url = f"{settings.public_app_url.rstrip('/')}/reset-password?token={raw_token}"
    await send_email(
        to=profile.email, subject="Reset your SpeedNum password", html=password_reset_html(url=reset_url)
    )
    return generic


@router.post(
    "/reset-password", response_model=Ok, dependencies=[Depends(_forgot_password_rate_limit)]
)
async def reset_password(payload: ResetPasswordRequest, session: SessionDep) -> Ok:
    try:
        await local_auth.reset_password(session, raw_token=payload.token, new_password=payload.password)
    except AuthError as exc:
        raise HTTPException(exc.status_code, str(exc)) from exc
    return Ok(message="Password updated. Sign in with your new password.")


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
