"""Supabase JWT verification.

Supabase projects sign access tokens either with a shared secret (legacy HS256)
or with a rotating asymmetric key published as JWKS. Both are supported here so
the same image works against any project.
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


@lru_cache
def _jwk_client() -> PyJWKClient:
    if not settings.supabase_url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SUPABASE_URL must be set to verify asymmetric access tokens.",
        )
    # PyJWKClient keeps its own short-lived cache of the key set.
    return PyJWKClient(settings.jwks_url, cache_keys=True, lifespan=600)


def _decode(token: str) -> dict[str, Any]:
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:  # malformed token
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
        token,
        key,
        algorithms=[alg],
        audience=settings.jwt_audience or None,
        options=options,
    )


def verify_token(token: str) -> TokenClaims:
    """Validate a Supabase access token and return its claims."""
    try:
        payload = _decode(token)
    except HTTPException:
        raise
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Access token has expired") from exc
    except jwt.InvalidAudienceError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Access token audience mismatch") from exc
    except jwt.PyJWTError as exc:
        log.warning("Rejected access token: %s", exc)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid access token") from exc

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
