"""Supabase Auth (GoTrue) admin calls: provisioning logins.

Used for both kinds of account the app creates on someone's behalf — a
client-portal login pinned to one client, and a firm staff (accountant) login.
The Supabase call is identical for both; what differs is the `profiles` row the
caller writes afterwards and the email that goes out.

Separate from services/email.py because this talks to Supabase's auth server
with the service-role key, not a mail provider — and the failure mode is
different. A mail provider being unconfigured just means "log it and move
on" (send_email already does that); Supabase admin being unconfigured means
there is no account to create at all, so callers should surface that clearly
rather than pretending an invite succeeded.
"""

from __future__ import annotations

import logging
import secrets
import string
import uuid

import httpx

from ..config import settings

log = logging.getLogger(__name__)

_PASSWORD_ALPHABET = string.ascii_letters + string.digits
_PASSWORD_LENGTH = 16


class SupabaseAdminError(RuntimeError):
    """Supabase admin API is unconfigured, or rejected the request."""


def generate_temp_password() -> str:
    """A one-time password shown to the admin in the response and emailed to
    the new account. Not persisted anywhere in our own database — Supabase Auth
    stores only its hash, so a lost password can only be reset, never re-sent."""
    return "".join(secrets.choice(_PASSWORD_ALPHABET) for _ in range(_PASSWORD_LENGTH))


def is_configured() -> bool:
    """Whether logins can be provisioned at all. Routers use this to return a
    clear 424 up front instead of failing halfway through a multi-step create."""
    return _configured()


def _configured() -> bool:
    return bool(settings.supabase_url and settings.supabase_service_role_key)


def _require_configured() -> None:
    if not _configured():
        raise SupabaseAdminError(
            "Client portal logins require SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be configured."
        )


def _headers() -> dict[str, str]:
    return {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
    }


def _admin_url(path: str) -> str:
    return f"{settings.supabase_url.rstrip('/')}/auth/v1/admin{path}"


async def create_auth_user(
    *,
    email: str,
    password: str,
    full_name: str | None,
    metadata: dict[str, object] | None = None,
) -> uuid.UUID:
    """Creates a new Supabase Auth user and returns its id.

    Deliberately does not attempt to pre-assign the id (older GoTrue releases
    don't accept a caller-supplied one) — the caller creates the matching
    `profiles` row afterwards, keyed off whatever id Supabase actually hands
    back.

    `metadata` is merged into `user_metadata`, which Supabase copies into the
    JWT. That is how the Next.js proxy learns whether a token belongs on the firm
    surface or in the client portal without a database round trip on every
    request — see frontend/src/proxy.ts. `profiles.client_id` remains the
    authority; this is a routing hint, never an authorisation decision.
    """
    _require_configured()
    payload: dict[str, object] = {
        "email": email,
        "password": password,
        "email_confirm": True,
    }
    user_metadata: dict[str, object] = dict(metadata or {})
    if full_name:
        user_metadata["full_name"] = full_name
    if user_metadata:
        payload["user_metadata"] = user_metadata

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(_admin_url("/users"), json=payload, headers=_headers())

    if response.status_code >= 400:
        log.warning("Supabase admin createUser failed: %s %s", response.status_code, response.text)
        if response.status_code in (409, 422) or "already" in response.text.lower():
            raise SupabaseAdminError(
                f"A login already exists for {email}. Use the existing account, or a different address."
            )
        raise SupabaseAdminError("Could not create the login. Check the email address.")

    data = response.json()
    raw_id = data.get("id") or (data.get("user") or {}).get("id")
    if not raw_id:
        raise SupabaseAdminError("Supabase did not return an id for the new login.")
    return uuid.UUID(raw_id)


async def reset_password(*, user_id: uuid.UUID, password: str) -> None:
    """Used on resend: the existing login is kept (same id, same profile row),
    only its password is rotated to a new one-time value."""
    _require_configured()
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.put(
            _admin_url(f"/users/{user_id}"), json={"password": password}, headers=_headers()
        )
    if response.status_code >= 400:
        log.warning("Supabase admin updateUser failed: %s %s", response.status_code, response.text)
        raise SupabaseAdminError("Could not reset the password for that login.")


async def delete_auth_user(*, user_id: uuid.UUID) -> None:
    """Removes the Supabase Auth user behind a profile.

    Called when an admin deletes a platform account. Tolerant of a 404: if the
    auth user is already gone, deleting the profile row is still the right
    outcome, and refusing would leave an orphan the admin cannot clear.
    """
    _require_configured()
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.delete(_admin_url(f"/users/{user_id}"), headers=_headers())
    if response.status_code == 404:
        log.info("Supabase auth user %s was already gone", user_id)
        return
    if response.status_code >= 400:
        log.warning("Supabase admin deleteUser failed: %s %s", response.status_code, response.text)
        raise SupabaseAdminError("Could not delete that login from Supabase Auth.")


async def generate_magic_link(*, email: str) -> str | None:
    """Returns a `token_hash` the frontend exchanges via
    `supabase.auth.verifyOtp({token_hash, type: "magiclink"})` for a real
    session — no login form shown, matching the "Sign in to your dashboard"
    button in the welcome email.

    Returns None (rather than raising) when Supabase isn't configured or the
    call fails: the invite still proceeds with the temporary password alone,
    which is strictly less convenient but not broken — the client can still
    sign in manually at /login.
    """
    if not _configured():
        return None
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                _admin_url("/generate_link"),
                json={"type": "magiclink", "email": email},
                headers=_headers(),
            )
        if response.status_code >= 400:
            log.warning("Supabase generate_link failed: %s %s", response.status_code, response.text)
            return None
        data = response.json()
        token_hash = data.get("hashed_token") or (data.get("properties") or {}).get("hashed_token")
        return token_hash or None
    except httpx.HTTPError as exc:
        log.warning("Supabase generate_link request failed: %s", exc)
        return None
