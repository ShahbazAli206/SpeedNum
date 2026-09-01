"""Session bootstrap and authentication: who am I, and how did I sign in.

Registration/login/logout/refresh/password-reset/email-verification live
here — services/local_auth.py owns the actual logic (password hashing,
token issuance and rotation); this module is just the HTTP shape around it,
including the one part that has to live at the transport layer: the
refresh token's HttpOnly cookie.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select

from ..config import settings
from ..deps import CurrentUserDep, SessionDep, client_ip
from ..models import Notification, Role
from ..permissions import PERMISSION_KEYS, has_permission
from ..schemas import (
    AuthResult,
    BootstrapRequest,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    MagicLoginRequest,
    MeResponse,
    OAuthCallbackRequest,
    OAuthResult as OAuthResultSchema,
    OAuthStartResponse,
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
_oauth_rate_limit = rate_limit_by_ip("auth-oauth", limit=20, window_seconds=300)


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
        to=profile.email, subject="Confirm your SpidNums account", html=verify_email_html(url=verify_url)
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


@router.get("/oauth/providers")
async def oauth_providers() -> dict[str, bool]:
    """Which "Continue with X" buttons the login/signup pages should render.
    A GET the frontend can call at build time or render time — no
    NEXT_PUBLIC_* env var needed just to know whether a button should
    exist, and it can never drift from what the backend actually has
    credentials for."""
    return {"google": settings.google_oauth_configured}


@router.get(
    "/oauth/{provider}/start",
    dependencies=[Depends(_oauth_rate_limit)],
)
async def oauth_start(
    provider: str,
    session: SessionDep,
    next: str | None = Query(default=None),  # noqa: A002 - matches the query param name
) -> RedirectResponse:
    """The browser navigates here directly (not a fetch — a real OAuth
    redirect needs a top-level navigation), so this returns a 302 straight
    to the provider rather than JSON."""
    try:
        authorize_url = await local_auth.start_oauth(session, provider=provider, next_path=next)
    except AuthError as exc:
        raise HTTPException(exc.status_code, str(exc)) from exc
    return RedirectResponse(authorize_url, status_code=status.HTTP_302_FOUND)


@router.post(
    "/oauth/{provider}/callback",
    response_model=OAuthResultSchema,
    dependencies=[Depends(_oauth_rate_limit)],
)
async def oauth_callback(
    provider: str,
    payload: OAuthCallbackRequest,
    request: Request,
    response: Response,
    session: SessionDep,
) -> OAuthResultSchema:
    """Called by the frontend's own callback page (Google redirects the
    browser there with ?code&state in the URL) rather than being the
    redirect target itself — keeps the code+state exchange as an ordinary
    authenticated-JSON call, the same shape as /auth/magic-login."""
    try:
        result = await local_auth.complete_oauth(
            session,
            provider=provider,
            code=payload.code,
            state=payload.state,
            user_agent=request.headers.get("user-agent"),
            ip_address=client_ip(request),
        )
    except AuthError as exc:
        raise HTTPException(exc.status_code, str(exc)) from exc

    _set_refresh_cookie(response, result.tokens)
    return OAuthResultSchema(
        **_auth_result(result.profile, result.tokens).model_dump(),
        is_new_account=result.is_new_account,
        next_path=result.next_path,
    )


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
        to=profile.email, subject="Reset your SpidNums password", html=password_reset_html(url=reset_url)
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

    profile = ProfileRead.model_validate(user.profile)
    # The portal role chip (frontend lib/session.tsx) shows a staff member's
    # actual role name — e.g. "Manager" — not the fixed owner/admin/member
    # bucket. Only resolved here; every other ProfileRead leaves it None.
    if user.profile.role_id is not None:
        profile.role_name = await session.scalar(
            select(Role.name).where(Role.id == user.profile.role_id)
        )

    return MeResponse(
        profile=profile,
        tenant=TenantRead.model_validate(user.tenant) if user.tenant else None,
        unread_notifications=unread,
        is_impersonating=user.impersonating,
        permissions={key: has_permission(user, key) for key in PERMISSION_KEYS},
    )


@router.patch("/me", response_model=ProfileRead)
async def update_me(payload: ProfileUpdate, session: SessionDep, user: CurrentUserDep) -> ProfileRead:
    apply_updates(
        user.profile,
        payload,
        allowed={"full_name", "title", "phone", "avatar_url", "weekly_capacity", "notify_deadline_digest"},
    )
    await session.flush()
    return ProfileRead.model_validate(user.profile)


@router.post("/complete-password-change", response_model=ProfileRead)
async def complete_password_change(session: SessionDep, user: CurrentUserDep) -> ProfileRead:
    """Flips must_change_password off without touching the password itself —
    kept for the Supabase rollback path, where the frontend calls Supabase's
    own updateUser() first and then just this. AUTH_PROVIDER=local's
    ForcePasswordModal calls /auth/change-password instead, which does both
    in one request. Uses CurrentUserDep, not TenantUserDep — a client-portal
    account must be able to call this about itself."""
    user.profile.must_change_password = False
    await session.flush()
    return ProfileRead.model_validate(user.profile)


@router.post("/change-password", response_model=ProfileRead)
async def change_password(
    payload: ChangePasswordRequest, session: SessionDep, user: CurrentUserDep
) -> ProfileRead:
    """Sets a new password for the signed-in account and clears
    must_change_password in one call — the local-auth equivalent of the
    old Supabase updateUser() + complete-password-change pair. Uses
    CurrentUserDep, not TenantUserDep — a client-portal account must be able
    to call this about itself."""
    try:
        await local_auth.change_own_password(
            session,
            profile_id=user.profile.id,
            new_password=payload.new_password,
            current_password=payload.current_password,
        )
    except AuthError as exc:
        raise HTTPException(exc.status_code, str(exc)) from exc
    user.profile.must_change_password = False
    await session.flush()
    return ProfileRead.model_validate(user.profile)


@router.post("/bootstrap", response_model=MeResponse, status_code=status.HTTP_201_CREATED)
async def bootstrap_firm(payload: BootstrapRequest, user: CurrentUserDep) -> MeResponse:
    """Self-serve firm creation is disabled — a company account is now only
    ever created by a platform superadmin (POST /admin/tenants), who sets its
    seat package deliberately at the same time. Without this, anyone signing
    up (password or Google) got their own tenant with no seat limits at all,
    bypassing the "sold with a package" model entirely.

    Kept as a live 403 rather than deleted outright, so the old /signup and
    /oauth/setup-firm flows (also since disabled — see their own frontend
    changes) get a clear, explained rejection if they're ever reached
    directly, instead of a bare 404."""
    raise HTTPException(
        status.HTTP_403_FORBIDDEN,
        "Self-serve firm creation is disabled. Ask your platform provider to create your company account.",
    )
