""""Continue with Google" — identity verification only.

Standard OAuth 2.0 authorization-code flow with PKCE. This module talks to
Google and Google alone: building the authorize URL, exchanging a code for
an ID token, and verifying that ID token's signature/issuer/audience/
expiration against Google's own published keys. It never touches a
`Profile` or issues a SpeedNum session — that's local_auth.py's
start_oauth/complete_oauth, which call into this module for the
Google-specific parts.

No provider access or refresh token is ever requested to be stored: the
scope is `openid email profile`, and only the already-verified claims out
of the ID token (sub, email, email_verified, name) are kept, in
oauth_identities — see db/migrations/0011_oauth.sql.
"""

from __future__ import annotations

import urllib.parse

import httpx
import jwt as pyjwt

from ..config import settings

AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
# Google issues both forms across API versions; either is a valid issuer.
VALID_ISSUERS = ("https://accounts.google.com", "accounts.google.com")

_jwks_client: pyjwt.PyJWKClient | None = None


def _jwks() -> pyjwt.PyJWKClient:
    # Lazy + module-cached: PyJWKClient does its own fetch-and-cache
    # internally (keys rarely rotate), so one client for the process
    # lifetime avoids re-fetching Google's JWKS on every login.
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = pyjwt.PyJWKClient(JWKS_URL)
    return _jwks_client


class OAuthProviderError(RuntimeError):
    """Something about the Google exchange or token itself is untrustworthy
    or failed — always surfaced to the caller as a clean auth failure, never
    with the raw provider response, which can carry no user data at all."""


def build_authorize_url(*, state: str, code_challenge: str, nonce: str) -> str:
    if not settings.google_oauth_configured:
        raise OAuthProviderError("Google sign-in is not configured.")
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_oauth_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "nonce": nonce,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        # Lets a user with several Google accounts pick, rather than
        # silently reusing whichever session cookie Google already has.
        "prompt": "select_account",
    }
    return f"{AUTHORIZE_URL}?{urllib.parse.urlencode(params)}"


async def exchange_code(*, code: str, code_verifier: str) -> dict:
    """Server-to-server only — the client secret never reaches the browser."""
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_oauth_redirect_uri,
                "grant_type": "authorization_code",
                "code_verifier": code_verifier,
            },
            headers={"Accept": "application/json"},
        )
    if response.status_code != 200:
        raise OAuthProviderError("Google rejected the sign-in request.")
    body = response.json()
    if not body.get("id_token"):
        raise OAuthProviderError("Google did not return an identity token.")
    return body


def verify_id_token(id_token: str, *, expected_nonce: str) -> dict:
    """Full validation, not just a decode: signature (against Google's live
    JWKS, matched by `kid`), issuer, audience, and expiration are all
    checked by `pyjwt.decode` itself — a token failing any of those raises
    before this function sees the claims. Nonce is checked separately since
    it isn't a registered JWT claim PyJWT validates on its own."""
    try:
        signing_key = _jwks().get_signing_key_from_jwt(id_token)
        claims = pyjwt.decode(
            id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.google_client_id,
            issuer=list(VALID_ISSUERS),
            options={"require": ["exp", "iat", "sub"]},
        )
    except pyjwt.PyJWTError as exc:
        raise OAuthProviderError("Google's identity token failed verification.") from exc

    if claims.get("nonce") != expected_nonce:
        raise OAuthProviderError("Google's identity token did not match this sign-in attempt.")

    return claims
