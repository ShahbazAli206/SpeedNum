"""S3-compatible object storage (MinIO on the VPS, or any managed bucket).

Same contract as storage_supabase.py — create_upload_url / create_download_url
/ delete_object — so routers/client_documents.py does not know or care which
provider is active (see services/storage.py, the dispatcher). The frontend
does not know either: frontend/src/lib/storage.ts always just PUTs the file
body to whatever `url` this returns and never reads `token` unless a provider
supplies one, so a presigned S3 URL works there unchanged.

Two clients, two endpoints, on purpose:
  - `_admin_client` talks to `S3_ENDPOINT_URL` (the internal Docker hostname,
    e.g. http://minio:9000) for real network calls this process makes itself
    (delete, and an existence check before signing a download).
  - `_presign_client` is configured with `S3_PUBLIC_ENDPOINT_URL` (the
    HTTPS hostname Caddy proxies to MinIO, e.g.
    https://test.spidnums.com/storage-api) but never makes a request — a
    presigned URL's signature bakes in the host it names, and only the
    browser's own request needs that host to be one it can actually reach.
Both point at the same server for a managed provider where the internal and
public endpoints are identical; kept separate here because MinIO on the VPS
is not publicly reachable on its own port (see deploy/Caddyfile) and never
should be — see the architecture doc's rule against exposing storage admin
ports.
"""

from __future__ import annotations

import asyncio
import logging

import boto3
from botocore.client import Config as BotoConfig
from botocore.exceptions import ClientError

from ..config import settings
from .storage_errors import StorageError

log = logging.getLogger(__name__)

#: Same values as storage_supabase.py — provider-neutral from the router's
#: point of view.
DOWNLOAD_TTL_SECONDS = 300
UPLOAD_TTL_SECONDS = 900


def is_configured() -> bool:
    return bool(
        settings.s3_endpoint_url
        and settings.s3_access_key_id
        and settings.s3_secret_access_key
        and settings.s3_bucket
    )


def _require_configured() -> None:
    if not is_configured():
        raise StorageError(
            "Document storage requires S3_ENDPOINT_URL, S3_ACCESS_KEY_ID, "
            "S3_SECRET_ACCESS_KEY and S3_BUCKET to be configured."
        )


def _boto_config() -> BotoConfig:
    return BotoConfig(
        signature_version="s3v4",
        s3={"addressing_style": "path" if settings.s3_use_path_style else "auto"},
    )


def _client(endpoint: str):
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        region_name=settings.s3_region,
        aws_access_key_id=settings.s3_access_key_id,
        aws_secret_access_key=settings.s3_secret_access_key,
        config=_boto_config(),
    )


def _admin_client():
    return _client(settings.s3_endpoint_url.rstrip("/"))


def _presign_client():
    return _client(settings.s3_public_endpoint)


async def create_upload_url(path: str, *, bucket: str | None = None) -> tuple[str, str]:
    """Sign a PUT for `path`. No token — S3 presigned URLs carry their own
    signature in the query string, so the frontend's plain `fetch(url, {method:
    'PUT'})` needs nothing else (see frontend/src/lib/storage.ts).

    `bucket` defaults to the documents bucket; services/backup_snapshots.py
    passes settings.backup_s3_bucket instead — same client, same signing,
    a different (isolated) bucket.
    """
    _require_configured()
    try:
        url = await asyncio.to_thread(
            _presign_client().generate_presigned_url,
            "put_object",
            Params={"Bucket": bucket or settings.s3_bucket, "Key": path.lstrip("/")},
            ExpiresIn=UPLOAD_TTL_SECONDS,
        )
    except ClientError as exc:
        log.warning("S3 upload presign failed for %s: %s", path, exc)
        raise StorageError("Could not prepare the upload.") from exc
    return url, ""


async def create_download_url(
    path: str, *, expires_in: int = DOWNLOAD_TTL_SECONDS, bucket: str | None = None
) -> str:
    """Sign a GET for an object that should already exist.

    Unlike Supabase's sign-URL endpoint, generating an S3 presigned URL is a
    local computation that never checks the object exists — so this does a
    cheap head_object first to keep the same "that file is no longer in
    storage" behaviour on a metadata row that outlived its object, rather than
    handing back a URL that 404s once the browser follows it.

    `bucket` defaults to the documents bucket; see create_upload_url.
    """
    _require_configured()
    key = path.lstrip("/")
    target_bucket = bucket or settings.s3_bucket
    admin = _admin_client()
    try:
        await asyncio.to_thread(admin.head_object, Bucket=target_bucket, Key=key)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code in ("404", "NoSuchKey", "NotFound"):
            raise StorageError("That file is no longer in storage.") from exc
        log.warning("S3 head_object failed for %s: %s", path, exc)
        raise StorageError("Could not prepare the download.") from exc

    try:
        return await asyncio.to_thread(
            _presign_client().generate_presigned_url,
            "get_object",
            Params={"Bucket": target_bucket, "Key": key},
            ExpiresIn=expires_in,
        )
    except ClientError as exc:
        log.warning("S3 download presign failed for %s: %s", path, exc)
        raise StorageError("Could not prepare the download.") from exc


async def delete_object(path: str, *, bucket: str | None = None) -> None:
    """Best-effort, same as storage_supabase.py: a missing object is success,
    the row is already gone by the time this is called."""
    if not is_configured():
        return
    try:
        await asyncio.to_thread(
            _admin_client().delete_object,
            Bucket=bucket or settings.s3_bucket,
            Key=path.lstrip("/"),
        )
    except ClientError as exc:
        log.warning("S3 delete failed for %s: %s", path, exc)


async def put_object_bytes(path: str, data: bytes, *, bucket: str) -> None:
    """Upload bytes the server already has in memory/disk — used by
    services/backup_snapshots.py to write manifest.json/config.json/
    storage-index.json directly, without the presigned-PUT round trip the
    browser upload path needs (there is no browser here to hand a URL to)."""
    _require_configured()
    try:
        await asyncio.to_thread(
            _admin_client().put_object, Bucket=bucket, Key=path.lstrip("/"), Body=data
        )
    except ClientError as exc:
        log.warning("S3 put_object failed for %s: %s", path, exc)
        raise StorageError("Could not write the object.") from exc


async def list_objects(*, bucket: str, prefix: str = "") -> list[dict]:
    """List every object under `prefix`, paginating transparently — used by
    the backup snapshot builder to enumerate the documents bucket and by the
    admin_backups router to enumerate existing snapshot folders."""
    _require_configured()

    def _list_sync() -> list[dict]:
        client = _admin_client()
        paginator = client.get_paginator("list_objects_v2")
        results: list[dict] = []
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            results.extend(page.get("Contents", []))
        return results

    try:
        return await asyncio.to_thread(_list_sync)
    except ClientError as exc:
        log.warning("S3 list_objects failed for prefix %s: %s", prefix, exc)
        raise StorageError("Could not list objects.") from exc


async def get_object_bytes(path: str, *, bucket: str) -> bytes:
    """Read an object's full bytes — used to fetch a document from the
    documents bucket while building a snapshot, and to re-read manifest.json
    while verifying one."""
    _require_configured()
    try:
        response = await asyncio.to_thread(
            _admin_client().get_object, Bucket=bucket, Key=path.lstrip("/")
        )
        return await asyncio.to_thread(response["Body"].read)
    except ClientError as exc:
        log.warning("S3 get_object failed for %s: %s", path, exc)
        raise StorageError("Could not read the object.") from exc
