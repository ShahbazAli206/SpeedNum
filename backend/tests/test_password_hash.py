"""Unit tests for app/services/password_hash.py. Pure crypto, no database."""

from __future__ import annotations

from app.services.password_hash import hash_password, needs_rehash, verify_password


class TestHashing:
    def test_a_password_hashes_to_something_other_than_itself(self):
        assert hash_password("correct horse battery staple") != "correct horse battery staple"

    def test_hashing_the_same_password_twice_produces_different_hashes(self):
        # Argon2id salts each hash independently — two hashes of the same
        # password must never be comparable by string equality.
        first = hash_password("hunter2")
        second = hash_password("hunter2")
        assert first != second

    def test_the_hash_is_tagged_as_argon2id(self):
        assert hash_password("hunter2").startswith("$argon2id$")


class TestVerification:
    def test_the_correct_password_verifies(self):
        stored = hash_password("hunter2")
        assert verify_password("hunter2", stored) is True

    def test_the_wrong_password_does_not_verify(self):
        stored = hash_password("hunter2")
        assert verify_password("wrong-password", stored) is False

    def test_an_empty_password_does_not_verify(self):
        stored = hash_password("hunter2")
        assert verify_password("", stored) is False

    def test_a_malformed_hash_is_a_mismatch_not_an_exception(self):
        assert verify_password("hunter2", "not-a-real-hash") is False

    def test_a_hash_from_a_different_password_never_verifies(self):
        stored = hash_password("password-one")
        other_stored = hash_password("password-two")
        assert verify_password("password-one", other_stored) is False


class TestRehash:
    def test_a_freshly_hashed_password_does_not_need_rehashing(self):
        assert needs_rehash(hash_password("hunter2")) is False
