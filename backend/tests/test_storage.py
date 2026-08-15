"""Unit tests for document storage signing (app/services/storage.py) and the
path rules that guard it (app/routers/client_documents.py).

The security-relevant part is the path. Signing uses the service-role key, which
bypasses storage RLS, so "which object may this caller reach" is decided by our
own code and nothing else. Two properties carry that weight:

* the server mints every path under `{tenant}/{client}/`, and
* registration refuses any path outside the caller's own prefix.

Together they mean a forged `storage_path` cannot be aimed at another firm's or
another client's object and then read back through /download-url.

Everything here is pure — no network, no database.
"""

from __future__ import annotations

import uuid

import pytest

from app.routers.client_documents import _mint_path, _prefix_for
from app.services import storage, storage_supabase


class TestMintedPaths:
    def test_path_lives_under_the_tenant_and_client_prefix(self):
        tenant, client = uuid.uuid4(), uuid.uuid4()
        path = _mint_path(tenant, client, "statement.pdf")
        assert path.startswith(f"{tenant}/{client}/")

    def test_two_uploads_of_the_same_name_do_not_collide(self):
        tenant, client = uuid.uuid4(), uuid.uuid4()
        first = _mint_path(tenant, client, "invoice.pdf")
        second = _mint_path(tenant, client, "invoice.pdf")
        assert first != second

    @pytest.mark.parametrize(
        "name",
        [
            "../../../etc/passwd",
            "..\\..\\windows\\system32",
            "sub/dir/file.pdf",
            "file with spaces.pdf",
            "réçu-août.pdf",
        ],
    )
    def test_a_hostile_filename_cannot_escape_its_prefix(self, name):
        """Traversal has to die here, not at the storage layer: the signed URL is
        minted from whatever path we hand Supabase."""
        tenant, client = uuid.uuid4(), uuid.uuid4()
        path = _mint_path(tenant, client, name)

        prefix = _prefix_for(tenant, client)
        assert path.startswith(prefix)
        # One directory level below the prefix, and no way back up.
        assert "/" not in path[len(prefix) :]
        assert ".." not in path

    def test_an_all_punctuation_name_still_produces_a_usable_path(self):
        tenant, client = uuid.uuid4(), uuid.uuid4()
        path = _mint_path(tenant, client, "...")
        assert path.startswith(_prefix_for(tenant, client))
        assert path.endswith("file")

    def test_a_very_long_name_is_capped(self):
        tenant, client = uuid.uuid4(), uuid.uuid4()
        path = _mint_path(tenant, client, "a" * 500 + ".pdf")
        # Comfortably inside ClientDocumentCreate.storage_path's 500-char limit.
        assert len(path) < 300

    def test_the_extension_survives_a_normal_name(self):
        tenant, client = uuid.uuid4(), uuid.uuid4()
        assert _mint_path(tenant, client, "2025 Notice of Assessment.pdf").endswith(".pdf")


class TestPrefixConfinement:
    """The check `register_document` performs, exercised directly."""

    def test_another_clients_path_is_not_under_this_clients_prefix(self):
        tenant = uuid.uuid4()
        mine, theirs = uuid.uuid4(), uuid.uuid4()
        foreign = _mint_path(tenant, theirs, "their-books.pdf")
        assert not foreign.startswith(_prefix_for(tenant, mine))

    def test_another_tenants_path_is_rejected_even_for_the_same_client_id(self):
        client = uuid.uuid4()
        assert not _mint_path(uuid.uuid4(), client, "x.pdf").startswith(
            _prefix_for(uuid.uuid4(), client)
        )

    def test_a_freshly_minted_path_passes_its_own_check(self):
        tenant, client = uuid.uuid4(), uuid.uuid4()
        assert _mint_path(tenant, client, "ok.pdf").startswith(_prefix_for(tenant, client))


class TestSignedUrlParsing:
    """Supabase has returned signed URLs both with and without the /storage/v1
    prefix across versions, so normalisation is pinned rather than assumed.
    Exercises storage_supabase.py directly — this parsing is specific to that
    provider, not part of the storage.py dispatcher's contract."""

    @pytest.fixture(autouse=True)
    def _project_url(self, monkeypatch):
        monkeypatch.setattr(storage_supabase.settings, "supabase_url", "https://ref.supabase.co")

    def test_a_relative_url_becomes_absolute(self):
        assert (
            storage_supabase._absolute("/object/sign/documents/a.pdf?token=abc")
            == "https://ref.supabase.co/storage/v1/object/sign/documents/a.pdf?token=abc"
        )

    def test_an_already_prefixed_url_is_not_doubled(self):
        assert (
            storage_supabase._absolute("/storage/v1/object/sign/documents/a.pdf?token=abc")
            == "https://ref.supabase.co/storage/v1/object/sign/documents/a.pdf?token=abc"
        )

    def test_a_trailing_slash_on_the_project_url_does_not_double_up(self, monkeypatch):
        monkeypatch.setattr(storage_supabase.settings, "supabase_url", "https://ref.supabase.co/")
        assert storage_supabase._absolute("object/sign/documents/a.pdf").startswith(
            "https://ref.supabase.co/storage/v1/object/"
        )

    def test_the_upload_token_is_extracted(self):
        assert storage_supabase._token_from(
            "/object/upload/sign/documents/a.pdf?token=eyJhbG.abc"
        ) == ("eyJhbG.abc")

    def test_a_url_without_a_token_returns_none(self):
        assert storage_supabase._token_from("/object/upload/sign/documents/a.pdf") is None


class TestConfiguration:
    """storage.is_configured()/StorageError are the dispatcher's public
    contract (provider-agnostic); the underlying settings and
    _require_configured() checked here are the Supabase provider's own, since
    STORAGE_PROVIDER defaults to "supabase" and nothing here changes it."""

    def test_unconfigured_storage_is_reported_not_assumed(self, monkeypatch):
        monkeypatch.setattr(storage_supabase.settings, "supabase_url", "")
        monkeypatch.setattr(storage_supabase.settings, "supabase_service_role_key", "")
        assert storage.is_configured() is False
        with pytest.raises(storage.StorageError, match="SUPABASE_URL"):
            storage_supabase._require_configured()

    def test_both_settings_are_required(self, monkeypatch):
        monkeypatch.setattr(storage_supabase.settings, "supabase_url", "https://ref.supabase.co")
        monkeypatch.setattr(storage_supabase.settings, "supabase_service_role_key", "")
        assert storage.is_configured() is False

    def test_configured_when_both_are_present(self, monkeypatch):
        monkeypatch.setattr(storage_supabase.settings, "supabase_url", "https://ref.supabase.co")
        monkeypatch.setattr(storage_supabase.settings, "supabase_service_role_key", "service-key")
        assert storage.is_configured() is True


def test_delete_is_a_no_op_when_storage_is_unconfigured(monkeypatch):
    """Deleting a document row must not fail because storage is unreachable —
    the row is the thing the user asked to remove. Run directly rather than via
    an async plugin: the suite has no pytest-asyncio dependency."""
    import asyncio

    monkeypatch.setattr(storage_supabase.settings, "supabase_url", "")
    monkeypatch.setattr(storage_supabase.settings, "supabase_service_role_key", "")
    asyncio.run(storage.delete_object("tenant/client/file.pdf"))
