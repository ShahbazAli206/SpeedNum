"""Unit tests for the local JWT signing/verification path (services/jwt_keys.py
and security.py's _verify_local) — pure crypto against a freshly generated
key, no database needed. Database-backed flows (register/login/refresh/
token rotation) are verified separately against a real deployment — see
PROGRESS.md's local-auth entry for that run's actual output."""

from __future__ import annotations

import time
import uuid

import jwt as pyjwt
import pytest
from fastapi import HTTPException

from app.security import _verify_local


@pytest.fixture(autouse=True)
def _fresh_keyring(monkeypatch):
    """Every test gets its own generated key, isolated from whatever the
    process-wide keyring cache holds — jwt_keys.keyring() is cached at
    module scope, so tests reset it before and after."""
    from app.services import jwt_keys

    monkeypatch.setattr("app.services.jwt_keys.settings.jwt_private_key", "")
    monkeypatch.setattr("app.services.jwt_keys.settings.jwt_previous_public_keys", "")
    jwt_keys.reset_keyring_cache()
    yield
    jwt_keys.reset_keyring_cache()


def _sign(payload: dict, *, kid: str | None = None) -> str:
    from app.services import jwt_keys

    ring = jwt_keys.keyring()
    headers = {"kid": kid if kid is not None else ring.kid}
    return pyjwt.encode(payload, ring.private_key, algorithm="EdDSA", headers=headers)


def _valid_payload(**overrides) -> dict:
    base = {
        "sub": str(uuid.uuid4()),
        "email": "person@example.com",
        "role": "authenticated",
        "user_metadata": {"tenant_id": None, "client_id": None, "is_portal": False, "is_staff": True},
        "iat": int(time.time()),
        "exp": int(time.time()) + 900,
    }
    base.update(overrides)
    return base


class TestVerifyLocalHappyPath:
    def test_a_validly_signed_token_verifies(self):
        token = _sign(_valid_payload())
        claims = _verify_local(token)
        assert claims.email == "person@example.com"
        assert claims.role == "authenticated"

    def test_claims_carry_the_routing_metadata(self):
        token = _sign(_valid_payload(user_metadata={"tenant_id": "t1", "client_id": "c1", "is_portal": True, "is_staff": False}))
        claims = _verify_local(token)
        assert claims.metadata["is_portal"] is True
        assert claims.metadata["client_id"] == "c1"


class TestVerifyLocalRejections:
    def test_an_expired_token_is_rejected(self):
        token = _sign(_valid_payload(iat=int(time.time()) - 2000, exp=int(time.time()) - 1000))
        with pytest.raises(HTTPException) as exc_info:
            _verify_local(token)
        assert exc_info.value.status_code == 401
        assert "expired" in exc_info.value.detail.lower()

    def test_a_token_with_an_unknown_kid_is_rejected(self):
        token = _sign(_valid_payload(), kid="not-a-real-key-id")
        with pytest.raises(HTTPException) as exc_info:
            _verify_local(token)
        assert exc_info.value.status_code == 401

    def test_a_malformed_token_is_rejected(self):
        with pytest.raises(HTTPException) as exc_info:
            _verify_local("not.a.jwt")
        assert exc_info.value.status_code == 401

    def test_a_token_signed_by_a_different_key_is_rejected(self):
        """Simulates a forged token: a second, unrelated keyring signs it,
        so its kid won't be in the first keyring's verification_keys at all
        (the realistic failure mode — an attacker doesn't get to reuse our
        own kid), and even if it somehow collided, the signature itself
        would still fail Ed25519 verification against the wrong public key.
        """
        from app.services import jwt_keys
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

        forged_key = Ed25519PrivateKey.generate()
        token = pyjwt.encode(
            _valid_payload(), forged_key, algorithm="EdDSA", headers={"kid": jwt_keys.keyring().kid}
        )
        with pytest.raises(HTTPException) as exc_info:
            _verify_local(token)
        assert exc_info.value.status_code == 401

    def test_a_token_missing_a_subject_is_rejected(self):
        payload = _valid_payload()
        del payload["sub"]
        token = _sign(payload)
        with pytest.raises(HTTPException) as exc_info:
            _verify_local(token)
        assert exc_info.value.status_code == 401


class TestKeyRotation:
    def test_a_token_signed_by_a_retired_key_still_verifies_via_previous_public_keys(self, monkeypatch):
        import base64

        from app.services import jwt_keys
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

        # The "old" key: sign a token with it, then retire it.
        old_key = Ed25519PrivateKey.generate()
        old_public_pem = old_key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        old_kid = jwt_keys._kid_for(old_key.public_key())
        token = pyjwt.encode(_valid_payload(), old_key, algorithm="EdDSA", headers={"kid": old_kid})

        # Rotate: a brand new signing key, with the old one's public half
        # (base64-encoded, matching how JWT_PREVIOUS_PUBLIC_KEYS is actually
        # stored — see jwt_keys._b64decode_pem for why) listed as still
        # acceptable for verification.
        encoded = base64.b64encode(old_public_pem).decode()
        monkeypatch.setattr("app.services.jwt_keys.settings.jwt_previous_public_keys", encoded)
        jwt_keys.reset_keyring_cache()

        claims = _verify_local(token)
        assert claims.email == "person@example.com"

    def test_a_new_token_is_signed_with_the_current_key_not_a_previous_one(self):
        from app.services import jwt_keys
        from app.services.local_auth import create_access_token
        from app.models import Profile
        import uuid as uuid_module

        profile = Profile(id=uuid_module.uuid4(), email="a@example.com", full_name="A", tenant_id=None)
        token = create_access_token(profile)
        header = pyjwt.get_unverified_header(token)
        assert header["kid"] == jwt_keys.keyring().kid
