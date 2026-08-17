"""Disaster-recovery backup snapshot builder.

Wraps the same `pg_dump --clean --if-exists | gzip` invocation
deploy/scripts/backup-postgres.sh already runs against the live database
(proven, restore-verified — see BACKUP_AND_RESTORE.md) plus a MinIO object
enumeration/archive step, packages the result as a versioned, checksummed
manifest, and uploads everything into the `backups` bucket — a separate
bucket from `documents` (config.settings.backup_s3_bucket) so a policy
mistake on one can never expose the other.

No new database credential is introduced. `settings.database_url` — the
API's own least-privilege `speednum_app` connection string — is already
sufficient: verified live that a full `pg_dump` as that role produces zero
permission errors and complete row data for every table, because the
least-privilege migration granted it blanket access when it was set up.
Reusing it here keeps the API process holding exactly the credentials it
already held; it never gains the Postgres superuser password.

Object content hashes are always a real SHA-256 read of the object's bytes,
never the S3 ETag — ETag is only `md5(content)` for a single-part upload;
a multipart upload's ETag is `md5-of-part-md5s`, a different, non-comparable
value. Uploads today are always a single presigned PUT, but computing a real
hash costs nothing extra at this data scale and never breaks if that changes.
"""

from __future__ import annotations

import asyncio
import gzip
import hashlib
import json
import logging
import tarfile
import tempfile
import uuid
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from urllib.parse import urlsplit

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models import Client, Document, Tenant
from . import storage_s3

log = logging.getLogger(__name__)

MANIFEST_VERSION = 1
ENCRYPTION_METADATA_VERSION = 1


class BackupError(Exception):
    """A snapshot could not be built. Callers mark the row `failed` and log
    `error_message` rather than letting this propagate into a 500 — a
    scheduled backup failing must never take the API down with it (same
    discipline as services/scheduler.py's sweep)."""


@dataclass
class SnapshotResult:
    id: uuid.UUID
    sequence: int
    status: str
    snapshot_kind: str
    error_message: str | None = None


def _db_uri_for_pg_dump() -> str:
    """`settings.database_url` is `postgresql+asyncpg://...` for SQLAlchemy;
    pg_dump/psql speak plain libpq URIs and don't understand the `+asyncpg`
    dialect suffix, so strip it. Everything else about the URI is unchanged
    (host, port, user, password, dbname, and any query string like
    sslmode=disable) — see db.py for why sslmode=disable is required here."""
    url = settings.database_url
    if url.startswith("postgresql+asyncpg://"):
        return "postgresql://" + url[len("postgresql+asyncpg://") :]
    return url


async def _run_pg_dump(dest_path: Path) -> None:
    """Full `pg_dump --clean --if-exists`, gzipped as it streams — never
    holds the uncompressed dump in memory or on disk at once."""
    uri = _db_uri_for_pg_dump()
    proc = await asyncio.create_subprocess_exec(
        "pg_dump",
        uri,
        "--clean",
        "--if-exists",
        "--no-owner",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    assert proc.stdout is not None
    with gzip.open(dest_path, "wb") as gz:
        while True:
            chunk = await proc.stdout.read(1024 * 1024)
            if not chunk:
                break
            gz.write(chunk)
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise BackupError(f"pg_dump exited {proc.returncode}: {stderr.decode(errors='replace')[:2000]}")


def _sha256_file(path: Path) -> tuple[str, int]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as fh:
        while chunk := fh.read(1024 * 1024):
            digest.update(chunk)
            size += len(chunk)
    return digest.hexdigest(), size


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


async def _build_storage_index() -> tuple[dict, dict[str, bytes]]:
    """Enumerate every object in the documents bucket, hashing each one.

    Returns (index_dict, object_bytes_by_key) — the bytes are kept in memory
    only long enough to decide the full-vs-incremental split and populate a
    tar; at current production scale (near-zero documents) this is trivial.
    Revisit (stream to temp files instead) if document volume grows enough
    for this to matter — the manifest/index format doesn't need to change
    either way.
    """
    objects = await storage_s3.list_objects(bucket=settings.s3_bucket)
    index_entries = []
    object_bytes: dict[str, bytes] = {}
    for obj in objects:
        key = obj["Key"]
        data = await storage_s3.get_object_bytes(key, bucket=settings.s3_bucket)
        object_bytes[key] = data
        index_entries.append(
            {
                "key": key,
                "size": len(data),
                "sha256": _sha256_bytes(data),
                "etag": obj.get("ETag", "").strip('"'),
                "last_modified": obj["LastModified"].isoformat()
                if hasattr(obj.get("LastModified"), "isoformat")
                else str(obj.get("LastModified")),
            }
        )
    return {"objects": index_entries, "deleted_since_parent": []}, object_bytes


async def _fetch_parent_index(parent_manifest_key: str) -> dict | None:
    try:
        prefix = parent_manifest_key.rsplit("/", 1)[0]
        raw = await storage_s3.get_object_bytes(
            f"{prefix}/storage-index.json", bucket=settings.backup_s3_bucket
        )
        return json.loads(raw)
    except Exception:  # noqa: BLE001 - a missing/corrupt parent index just forces a full snapshot
        log.warning("Could not read parent storage-index.json at %s; falling back to a full snapshot", parent_manifest_key)
        return None


def _config_allowlist() -> dict:
    """Explicit allow-list, not a deny-list — a future secret field added to
    Settings is excluded by default instead of leaking the first time someone
    forgets to blacklist it. Nothing here is sensitive."""
    return {
        "environment": settings.environment,
        "app_version": settings.app_version,
        "auth_provider": settings.auth_provider,
        "storage_provider": settings.storage_provider,
        "cors_origins": settings.cors_origin_list,
        "email_provider": settings.resolved_email_provider,
        "reminder_scheduler_enabled": settings.reminder_scheduler_enabled,
        "backup_scheduler_enabled": settings.backup_scheduler_enabled,
        "backup_scheduler_hour": settings.backup_scheduler_hour,
    }


async def _counts(session: AsyncSession) -> dict[str, int]:
    tenants = await session.scalar(select(func.count()).select_from(Tenant))
    clients = await session.scalar(select(func.count()).select_from(Client))
    documents = await session.scalar(select(func.count()).select_from(Document))
    return {"tenants": tenants or 0, "clients": clients or 0, "documents": documents or 0}


async def _latest_ready_snapshot(session: AsyncSession) -> dict | None:
    row = (
        await session.execute(
            text(
                "select id, sequence, manifest_object_key, snapshot_kind, storage_bytes_total "
                "from public.backup_snapshots where status = 'ready' "
                "order by sequence desc limit 1"
            )
        )
    ).mappings().first()
    return dict(row) if row else None


async def _snapshots_since_last_full(session: AsyncSession) -> int:
    row = (
        await session.execute(
            text(
                "select count(*) from public.backup_snapshots "
                "where status = 'ready' and snapshot_kind = 'incremental' "
                "and sequence > coalesce("
                "  (select max(sequence) from public.backup_snapshots "
                "   where status = 'ready' and snapshot_kind = 'full'), 0)"
            )
        )
    ).scalar()
    return row or 0


async def run_backup(
    session: AsyncSession, *, trigger_source: str, triggered_by: uuid.UUID | None
) -> SnapshotResult:
    """Build one snapshot end-to-end. Never raises past this function under
    normal failure modes (pg_dump error, MinIO error) — the row is marked
    `failed` with `error_message` instead, matching services/scheduler.py's
    "a scheduled job must never take the API down" discipline. Programming
    errors (bad SQL, etc.) still raise, since those indicate a real bug worth
    surfacing loudly rather than silently swallowing.
    """
    snapshot_id = uuid.uuid4()
    insert_row = await session.execute(
        text(
            "insert into public.backup_snapshots "
            "(id, status, snapshot_kind, trigger_source, triggered_by, schema_version, app_version) "
            "values (:id, 'pending', 'full', :trigger_source, :triggered_by, :schema_version, :app_version) "
            "returning sequence"
        ),
        {
            "id": snapshot_id,
            "trigger_source": trigger_source,
            "triggered_by": triggered_by,
            "schema_version": await _current_schema_version(session),
            "app_version": settings.app_version,
        },
    )
    sequence = insert_row.scalar_one()
    await session.commit()

    try:
        result = await _build_and_upload(session, snapshot_id=snapshot_id, sequence=sequence)
        await session.commit()
        return result
    except Exception as exc:  # noqa: BLE001 - convert to a `failed` row, see docstring
        log.exception("Backup snapshot %s failed", snapshot_id)
        await session.execute(
            text(
                "update public.backup_snapshots set status = 'failed', error_message = :msg, "
                "completed_at = now() where id = :id"
            ),
            {"id": snapshot_id, "msg": str(exc)[:2000]},
        )
        await session.commit()
        return SnapshotResult(id=snapshot_id, sequence=sequence, status="failed", snapshot_kind="full", error_message=str(exc))


async def _current_schema_version(session: AsyncSession) -> str:
    row = await session.execute(
        text("select version from public.schema_migrations order by version desc limit 1")
    )
    value = row.scalar()
    return value or "unknown"


async def _build_and_upload(session: AsyncSession, *, snapshot_id: uuid.UUID, sequence: int) -> SnapshotResult:
    await session.execute(
        text("update public.backup_snapshots set status = 'uploading' where id = :id"),
        {"id": snapshot_id},
    )
    await session.commit()

    prefix = str(snapshot_id)
    parent = await _latest_ready_snapshot(session)

    with tempfile.TemporaryDirectory(prefix="speednum-backup-") as tmp:
        tmp_path = Path(tmp)

        pg_dump_path = tmp_path / "postgres.sql.gz"
        await _run_pg_dump(pg_dump_path)
        postgres_sha256, postgres_size = _sha256_file(pg_dump_path)
        await storage_s3.put_object_bytes(
            f"{prefix}/postgres.sql.gz", pg_dump_path.read_bytes(), bucket=settings.backup_s3_bucket
        )

        storage_index, object_bytes = await _build_storage_index()
        storage_bytes_total = sum(o["size"] for o in storage_index["objects"])

        snapshot_kind, tar_entries = await _decide_incremental(
            session, parent=parent, storage_index=storage_index, storage_bytes_total=storage_bytes_total
        )
        storage_index["deleted_since_parent"] = []
        if snapshot_kind == "incremental" and parent is not None:
            for entry in storage_index["objects"]:
                if entry["key"] not in tar_entries:
                    entry["location"] = {"ref_snapshot": parent["id"]}
                else:
                    entry["location"] = {"in": "this-delta"}
        else:
            for entry in storage_index["objects"]:
                entry["location"] = {"in": "this-delta"}

        tar_path = tmp_path / "storage-delta.tar.gz"
        with tarfile.open(tar_path, "w:gz") as tar:
            for key in tar_entries:
                data = object_bytes[key]
                info = tarfile.TarInfo(name=key)
                info.size = len(data)
                tar.addfile(info, BytesIO(data))
        storage_sha256, storage_size = _sha256_file(tar_path)
        await storage_s3.put_object_bytes(
            f"{prefix}/storage-delta.tar.gz", tar_path.read_bytes(), bucket=settings.backup_s3_bucket
        )

        storage_index_bytes = json.dumps(storage_index, indent=2).encode()
        storage_index_sha256 = _sha256_bytes(storage_index_bytes)
        await storage_s3.put_object_bytes(
            f"{prefix}/storage-index.json", storage_index_bytes, bucket=settings.backup_s3_bucket
        )

        config_bytes = json.dumps(_config_allowlist(), indent=2).encode()
        config_sha256 = _sha256_bytes(config_bytes)
        await storage_s3.put_object_bytes(f"{prefix}/config.json", config_bytes, bucket=settings.backup_s3_bucket)

        counts = await _counts(session)
        manifest = {
            "manifest_version": MANIFEST_VERSION,
            "snapshot_id": str(snapshot_id),
            "sequence": sequence,
            "parent_snapshot_id": parent["id"] if (snapshot_kind == "incremental" and parent) else None,
            "snapshot_kind": snapshot_kind,
            "schema_version": await _current_schema_version(session),
            "app_version": settings.app_version,
            "components": {
                "postgres_dump": {
                    "object_key": f"{prefix}/postgres.sql.gz",
                    "size_bytes": postgres_size,
                    "sha256": postgres_sha256,
                },
                "storage_delta": {
                    "object_key": f"{prefix}/storage-delta.tar.gz",
                    "size_bytes": storage_size,
                    "sha256": storage_sha256,
                    "objects_in_delta": len(tar_entries),
                },
                "storage_index": {
                    "object_key": f"{prefix}/storage-index.json",
                    "size_bytes": len(storage_index_bytes),
                    "sha256": storage_index_sha256,
                },
                "config": {
                    "object_key": f"{prefix}/config.json",
                    "size_bytes": len(config_bytes),
                    "sha256": config_sha256,
                },
            },
            "counts": {
                **counts,
                "storage_objects_total": len(storage_index["objects"]),
                "storage_bytes_total": storage_bytes_total,
            },
        }
        manifest_bytes = json.dumps(manifest, indent=2).encode()
        manifest_sha256 = _sha256_bytes(manifest_bytes)
        await storage_s3.put_object_bytes(f"{prefix}/manifest.json", manifest_bytes, bucket=settings.backup_s3_bucket)

        await session.execute(
            text(
                "update public.backup_snapshots set "
                "status = 'ready', snapshot_kind = :kind, "
                "parent_snapshot_id = :parent_id, "
                "manifest_object_key = :manifest_key, manifest_sha256 = :manifest_sha256, "
                "postgres_sha256 = :postgres_sha256, postgres_size_bytes = :postgres_size, "
                "storage_sha256 = :storage_sha256, storage_size_bytes = :storage_size, "
                "storage_index_sha256 = :storage_index_sha256, config_sha256 = :config_sha256, "
                "tenants_count = :tenants, clients_count = :clients, documents_count = :documents, "
                "storage_objects_count = :storage_objects_count, storage_bytes_total = :storage_bytes_total, "
                "completed_at = now() "
                "where id = :id"
            ),
            {
                "id": snapshot_id,
                "kind": snapshot_kind,
                "parent_id": parent["id"] if (snapshot_kind == "incremental" and parent) else None,
                "manifest_key": f"{prefix}/manifest.json",
                "manifest_sha256": manifest_sha256,
                "postgres_sha256": postgres_sha256,
                "postgres_size": postgres_size,
                "storage_sha256": storage_sha256,
                "storage_size": storage_size,
                "storage_index_sha256": storage_index_sha256,
                "config_sha256": config_sha256,
                "tenants": counts["tenants"],
                "clients": counts["clients"],
                "documents": counts["documents"],
                "storage_objects_count": len(storage_index["objects"]),
                "storage_bytes_total": storage_bytes_total,
            },
        )

    return SnapshotResult(id=snapshot_id, sequence=sequence, status="ready", snapshot_kind=snapshot_kind)


async def _decide_incremental(
    session: AsyncSession, *, parent: dict | None, storage_index: dict, storage_bytes_total: int
) -> tuple[str, list[str]]:
    """Returns (snapshot_kind, keys_to_include_in_this_delta).

    Full below the size threshold (simplest, cheapest at low volume), full on
    a synthetic-full cadence even once incremental is active (bounds the
    restore reference chain — see config.py's BACKUP_SYNTHETIC_FULL_EVERY_N),
    otherwise a real content-hash diff against the parent's own index.
    """
    all_keys = [o["key"] for o in storage_index["objects"]]

    if parent is None or storage_bytes_total < settings.backup_incremental_threshold_bytes:
        return "full", all_keys

    since_full = await _snapshots_since_last_full(session)
    if since_full + 1 >= settings.backup_synthetic_full_every_n:
        return "full", all_keys

    parent_index = await _fetch_parent_index(parent["manifest_object_key"])
    if parent_index is None:
        return "full", all_keys

    parent_hashes = {o["key"]: o["sha256"] for o in parent_index["objects"]}
    changed = [
        entry["key"]
        for entry in storage_index["objects"]
        if parent_hashes.get(entry["key"]) != entry["sha256"]
    ]
    return "incremental", changed
