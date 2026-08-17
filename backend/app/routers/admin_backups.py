"""Disaster-recovery backup administration — platform superadmin only.

Mirrors admin.py's shape (SuperadminDep on every handler; loose dict/list
response bodies rather than a Pydantic model for every route). A compromised
superadmin session can read every tenant's data via these endpoints — the
single biggest blast radius in this application — so every action here is
recorded in backup_audit_log with actor, IP and user-agent, not just the ones
that mutate something.

No endpoint here can write to or overwrite the live database/storage. That is
deliberate: a "restore to this VPS" button does not exist over HTTP at all —
live-target restore stays an SSH + typed-confirmation operation
(deploy/scripts/restore-{postgres,storage}.sh --live), see BACKUP_ARCHITECTURE.md.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import text

from ..config import settings
from ..deps import SessionDep, SuperadminDep, client_ip
from ..services import backup_retention, backup_scheduler, storage_s3
from ..services.rate_limit import rate_limit_by_ip
from ..services.storage_errors import StorageError
from .admin_devices import ActiveDeviceDep

router = APIRouter(prefix="/admin/backups", tags=["admin"])

# The data-exfiltration point (a stolen/compromised superadmin session or a
# revoked device retrying) — worth its own limit distinct from ordinary
# listing/triggering. 20/5min is generous for legitimate sync (4 components
# per snapshot) while still bounding a scripted enumeration attempt.
_download_url_rate_limit = rate_limit_by_ip("backup-download-url", limit=20, window_seconds=300)


async def _audit(
    session: SessionDep,
    *,
    request: Request,
    user: SuperadminDep,
    action: str,
    snapshot_id: uuid.UUID | None = None,
    snapshot_sequence: int | None = None,
    detail: dict[str, Any] | None = None,
    device_id: uuid.UUID | None = None,
) -> None:
    await session.execute(
        text(
            "insert into public.backup_audit_log "
            "(snapshot_id, snapshot_sequence, actor_profile_id, action, detail, ip_address, user_agent, device_id) "
            "values (:snapshot_id, :sequence, :actor, :action, cast(:detail as jsonb), :ip, :ua, :device_id)"
        ),
        {
            "snapshot_id": snapshot_id,
            "sequence": snapshot_sequence,
            "actor": user.profile.id,
            "action": action,
            # asyncpg's jsonb codec wants a JSON string it can encode, not a
            # Python dict — a bare dict fails with "AttributeError: 'dict'
            # object has no attribute 'encode'" (found via a live test).
            "detail": json.dumps(detail or {}),
            "ip": client_ip(request),
            "ua": request.headers.get("user-agent", "")[:500],
            "device_id": device_id,
        },
    )
    await session.commit()


@router.get("")
async def list_snapshots(session: SessionDep, user: SuperadminDep, request: Request) -> list[dict[str, Any]]:
    rows = (
        await session.execute(
            text(
                "select id, sequence, parent_snapshot_id, status, snapshot_kind, "
                "schema_version, app_version, manifest_sha256, "
                "postgres_size_bytes, storage_size_bytes, storage_bytes_total, "
                "tenants_count, clients_count, documents_count, storage_objects_count, "
                "trigger_source, error_message, downloaded_at, last_drill_at, last_drill_ok, "
                "created_at, completed_at "
                "from public.backup_snapshots order by sequence desc limit 200"
            )
        )
    ).mappings().all()
    await _audit(session, request=request, user=user, action="list")
    return [dict(row) for row in rows]


@router.get("/{snapshot_id}")
async def get_manifest(
    snapshot_id: uuid.UUID, session: SessionDep, user: SuperadminDep, request: Request
) -> dict[str, Any]:
    row = (
        await session.execute(
            text(
                "select id, sequence, manifest_object_key, manifest_sha256, status "
                "from public.backup_snapshots where id = :id"
            ),
            {"id": snapshot_id},
        )
    ).mappings().first()
    if row is None or row["status"] != "ready" or not row["manifest_object_key"]:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Snapshot not found.")

    manifest_bytes = await storage_s3.get_object_bytes(row["manifest_object_key"], bucket=settings.backup_s3_bucket)
    actual_hash = hashlib.sha256(manifest_bytes).hexdigest()
    if actual_hash != row["manifest_sha256"]:
        # The manifest object no longer matches what this database recorded
        # at build time — refuse rather than hand back something a client
        # would otherwise trust. See migration 0010's header comment: this
        # row is the trust root, not the MinIO object.
        raise HTTPException(status.HTTP_409_CONFLICT, "Manifest hash mismatch — this snapshot is not trustworthy.")

    await _audit(session, request=request, user=user, action="list", snapshot_id=row["id"], snapshot_sequence=row["sequence"])
    return json.loads(manifest_bytes)


_ALLOWED_COMPONENTS = {"postgres_dump", "storage_delta", "storage_index", "config"}
_COMPONENT_FILENAMES = {
    "postgres_dump": "postgres.sql.gz",
    "storage_delta": "storage-delta.tar.gz",
    "storage_index": "storage-index.json",
    "config": "config.json",
}


class DownloadUrlResponse(BaseModel):
    url: str
    expires_in: int


@router.post("/{snapshot_id}/download-url", dependencies=[Depends(_download_url_rate_limit)])
async def download_url(
    snapshot_id: uuid.UUID,
    component: str,
    session: SessionDep,
    user: SuperadminDep,
    request: Request,
    device_id: ActiveDeviceDep,
) -> DownloadUrlResponse:
    """Requires a registered, non-revoked device (see admin_devices.py) —
    this is the actual bytes-exfiltration point, unlike listing or
    triggering, which the web admin portal also needs to reach without a
    registered device."""
    if component not in _ALLOWED_COMPONENTS:
        # A closed allow-list, not "whatever string the caller sent" — the
        # object key is built server-side from this value, so an unchecked
        # value here would be a path-traversal opportunity.
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown component.")

    row = (
        await session.execute(
            text("select id, sequence, status from public.backup_snapshots where id = :id"),
            {"id": snapshot_id},
        )
    ).mappings().first()
    if row is None or row["status"] != "ready":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Snapshot not found.")

    key = f"{snapshot_id}/{_COMPONENT_FILENAMES[component]}"
    try:
        url = await storage_s3.create_download_url(
            key, expires_in=settings.backup_download_ttl_seconds, bucket=settings.backup_s3_bucket
        )
    except StorageError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc

    await _audit(
        session,
        request=request,
        user=user,
        action="download_url_issued",
        snapshot_id=row["id"],
        snapshot_sequence=row["sequence"],
        detail={"component": component},
        device_id=device_id,
    )
    return DownloadUrlResponse(url=url, expires_in=settings.backup_download_ttl_seconds)


@router.post("/run")
async def trigger_backup(session: SessionDep, user: SuperadminDep, request: Request) -> dict[str, Any]:
    result = await backup_scheduler.run_backup_once(trigger_source="manual")
    if result.get("locked_out"):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "A backup is already running (another worker holds the lock)."
        )
    await _audit(
        session,
        request=request,
        user=user,
        action="trigger",
        snapshot_id=uuid.UUID(result["snapshot_id"]) if result.get("snapshot_id") else None,
        snapshot_sequence=result.get("sequence"),
        detail={"status": result.get("status"), "snapshot_kind": result.get("snapshot_kind")},
    )
    return result


@router.post("/{snapshot_id}/ack-download")
async def ack_download(
    snapshot_id: uuid.UUID, session: SessionDep, user: SuperadminDep, request: Request, device_id: ActiveDeviceDep
) -> dict[str, Any]:
    """The desktop app confirms a full, checksum-verified download of every
    component landed locally, tied to the specific device that has it
    (backup_snapshot_devices) — this is what retention (services/
    backup_retention.py) checks before ever pruning a snapshot: "the server
    deleted its copy" must never mean "every copy is gone," so retention only
    removes a snapshot once at least one still-active device confirmed one."""
    row = (
        await session.execute(
            text("select id, sequence from public.backup_snapshots where id = :id and status = 'ready'"),
            {"id": snapshot_id},
        )
    ).mappings().first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Snapshot not found.")

    await session.execute(
        text("update public.backup_snapshots set downloaded_at = now() where id = :id"),
        {"id": snapshot_id},
    )
    await session.execute(
        text(
            "insert into public.backup_snapshot_devices (snapshot_id, device_id) "
            "values (:snapshot_id, :device_id) "
            "on conflict (snapshot_id, device_id) do update set downloaded_at = now()"
        ),
        {"snapshot_id": snapshot_id, "device_id": device_id},
    )
    await _audit(
        session, request=request, user=user, action="download_confirmed",
        snapshot_id=row["id"], snapshot_sequence=row["sequence"], device_id=device_id,
    )
    return {"ok": True}


class RestoreDrillResult(BaseModel):
    ok: bool
    detail: dict[str, Any] = Field(default_factory=dict)


@router.post("/retention/run")
async def trigger_retention(session: SessionDep, user: SuperadminDep, request: Request) -> dict[str, Any]:
    """Retention normally runs automatically right after each scheduled
    snapshot (see backup_scheduler.py) — this exists for an operator who
    wants to see the effect immediately, e.g. right after lowering
    BACKUP_RETENTION_KEEP or confirming a batch of ack-downloads."""
    result = await backup_retention.run_retention_once(session)
    await _audit(session, request=request, user=user, action="prune", detail=result)
    return result


@router.post("/{snapshot_id}/restore-drill")
async def report_restore_drill(
    snapshot_id: uuid.UUID,
    payload: RestoreDrillResult,
    session: SessionDep,
    user: SuperadminDep,
    request: Request,
    device_id: ActiveDeviceDep,
) -> dict[str, Any]:
    """The desktop app reports the outcome of a restore drill it ran locally
    against a disposable Docker stack (see BACKUP_ARCHITECTURE.md) — this
    endpoint only records the result, it never runs or triggers a restore
    itself."""
    row = (
        await session.execute(
            text("select id, sequence from public.backup_snapshots where id = :id"),
            {"id": snapshot_id},
        )
    ).mappings().first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Snapshot not found.")

    await session.execute(
        text(
            "update public.backup_snapshots set last_drill_at = now(), last_drill_ok = :ok "
            "where id = :id"
        ),
        {"id": snapshot_id, "ok": payload.ok},
    )
    await _audit(
        session, request=request, user=user, action="restore_drill_result",
        snapshot_id=row["id"], snapshot_sequence=row["sequence"], detail=payload.detail | {"ok": payload.ok},
        device_id=device_id,
    )
    return {"ok": True}
