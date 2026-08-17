"""Unit tests for the S3/MinIO storage provider and the storage.py dispatcher's
provider selection. No network: generate_presigned_url is a local signature
computation, and the dispatcher tests stub the providers entirely."""

from __future__ import annotations

import asyncio

import pytest

from app.services import storage, storage_s3


class TestConfiguration:
    def test_unconfigured_when_any_setting_is_missing(self, monkeypatch):
        monkeypatch.setattr(storage_s3.settings, "s3_endpoint_url", "")
        monkeypatch.setattr(storage_s3.settings, "s3_access_key_id", "key")
        monkeypatch.setattr(storage_s3.settings, "s3_secret_access_key", "secret")
        monkeypatch.setattr(storage_s3.settings, "s3_bucket", "documents")
        assert storage_s3.is_configured() is False

    def test_configured_when_all_four_are_present(self, monkeypatch):
        monkeypatch.setattr(storage_s3.settings, "s3_endpoint_url", "http://minio:9000")
        monkeypatch.setattr(storage_s3.settings, "s3_access_key_id", "key")
        monkeypatch.setattr(storage_s3.settings, "s3_secret_access_key", "secret")
        monkeypatch.setattr(storage_s3.settings, "s3_bucket", "documents")
        assert storage_s3.is_configured() is True

    def test_public_endpoint_falls_back_to_internal_one(self, monkeypatch):
        monkeypatch.setattr(storage_s3.settings, "s3_endpoint_url", "http://minio:9000")
        monkeypatch.setattr(storage_s3.settings, "s3_public_endpoint_url", "")
        assert storage_s3.settings.s3_public_endpoint == "http://minio:9000"

    def test_public_endpoint_is_used_when_set(self, monkeypatch):
        monkeypatch.setattr(storage_s3.settings, "s3_endpoint_url", "http://minio:9000")
        monkeypatch.setattr(
            storage_s3.settings, "s3_public_endpoint_url", "https://test.spidnums.com/storage-api/"
        )
        assert storage_s3.settings.s3_public_endpoint == "https://test.spidnums.com/storage-api"

    def test_delete_is_a_no_op_when_unconfigured(self, monkeypatch):
        monkeypatch.setattr(storage_s3.settings, "s3_endpoint_url", "")
        asyncio.run(storage_s3.delete_object("tenant/client/file.pdf"))

    def test_upload_url_raises_when_unconfigured(self, monkeypatch):
        monkeypatch.setattr(storage_s3.settings, "s3_endpoint_url", "")
        with pytest.raises(storage.StorageError, match="S3_ENDPOINT_URL"):
            asyncio.run(storage_s3.create_upload_url("tenant/client/file.pdf"))


class TestDispatcher:
    """storage.py must route to whichever provider STORAGE_PROVIDER names,
    defaulting to S3 (self-hosted) — the same safe-by-default posture as
    services/accounts.py's auth-provider dispatch: only an explicit
    "supabase" ever selects the rollback provider, so an unset or mistyped
    value fails toward the self-hosted path, not silently toward Supabase."""

    def test_explicit_supabase_selects_the_rollback_provider(self, monkeypatch):
        monkeypatch.setattr(storage.settings, "storage_provider", "supabase")
        assert storage._provider() is storage.storage_supabase

    def test_s3_is_selected_by_name(self, monkeypatch):
        monkeypatch.setattr(storage.settings, "storage_provider", "s3")
        assert storage._provider() is storage.storage_s3

    def test_selection_is_case_insensitive(self, monkeypatch):
        monkeypatch.setattr(storage.settings, "storage_provider", "S3")
        assert storage._provider() is storage.storage_s3

    def test_unknown_provider_falls_back_to_s3_not_supabase(self, monkeypatch):
        monkeypatch.setattr(storage.settings, "storage_provider", "something-else")
        assert storage._provider() is storage.storage_s3

    def test_unset_provider_falls_back_to_s3_not_supabase(self, monkeypatch):
        monkeypatch.setattr(storage.settings, "storage_provider", "")
        assert storage._provider() is storage.storage_s3
