"""Self-hosted authentication: replaces Supabase Auth as the identity
provider. Owns password hashing (via password_hash.py), access-token
issuance (via jwt_keys.py), refresh-token rotation, email verification, the
magic-link one-click sign-in, and password reset.

Kept as one module rather than split further because these flows share
state (the same profile, the same token tables) and security review is
easier when the whole authentication surface is in one place, not
scattered across files.
"""

from __future__ import annotations

import hashlib
import logging
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import jwt as pyjwt
from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models import Profile
from . import jwt_keys
from .password_hash import hash_password, needs_rehash, verify_password

log = logging.getLogger(__name__)

MAX_FAILED_LOGINS = 10
LOCKOUT_MINUTES = 15


class AuthError(RuntimeError):
    """A caller-visible authentication failure."""

    def __init__(self, message: str, *, status_code: int = 401) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass(slots=True)
class TokenPair:
    access_token: str
    refresh_token: str
    refresh_expires_at: datetime


def _token_hash(raw: str) -> str:
    """SHA-256, not Argon2id: these are already-high-entropy random tokens
    (secrets.token_urlsafe), not human-chosen passwords, so a fast
    cryptographic hash is the right tool — Argon2id's deliberate slowness
    exists to blunt guessing a low-entropy secret, which doesn't apply here
    and would just make every refresh/verification slower for nothing."""
    return hashlib.sha256(raw.encode()).hexdigest()


def _generate_raw_token() -> str:
    return secrets.token_urlsafe(32)


def _routing_metadata(*, tenant_id: uuid.UUID | None, client_id: uuid.UUID | None) -> dict[str, object]:
    """Same shape as accounts.py's old Supabase-metadata helper — the
    frontend's proxy.ts reads these exact keys out of the JWT to route a
    signed-in user to the firm app or the client portal without a database
    round trip. A routing hint only: every endpoint still derives
    permission from `profiles`, never from this claim."""
    return {
        "tenant_id": str(tenant_id) if tenant_id is not None else None,
        "client_id": str(client_id) if client_id is not None else None,
        "is_portal": client_id is not None,
        "is_staff": client_id is None,
    }


def create_access_token(profile: Profile) -> str:
    ring = jwt_keys.keyring()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(profile.id),
        "email": profile.email,
        "role": "authenticated",
        "user_metadata": _routing_metadata(tenant_id=profile.tenant_id, client_id=profile.client_id),
        "iat": now,
        "exp": now + timedelta(seconds=settings.access_token_ttl_seconds),
    }
    return pyjwt.encode(payload, ring.private_key, algorithm="EdDSA", headers={"kid": ring.kid})


async def _issue_refresh_token(
    session: AsyncSession, *, profile_id: uuid.UUID, user_agent: str | None, ip_address: str | None
) -> tuple[str, datetime]:
    raw = _generate_raw_token()
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=settings.refresh_token_ttl_seconds)
    await session.execute(
        text(
            """
            insert into public.auth_refresh_tokens
                (profile_id, token_hash, user_agent, ip_address, expires_at)
            values (:profile_id, :token_hash, :user_agent, :ip_address, :expires_at)
            """
        ),
        {
            "profile_id": profile_id,
            "token_hash": _token_hash(raw),
            "user_agent": user_agent,
            "ip_address": ip_address,
            "expires_at": expires_at,
        },
    )
    return raw, expires_at


async def issue_tokens(
    session: AsyncSession, profile: Profile, *, user_agent: str | None, ip_address: str | None
) -> TokenPair:
    raw_refresh, expires_at = await _issue_refresh_token(
        session, profile_id=profile.id, user_agent=user_agent, ip_address=ip_address
    )
    return TokenPair(
        access_token=create_access_token(profile),
        refresh_token=raw_refresh,
        refresh_expires_at=expires_at,
    )


async def register(
    session: AsyncSession,
    *,
    email: str,
    password: str,
    full_name: str,
    user_agent: str | None,
    ip_address: str | None,
) -> tuple[Profile, TokenPair]:
    """Creates a brand-new profile with no tenant (mirrors the old Supabase
    signup path, where deps._provision_profile / POST /auth/bootstrap
    attaches a firm afterward) and its password credentials."""
    email = email.strip().lower()
    if await session.scalar(select(Profile).where(Profile.email == email)) is not None:
        raise AuthError(f"{email} already has an account.", status_code=409)

    profile = Profile(
        id=uuid.uuid4(),
        tenant_id=None,
        email=email,
        full_name=full_name.strip() or email,
        role="owner",
        is_active=True,
    )
    session.add(profile)
    await session.flush()

    await session.execute(
        text(
            "insert into public.auth_credentials (profile_id, password_hash) "
            "values (:profile_id, :password_hash)"
        ),
        {"profile_id": profile.id, "password_hash": hash_password(password)},
    )

    tokens = await issue_tokens(session, profile, user_agent=user_agent, ip_address=ip_address)
    return profile, tokens


async def login(
    session: AsyncSession, *, email: str, password: str, user_agent: str | None, ip_address: str | None
) -> tuple[Profile, TokenPair]:
    email = email.strip().lower()
    profile = await session.scalar(select(Profile).where(Profile.email == email))

    # Same generic message whether the email doesn't exist or the password
    # is wrong — distinguishing the two would let a caller enumerate
    # registered addresses one guess at a time.
    generic = AuthError("Incorrect email or password.")

    if profile is None:
        raise generic

    row = (
        await session.execute(
            text(
                "select password_hash, failed_logins, locked_until from public.auth_credentials "
                "where profile_id = :profile_id"
            ),
            {"profile_id": profile.id},
        )
    ).mappings().first()
    if row is None:
        raise generic

    if row["locked_until"] and row["locked_until"] > datetime.now(timezone.utc):
        raise AuthError(
            "Too many failed attempts. Try again in a few minutes.", status_code=423
        )

    if not verify_password(password, row["password_hash"]):
        failed = row["failed_logins"] + 1
        locked_until = (
            datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MINUTES)
            if failed >= MAX_FAILED_LOGINS
            else None
        )
        await session.execute(
            text(
                "update public.auth_credentials set failed_logins = :failed, locked_until = :locked "
                "where profile_id = :profile_id"
            ),
            {"failed": failed, "locked": locked_until, "profile_id": profile.id},
        )
        await session.commit()  # durable regardless of what the caller does next — see rate_limit.py
        raise generic

    if not profile.is_active:
        raise AuthError("This account has been deactivated.", status_code=403)

    updates: dict[str, object] = {"failed_logins": 0, "locked_until": None}
    if needs_rehash(row["password_hash"]):
        updates["password_hash"] = hash_password(password)
    await session.execute(
        text(
            "update public.auth_credentials set "
            + ", ".join(f"{key} = :{key}" for key in updates)
            + " where profile_id = :profile_id"
        ),
        {**updates, "profile_id": profile.id},
    )

    tokens = await issue_tokens(session, profile, user_agent=user_agent, ip_address=ip_address)
    return profile, tokens


async def refresh(
    session: AsyncSession, *, raw_token: str, user_agent: str | None, ip_address: str | None
) -> tuple[Profile, TokenPair]:
    """Rotates a refresh token: the presented one is marked used
    (replaced_by set) and a new one is issued. Presenting a token that was
    already rotated or revoked is treated as reuse — evidence the token was
    copied — and revokes every other session for that profile rather than
    just rejecting the one request, on the theory that a stolen token is
    more likely to be used again than reported."""
    token_hash = _token_hash(raw_token)
    row = (
        await session.execute(
            text(
                "select id, profile_id, expires_at, revoked_at, replaced_by "
                "from public.auth_refresh_tokens where token_hash = :token_hash"
            ),
            {"token_hash": token_hash},
        )
    ).mappings().first()

    if row is None:
        raise AuthError("Invalid session. Please sign in again.")

    if row["revoked_at"] is not None or row["replaced_by"] is not None:
        log.warning("Refresh token reuse detected for profile %s — revoking all sessions", row["profile_id"])
        await revoke_all_sessions(session, row["profile_id"])
        await session.commit()
        raise AuthError("Session invalid — please sign in again.", status_code=401)

    if row["expires_at"] < datetime.now(timezone.utc):
        raise AuthError("Your session has expired. Please sign in again.")

    profile = await session.get(Profile, row["profile_id"])
    if profile is None or not profile.is_active:
        raise AuthError("This account has been deactivated.", status_code=403)

    new_raw, new_expires_at = await _issue_refresh_token(
        session, profile_id=profile.id, user_agent=user_agent, ip_address=ip_address
    )
    new_id_row = (
        await session.execute(
            text("select id from public.auth_refresh_tokens where token_hash = :token_hash"),
            {"token_hash": _token_hash(new_raw)},
        )
    ).first()
    await session.execute(
        text(
            "update public.auth_refresh_tokens set revoked_at = now(), replaced_by = :new_id "
            "where id = :old_id"
        ),
        {"new_id": new_id_row[0], "old_id": row["id"]},
    )

    return profile, TokenPair(
        access_token=create_access_token(profile), refresh_token=new_raw, refresh_expires_at=new_expires_at
    )


async def logout(session: AsyncSession, *, raw_token: str) -> None:
    await session.execute(
        text(
            "update public.auth_refresh_tokens set revoked_at = now() "
            "where token_hash = :token_hash and revoked_at is null"
        ),
        {"token_hash": _token_hash(raw_token)},
    )


async def revoke_all_sessions(session: AsyncSession, profile_id: uuid.UUID) -> None:
    await session.execute(
        text(
            "update public.auth_refresh_tokens set revoked_at = now() "
            "where profile_id = :profile_id and revoked_at is null"
        ),
        {"profile_id": profile_id},
    )


# --- Email verification / magic link ---------------------------------------
# Same underlying primitive (a single-use, hashed, short-lived token) serves
# both — they differ only in what consuming the token does afterward.

_VERIFY_EMAIL_TTL = timedelta(hours=24)
_MAGIC_LINK_TTL = timedelta(minutes=15)


async def _issue_email_token(session: AsyncSession, *, profile_id: uuid.UUID, purpose: str, ttl: timedelta) -> str:
    raw = _generate_raw_token()
    await session.execute(
        text(
            "insert into public.auth_email_tokens (token_hash, profile_id, purpose, expires_at) "
            "values (:token_hash, :profile_id, :purpose, :expires_at)"
        ),
        {
            "token_hash": _token_hash(raw),
            "profile_id": profile_id,
            "purpose": purpose,
            "expires_at": datetime.now(timezone.utc) + ttl,
        },
    )
    return raw


async def request_email_verification(session: AsyncSession, profile_id: uuid.UUID) -> str:
    return await _issue_email_token(
        session, profile_id=profile_id, purpose="verify_email", ttl=_VERIFY_EMAIL_TTL
    )


async def generate_magic_link(session: AsyncSession, *, profile_id: uuid.UUID) -> str:
    """Same contract as the old services/supabase_admin.py::generate_magic_link
    call sites expect: return a raw token the caller embeds in an email URL."""
    return await _issue_email_token(
        session, profile_id=profile_id, purpose="magic_link", ttl=_MAGIC_LINK_TTL
    )


async def _consume_email_token(session: AsyncSession, *, raw_token: str, purpose: str) -> uuid.UUID:
    token_hash = _token_hash(raw_token)
    row = (
        await session.execute(
            text(
                "select profile_id, purpose, expires_at, used_at from public.auth_email_tokens "
                "where token_hash = :token_hash"
            ),
            {"token_hash": token_hash},
        )
    ).mappings().first()

    if row is None or row["purpose"] != purpose:
        raise AuthError("This link is invalid.", status_code=400)
    if row["used_at"] is not None:
        raise AuthError("This link has already been used.", status_code=400)
    if row["expires_at"] < datetime.now(timezone.utc):
        raise AuthError("This link has expired.", status_code=400)

    await session.execute(
        text("update public.auth_email_tokens set used_at = now() where token_hash = :token_hash"),
        {"token_hash": token_hash},
    )
    return row["profile_id"]


async def verify_email(session: AsyncSession, *, raw_token: str) -> Profile:
    profile_id = await _consume_email_token(session, raw_token=raw_token, purpose="verify_email")
    await session.execute(
        text("update public.auth_credentials set email_verified = true where profile_id = :profile_id"),
        {"profile_id": profile_id},
    )
    profile = await session.get(Profile, profile_id)
    assert profile is not None
    return profile


async def consume_magic_link(
    session: AsyncSession, *, raw_token: str, user_agent: str | None, ip_address: str | None
) -> tuple[Profile, TokenPair]:
    profile_id = await _consume_email_token(session, raw_token=raw_token, purpose="magic_link")
    profile = await session.get(Profile, profile_id)
    if profile is None or not profile.is_active:
        raise AuthError("This account has been deactivated.", status_code=403)
    tokens = await issue_tokens(session, profile, user_agent=user_agent, ip_address=ip_address)
    return profile, tokens


# --- Password reset ----------------------------------------------------------

_RESET_TTL = timedelta(hours=1)


async def request_password_reset(session: AsyncSession, *, email: str) -> tuple[Profile, str] | None:
    """Returns None when the email doesn't exist — the router turns both
    outcomes into the same generic response, so a caller can't use this to
    enumerate registered addresses."""
    profile = await session.scalar(select(Profile).where(Profile.email == email.strip().lower()))
    if profile is None:
        return None

    raw = _generate_raw_token()
    await session.execute(
        text(
            "insert into public.auth_password_reset_tokens (token_hash, profile_id, expires_at) "
            "values (:token_hash, :profile_id, :expires_at)"
        ),
        {
            "token_hash": _token_hash(raw),
            "profile_id": profile.id,
            "expires_at": datetime.now(timezone.utc) + _RESET_TTL,
        },
    )
    return profile, raw


async def reset_password(session: AsyncSession, *, raw_token: str, new_password: str) -> Profile:
    token_hash = _token_hash(raw_token)
    row = (
        await session.execute(
            text(
                "select profile_id, expires_at, used_at from public.auth_password_reset_tokens "
                "where token_hash = :token_hash"
            ),
            {"token_hash": token_hash},
        )
    ).mappings().first()

    if row is None:
        raise AuthError("This reset link is invalid.", status_code=400)
    if row["used_at"] is not None:
        raise AuthError("This reset link has already been used.", status_code=400)
    if row["expires_at"] < datetime.now(timezone.utc):
        raise AuthError("This reset link has expired.", status_code=400)

    await session.execute(
        text("update public.auth_password_reset_tokens set used_at = now() where token_hash = :token_hash"),
        {"token_hash": token_hash},
    )
    await session.execute(
        text(
            "update public.auth_credentials set password_hash = :password_hash, "
            "failed_logins = 0, locked_until = null where profile_id = :profile_id"
        ),
        {"password_hash": hash_password(new_password), "profile_id": row["profile_id"]},
    )
    # A password reset is a strong signal the old sessions might not be
    # trustworthy (that's usually *why* someone resets it) — sign out
    # everywhere rather than leaving old refresh tokens valid.
    await revoke_all_sessions(session, row["profile_id"])

    profile = await session.get(Profile, row["profile_id"])
    assert profile is not None
    return profile


# --- Admin-facing provisioning: same call shape as the old ------------------
# services/supabase_admin.py, so services/accounts.py needs minimal changes
# to dispatch between providers.


def generate_temp_password() -> str:
    """Same contract as supabase_admin.py's version — a one-time password
    shown to the admin and emailed to the new account."""
    alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(16))


async def create_credentials(session: AsyncSession, *, profile_id: uuid.UUID, password: str) -> None:
    """Called by services/accounts.py right after it creates the `profiles`
    row for a locally-authenticated account (team invite, portal invite,
    bulk import) — auth_credentials has a FK to profiles, so this has to
    happen second."""
    await session.execute(
        text(
            "insert into public.auth_credentials (profile_id, password_hash, email_verified) "
            "values (:profile_id, :password_hash, true)"
        ),
        # An admin-provisioned account's email is taken on faith (the admin
        # typed it), unlike self-registration — no verification step needed.
        {"profile_id": profile_id, "password_hash": hash_password(password)},
    )


async def admin_reset_password(session: AsyncSession, *, profile_id: uuid.UUID, password: str) -> None:
    await session.execute(
        text(
            "update public.auth_credentials set password_hash = :password_hash, "
            "failed_logins = 0, locked_until = null where profile_id = :profile_id"
        ),
        {"password_hash": hash_password(password), "profile_id": profile_id},
    )
    await revoke_all_sessions(session, profile_id)


async def admin_revoke_user(session: AsyncSession, *, profile_id: uuid.UUID) -> bool:
    """Matches supabase_admin.delete_auth_user's contract (revoke access,
    not necessarily delete the row) — the caller already deactivates the
    profile; this just kills its sessions so a stolen access token can't
    outlive a logout initiated by an admin."""
    await revoke_all_sessions(session, profile_id)
    return True
