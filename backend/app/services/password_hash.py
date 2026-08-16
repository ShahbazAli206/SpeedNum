"""Argon2id password hashing.

Uses argon2-cffi's defaults (Argon2id, the variant resistant to both
GPU-cracking and side-channel attacks — the OWASP-recommended choice over
plain Argon2i/Argon2d), rather than inventing hashing parameters. Never call
into `hashlib`/`bcrypt` directly here — this module is the single place a
password becomes a hash, and it should stay that way.
"""

from __future__ import annotations

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHash

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """True if `password` matches `password_hash`. Never raises — a
    malformed/foreign hash (e.g. from a different algorithm) is just a
    mismatch, not a caller-visible error."""
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHash):
        return False


def needs_rehash(password_hash: str) -> bool:
    """True if this hash was made with weaker parameters than the current
    default — e.g. after a deliberate upgrade to argon2's cost parameters.
    Callers that already have the plaintext password (a successful login)
    should rehash and persist the new hash; nobody else ever has the
    plaintext to do this with."""
    return _hasher.check_needs_rehash(password_hash)
