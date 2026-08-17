"""Unit tests for the Google OAuth identity-verification path
(services/oauth_google.py). Pure crypto against a locally generated RSA
keypair standing in for Google's JWKS — no network call, no database. This
is the security-critical piece social login rests on (signature, issuer,
audience, expiration, nonce), and it's the one part of the feature that
*can* be fully verified without live Google credentials; the account-linking
logic in local_auth.py's complete_oauth is plain CRUD following the same
patterns already exercised by register()/login(), and the full live browser
flow is BLOCKED pending real GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET — see the
2026-08-17 audit's final report.
"""

from __future__ import annotations

import time

import jwt as pyjwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from app.services import oauth_google

CLIENT_ID = "test-client-id.apps.googleusercontent.com"


@pytest.fixture
def google_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _sign(private_key, **overrides) -> str:
    now = int(time.time())
    payload = {
        "iss": "https://accounts.google.com",
        "aud": CLIENT_ID,
        "sub": "1234567890",
        "email": "user@example.com",
        "email_verified": True,
        "name": "Test User",
        "nonce": "expected-nonce",
        "iat": now,
        "exp": now + 3600,
    }
    payload.update(overrides)
    return pyjwt.encode(payload, private_key, algorithm="RS256", headers={"kid": "test-kid"})


class _FakeSigningKey:
    def __init__(self, key):
        self.key = key


class _FakeJWKClient:
    """Stands in for pyjwt.PyJWKClient: real Google verification looks up the
    signing key by `kid` over the network. Here it always hands back
    whichever public key the test wired up — the point of these tests is
    everything `verify_id_token` checks *after* key lookup, matching how
    test_jwt_local_auth.py isolates signature/issuer/audience/expiration
    logic from key-distribution mechanics."""

    def __init__(self, public_key):
        self._public_key = public_key

    def get_signing_key_from_jwt(self, token):
        return _FakeSigningKey(self._public_key)


@pytest.fixture(autouse=True)
def _patch_jwks(monkeypatch, google_key):
    monkeypatch.setattr(oauth_google, "_jwks_client", _FakeJWKClient(google_key.public_key()))
    monkeypatch.setattr(oauth_google.settings, "google_client_id", CLIENT_ID)
    yield


class TestVerifyIdTokenHappyPath:
    def test_a_valid_token_verifies_and_returns_claims(self, google_key):
        claims = oauth_google.verify_id_token(_sign(google_key), expected_nonce="expected-nonce")
        assert claims["sub"] == "1234567890"
        assert claims["email"] == "user@example.com"
        assert claims["email_verified"] is True

    def test_the_bare_issuer_form_is_also_accepted(self, google_key):
        token = _sign(google_key, iss="accounts.google.com")
        claims = oauth_google.verify_id_token(token, expected_nonce="expected-nonce")
        assert claims["sub"] == "1234567890"


class TestVerifyIdTokenRejections:
    def test_wrong_audience_is_rejected(self, google_key):
        token = _sign(google_key, aud="someone-elses-client-id")
        with pytest.raises(oauth_google.OAuthProviderError):
            oauth_google.verify_id_token(token, expected_nonce="expected-nonce")

    def test_wrong_issuer_is_rejected(self, google_key):
        token = _sign(google_key, iss="https://evil.example.com")
        with pytest.raises(oauth_google.OAuthProviderError):
            oauth_google.verify_id_token(token, expected_nonce="expected-nonce")

    def test_an_expired_token_is_rejected(self, google_key):
        token = _sign(google_key, iat=int(time.time()) - 7200, exp=int(time.time()) - 3600)
        with pytest.raises(oauth_google.OAuthProviderError):
            oauth_google.verify_id_token(token, expected_nonce="expected-nonce")

    def test_a_mismatched_nonce_is_rejected(self, google_key):
        token = _sign(google_key)
        with pytest.raises(oauth_google.OAuthProviderError):
            oauth_google.verify_id_token(token, expected_nonce="a-different-nonce")

    def test_a_missing_nonce_is_rejected(self, google_key):
        now = int(time.time())
        payload = {
            "iss": "https://accounts.google.com",
            "aud": CLIENT_ID,
            "sub": "1234567890",
            "iat": now,
            "exp": now + 3600,
        }
        token = pyjwt.encode(payload, google_key, algorithm="RS256", headers={"kid": "test-kid"})
        with pytest.raises(oauth_google.OAuthProviderError):
            oauth_google.verify_id_token(token, expected_nonce="expected-nonce")

    def test_a_token_signed_by_an_unrelated_key_is_rejected(self, google_key):
        """The realistic forgery: an attacker's own key, not Google's — the
        fake JWKS client still resolves to the *real* configured public key
        (exactly as a genuine kid lookup would), so this only passes if
        signature verification is actually enforced, not skipped."""
        forged_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        token = _sign(forged_key)
        with pytest.raises(oauth_google.OAuthProviderError):
            oauth_google.verify_id_token(token, expected_nonce="expected-nonce")

    def test_a_malformed_token_is_rejected(self):
        with pytest.raises(oauth_google.OAuthProviderError):
            oauth_google.verify_id_token("not.a.jwt", expected_nonce="expected-nonce")


class TestBuildAuthorizeUrl:
    def test_includes_pkce_state_and_nonce(self, monkeypatch):
        monkeypatch.setattr(oauth_google.settings, "google_client_secret", "test-secret")
        url = oauth_google.build_authorize_url(state="s1", code_challenge="c1", nonce="n1")
        assert "client_id=test-client-id" in url
        assert "state=s1" in url
        assert "nonce=n1" in url
        assert "code_challenge=c1" in url
        assert "code_challenge_method=S256" in url
        assert "response_type=code" in url
        assert "scope=openid" in url

    def test_raises_when_not_configured(self, monkeypatch):
        monkeypatch.setattr(oauth_google.settings, "google_client_id", "")
        monkeypatch.setattr(oauth_google.settings, "google_client_secret", "")
        with pytest.raises(oauth_google.OAuthProviderError):
            oauth_google.build_authorize_url(state="s1", code_challenge="c1", nonce="n1")


class TestPkcePair:
    def test_challenge_is_the_s256_hash_of_the_verifier(self):
        import base64
        import hashlib

        from app.services.local_auth import _pkce_pair

        verifier, challenge = _pkce_pair()
        expected = (
            base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
        )
        assert challenge == expected
        # RFC 7636 verifier length bounds.
        assert 43 <= len(verifier) <= 128
        # No padding, no reserved characters — must survive as a URL query param.
        assert "=" not in challenge
