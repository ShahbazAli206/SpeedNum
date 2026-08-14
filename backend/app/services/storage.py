"""Supabase Storage signing, done with the service-role key.

Why the backend signs instead of the browser
--------------------------------------------
`db/migrations/0003_functions.sql` creates the `documents` bucket with
`public = false` and **no policies on `storage.objects`**. Supabase enables RLS
on that table by default, so deny-by-default applies: a browser holding only a
user's anon-role session cannot create a signed upload URL, cannot upload, and
cannot read. The original client-side flow (`supabase.storage.createSignedUploadUrl`
in the browser) therefore could never have worked against the real project — it
was only ever exercised in demo mode, where nothing is called at all.

Signing here with the service-role key sidesteps `storage.objects` RLS entirely,
which means the access decision has to be made *before* we sign. That is the
point: `routers/client_documents.py` already knows the tenant/portal visibility
rules for a document row, so it decides, and this module only carries out an
already-authorised signature.

The bytes still never pass through this API. The browser receives a short-lived
signed URL and talks to Supabase Storage directly, so a large upload cannot burn
the API's request timeout.
"""

from __future__ import annotations

import logging
from urllib.parse import parse_qs, urlsplit

import httpx

from ..config import settings

log = logging.getLogger(__name__)

BUCKET = "documents"

#: Long enough to click through a download, short enough that a leaked URL from
#: a browser history or a shared screenshot is worthless within the hour.
DOWNLOAD_TTL_SECONDS = 300

#: Uploads need more headroom than downloads — a slow connection sending a large
#: attachment should not have its URL expire mid-transfer.
UPLOAD_TTL_SECONDS = 900

_TIMEOUT = 15


class StorageError(RuntimeError):
    """Supabase Storage is unconfigured, or rejected the request."""


def is_configured() -> bool:
    """Whether documents can be stored at all.

    Same pair of settings as services/supabase_admin.py: the project URL, and
    the service-role key that bypasses storage RLS.
    """
    return bool(settings.supabase_url and settings.supabase_service_role_key)


def _require_configured() -> None:
    if not is_configured():
        raise StorageError(
            "Document storage requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be configured."
        )


def _headers() -> dict[str, str]:
    return {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
    }


def _storage_root() -> str:
    return f"{settings.supabase_url.rstrip('/')}/storage/v1"


def _absolute(relative_url: str) -> str:
    """Supabase returns signed URLs relative to /storage/v1 (and inconsistently
    across versions — sometimes with the prefix, sometimes without). Normalise
    to an absolute URL the browser can use as-is."""
    path = relative_url.lstrip("/")
    if path.startswith("storage/v1/"):
        path = path[len("storage/v1/") :]
    return f"{_storage_root()}/{path}"


def _token_from(signed_url: str) -> str | None:
    """Pull the `token` query param out of a signed URL.

    supabase-js's `uploadToSignedUrl(path, token, file)` wants the bare token
    rather than the whole URL, and keeping the browser on that helper avoids
    hand-rolling a multipart PUT here.
    """
    token = parse_qs(urlsplit(signed_url).query).get("token")
    return token[0] if token else None


async def create_upload_url(path: str) -> tuple[str, str]:
    """Sign an upload for `path`, returning (absolute_url, token).

    The object does not exist yet, so there is nothing to authorise against in
    storage — the caller is responsible for having decided that this user may
    write to this client's book.
    """
    _require_configured()
    url = f"{_storage_root()}/object/upload/sign/{BUCKET}/{path.lstrip('/')}"

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.post(
                url, json={"expiresIn": UPLOAD_TTL_SECONDS}, headers=_headers()
            )
    except httpx.HTTPError as exc:
        log.warning("Storage upload-sign request failed: %s", exc)
        raise StorageError("Could not reach Supabase Storage to prepare the upload.") from exc

    if response.status_code >= 400:
        log.warning("Storage upload-sign failed: %s %s", response.status_code, response.text)
        if response.status_code == 409:
            raise StorageError("A file already exists at that path.")
        raise StorageError("Could not prepare the upload.")

    signed = response.json().get("url")
    if not signed:
        raise StorageError("Supabase Storage did not return a signed upload URL.")

    token = _token_from(signed)
    if not token:
        raise StorageError("Supabase Storage returned an upload URL without a token.")

    return _absolute(signed), token


async def create_download_url(path: str, *, expires_in: int = DOWNLOAD_TTL_SECONDS) -> str:
    """Sign a read for an object that already exists."""
    _require_configured()
    url = f"{_storage_root()}/object/sign/{BUCKET}/{path.lstrip('/')}"

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.post(
                url, json={"expiresIn": expires_in}, headers=_headers()
            )
    except httpx.HTTPError as exc:
        log.warning("Storage sign request failed: %s", exc)
        raise StorageError("Could not reach Supabase Storage to prepare the download.") from exc

    if response.status_code == 404:
        # The metadata row outlived its object — a failed upload, or a manual
        # deletion in the Supabase dashboard. Say so rather than returning a
        # signed URL that 404s once the browser follows it.
        raise StorageError("That file is no longer in storage.")
    if response.status_code >= 400:
        log.warning("Storage sign failed: %s %s", response.status_code, response.text)
        raise StorageError("Could not prepare the download.")

    signed = response.json().get("signedURL") or response.json().get("signedUrl")
    if not signed:
        raise StorageError("Supabase Storage did not return a signed URL.")

    return _absolute(signed)


async def delete_object(path: str) -> None:
    """Remove the bytes behind a document row.

    Best-effort by design: the caller has already decided the row should go, and
    refusing to delete the metadata because storage is unreachable would leave a
    row the user cannot clear. A missing object is success — the desired end
    state is "not there", which it already is.
    """
    if not is_configured():
        return

    url = f"{_storage_root()}/object/{BUCKET}/{path.lstrip('/')}"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.delete(url, headers=_headers())
    except httpx.HTTPError as exc:
        log.warning("Storage delete request failed for %s: %s", path, exc)
        return

    if response.status_code == 404:
        return
    if response.status_code >= 400:
        log.warning("Storage delete failed for %s: %s %s", path, response.status_code, response.text)
