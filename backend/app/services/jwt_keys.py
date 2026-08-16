"""Ed25519 (EdDSA) signing keys for locally-issued access tokens.

Asymmetric on purpose: only this backend ever needs to *sign* a token,
while verification logic (here, and potentially a future separate service)
only ever needs the public half. Ed25519 over RS256 for smaller keys/
signatures and because `cryptography` (already a PyJWT[crypto] dependency)
implements it natively.

Key rotation without an outage: `JWT_PRIVATE_KEY` is the one key currently
used to *sign* new tokens. `JWT_PREVIOUS_PUBLIC_KEYS` (comma-separated PEM,
or blank) lists retired keys still accepted for *verifying* tokens that
were signed before a rotation and haven't expired yet. Rotate by generating
a new key, moving the old key's public half into JWT_PREVIOUS_PUBLIC_KEYS,
deploying, and dropping it from that list once ACCESS_TOKEN_TTL_SECONDS has
safely passed.
"""

from __future__ import annotations

import base64
import hashlib
import logging

from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.hazmat.primitives import serialization

from ..config import settings

log = logging.getLogger(__name__)


def _kid_for(public_key: Ed25519PublicKey) -> str:
    """A short, stable identifier for a public key, derived from the key
    itself (not randomly assigned) so the same key always gets the same kid
    across restarts."""
    raw = public_key.public_bytes(
        encoding=serialization.Encoding.Raw, format=serialization.PublicFormat.Raw
    )
    return base64.urlsafe_b64encode(hashlib.sha256(raw).digest()[:16]).decode().rstrip("=")


def _load_private_key() -> Ed25519PrivateKey:
    pem = settings.jwt_private_key
    if not pem:
        # A fresh key every restart means every session is invalidated on
        # deploy — acceptable for a first boot with no users yet, loud
        # enough that it can't be mistaken for the production configuration.
        log.warning(
            "JWT_PRIVATE_KEY is not set — generating an ephemeral signing key. "
            "Every existing session will be invalidated on the next restart. "
            "Set JWT_PRIVATE_KEY in api.env for a real deployment "
            "(generate with: openssl genpkey -algorithm ed25519)."
        )
        return Ed25519PrivateKey.generate()

    normalized = pem.replace("\\n", "\n").encode()
    return serialization.load_pem_private_key(normalized, password=None)  # type: ignore[return-value]


def _load_previous_public_keys() -> dict[str, Ed25519PublicKey]:
    raw = settings.jwt_previous_public_keys
    if not raw.strip():
        return {}
    keys: dict[str, Ed25519PublicKey] = {}
    # Split on the PEM footer so multiple concatenated PEM blocks in one env
    # var (comma-separated would corrupt the base64 body) work correctly.
    for block in raw.split("-----END PUBLIC KEY-----"):
        block = block.strip()
        if not block:
            continue
        pem = block.replace("\\n", "\n") + "\n-----END PUBLIC KEY-----\n"
        key = serialization.load_pem_public_key(pem.encode())
        if isinstance(key, Ed25519PublicKey):
            keys[_kid_for(key)] = key
    return keys


class _KeyRing:
    def __init__(self) -> None:
        self.private_key = _load_private_key()
        self.public_key: Ed25519PublicKey = self.private_key.public_key()
        self.kid = _kid_for(self.public_key)
        self.verification_keys: dict[str, Ed25519PublicKey] = {
            self.kid: self.public_key,
            **_load_previous_public_keys(),
        }

    def public_pem(self, key: Ed25519PublicKey) -> str:
        return key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        ).decode()

    def jwks(self) -> dict[str, object]:
        """RFC 7517-shaped, using OKP (Octet Key Pair) per RFC 8037 for Ed25519."""
        jwks_keys = []
        for kid, key in self.verification_keys.items():
            raw = key.public_bytes(
                encoding=serialization.Encoding.Raw, format=serialization.PublicFormat.Raw
            )
            jwks_keys.append(
                {
                    "kty": "OKP",
                    "crv": "Ed25519",
                    "x": base64.urlsafe_b64encode(raw).decode().rstrip("="),
                    "kid": kid,
                    "use": "sig",
                    "alg": "EdDSA",
                }
            )
        return {"keys": jwks_keys}


_keyring: _KeyRing | None = None


def keyring() -> _KeyRing:
    global _keyring
    if _keyring is None:
        _keyring = _KeyRing()
    return _keyring


def reset_keyring_cache() -> None:
    """Test-only: forces the next keyring() call to reload from settings."""
    global _keyring
    _keyring = None
