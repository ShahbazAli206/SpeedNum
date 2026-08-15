"""Storage provider dispatcher.

routers/client_documents.py imports this module only — never a provider
directly — and calls create_upload_url / create_download_url / delete_object /
is_configured. Both providers (storage_supabase.py, storage_s3.py) implement
that exact same contract, so switching STORAGE_PROVIDER is a config change:
nothing downstream of this module needs to know which one is live.

Path scheme, tenant/client ownership checks and signed-URL usage are all
enforced by the caller (routers/client_documents.py's _mint_path and the
prefix check in register_document) before this module is ever reached — this
module only carries out an already-authorised signature request, regardless
of which provider does the signing.
"""

from __future__ import annotations

from ..config import settings
from . import storage_s3, storage_supabase
from .storage_errors import StorageError

__all__ = [
    "StorageError",
    "DOWNLOAD_TTL_SECONDS",
    "UPLOAD_TTL_SECONDS",
    "is_configured",
    "create_upload_url",
    "create_download_url",
    "delete_object",
]

# Both providers define the same TTLs; exposed here because
# routers/client_documents.py reads storage.DOWNLOAD_TTL_SECONDS directly.
DOWNLOAD_TTL_SECONDS = storage_supabase.DOWNLOAD_TTL_SECONDS
UPLOAD_TTL_SECONDS = storage_supabase.UPLOAD_TTL_SECONDS


def _provider():
    choice = (settings.storage_provider or "supabase").strip().lower()
    if choice == "s3":
        return storage_s3
    return storage_supabase


def is_configured() -> bool:
    return _provider().is_configured()


async def create_upload_url(path: str) -> tuple[str, str]:
    return await _provider().create_upload_url(path)


async def create_download_url(path: str, *, expires_in: int = DOWNLOAD_TTL_SECONDS) -> str:
    return await _provider().create_download_url(path, expires_in=expires_in)


async def delete_object(path: str) -> None:
    await _provider().delete_object(path)
