"""Unit tests for the pure-logic parts of app/services/backup_snapshots.py.

The full build-and-upload path needs a real Postgres and MinIO (covered by
the live disaster-recovery drill, not this suite — see DISASTER_RECOVERY.md).
What's worth pinning down here without either: the config allow-list never
leaks a secret, hashing is correct and stable, the libpq URI conversion pg_dump
needs is right, and the full-vs-incremental decision's two DB-free branches
(no parent yet; below the size threshold) return the expected, cheapest choice.
"""

from __future__ import annotations

import asyncio
import hashlib

import pytest

from app.services.backup_snapshots import (
    _config_allowlist,
    _db_uri_for_pg_dump,
    _decide_incremental,
    _sha256_bytes,
    _sha256_file,
)


def test_config_allowlist_contains_no_secret_field_names():
    """An allow-list, not a deny-list (see the module docstring) — this test
    is the trip-wire for the deny-list mistake: if a secret's field name ever
    appears in the allow-list dict's keys, this fails loudly."""
    forbidden_substrings = ("password", "secret", "private_key", "service_role")
    config = _config_allowlist()
    for key in config:
        lowered = key.lower()
        assert not any(bad in lowered for bad in forbidden_substrings), key


def test_config_allowlist_is_json_serialisable():
    import json

    json.dumps(_config_allowlist())  # raises on anything non-serialisable


def test_sha256_bytes_matches_hashlib():
    data = b"spidnums disaster recovery test payload"
    assert _sha256_bytes(data) == hashlib.sha256(data).hexdigest()


def test_sha256_file_matches_content_and_size(tmp_path):
    data = b"x" * 5000
    path = tmp_path / "sample.bin"
    path.write_bytes(data)
    digest, size = _sha256_file(path)
    assert digest == hashlib.sha256(data).hexdigest()
    assert size == len(data)


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("postgresql+asyncpg://user:pw@host:5432/db", "postgresql://user:pw@host:5432/db"),
        ("postgresql+asyncpg://user:pw@host:5432/db?sslmode=disable", "postgresql://user:pw@host:5432/db?sslmode=disable"),
        ("postgresql://already-plain@host/db", "postgresql://already-plain@host/db"),
    ],
)
def test_db_uri_for_pg_dump_strips_the_asyncpg_dialect_suffix(monkeypatch, raw, expected):
    from app.services import backup_snapshots

    monkeypatch.setattr(backup_snapshots.settings, "database_url", raw)
    assert _db_uri_for_pg_dump() == expected


def test_decide_incremental_is_always_full_with_no_parent():
    kind, keys = asyncio.run(
        _decide_incremental(
            session=None,
            parent=None,
            storage_index={"objects": [{"key": "a"}, {"key": "b"}]},
            storage_bytes_total=999_999_999,
        )
    )
    assert kind == "full"
    assert keys == ["a", "b"]


def test_decide_incremental_is_full_below_the_threshold(monkeypatch):
    from app.services import backup_snapshots

    monkeypatch.setattr(backup_snapshots.settings, "backup_incremental_threshold_bytes", 500 * 1024 * 1024)
    kind, keys = asyncio.run(
        _decide_incremental(
            session=None,
            parent={"id": "some-parent", "manifest_object_key": "x/manifest.json"},
            storage_index={"objects": [{"key": "a"}]},
            storage_bytes_total=1024,  # well below the threshold
        )
    )
    assert kind == "full"
    assert keys == ["a"]
