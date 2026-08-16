"""Access-token verification.

Dispatches on AUTH_PROVIDER, same pattern as services/storage.py's provider
dispatcher: "local" (default) verifies this application's own Ed25519-signed
tokens (services/jwt_keys.py); "supabase" verifies Supabase Auth's tokens,
kept as a documented, inactive-by-default rollback rather than deleted (see
SECURITY.md). deps.py calls verify_token() and only ever sees TokenClaims —
it does not know or care which provider is active.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import jwt
from fastapi import HTTPException, status
from jwt import PyJWKClient

from .config import settings
from .services import jwt_keys

log = logging.getLogger(__name__)

_SYMMETRIC = {"HS256", "HS384", "HS512"}
_ASYMMETRIC = {"RS256", "RS384", "RS512", "ES256", "ES384", "ES512"}


@dataclass(slots=True)
class TokenClaims:
    user_id: str
    email: str | None
    role: str | None
    metadata: dict[str, Any]
    raw: dict[str, Any]


def _claims_from_payload(payload: dict[str, Any]) -> TokenClaims:
    subject = payload.get("sub")
    if not subject:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Access token is missing a subject")
    return TokenClaims(
        user_id=subject,
        email=payload.get("email"),
        role=payload.get("role"),
        metadata=payload.get("user_metadata") or {},
        raw=payload,
    )


def _verify_local(token: str) -> TokenClaims:
    ring = jwt_keys.keyring()
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Malformed access token") from exc

    kid = header.get("kid")
    key = ring.verification_keys.get(kid) if kid else None
    if key is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown signing key")

    try:
        payload = jwt.decode(token, key, algorithms=["EdDSA"])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Access token has expired") from exc
    except jwt.PyJWTError as exc:
        log.warning("Rejected access token: %s", exc)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid access token") from exc

    return _claims_from_payload(payload)


# --- Supabase verification (rollback path, AUTH_PROVIDER=supabase only) -----


@lru_cache
def _jwk_client() -> PyJWKClient:
    if not settings.supabase_url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SUPABASE_URL must be set to verify asymmetric access tokens.",
        )
    return PyJWKClient(settings.jwks_url, cache_keys=True, lifespan=600)


def _decode_supabase(token: str) -> dict[str, Any]:
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Malformed access token") from exc

    alg = header.get("alg", "HS256")
    options = {"verify_aud": bool(settings.jwt_audience)}

    if alg in _SYMMETRIC:
        if not settings.supabase_jwt_secret:
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                "Token is HS256-signed but SUPABASE_JWT_SECRET is not configured.",
            )
        key: Any = settings.supabase_jwt_secret
    elif alg in _ASYMMETRIC:
        key = _jwk_client().get_signing_key_from_jwt(token).key
    else:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Unsupported token algorithm: {alg}")

    return jwt.decode(
        token, key, algorithms=[alg], audience=settings.jwt_audience or None, options=options
    )


def _verify_supabase(token: str) -> TokenClaims:
    try:
        payload = _decode_supabase(token)
    except HTTPException:
        raise
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Access token has expired") from exc
    except jwt.InvalidAudienceError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Access token audience mismatch") from exc
    except jwt.PyJWTError as exc:
        log.warning("Rejected access token: %s", exc)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid access token") from exc

    return _claims_from_payload(payload)


def verify_token(token: str) -> TokenClaims:
    """Validate an access token and return its claims — the only function
    deps.py calls; which provider actually ran is invisible to it."""
    if (settings.auth_provider or "local").strip().lower() == "supabase":
        return _verify_supabase(token)
    return _verify_local(token)
