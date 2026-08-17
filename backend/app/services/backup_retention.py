"""Backup snapshot retention — safe pruning of old snapshots.

Nothing called `backup_audit_log`'s `prune` action before this module
existed (see BACKUP_ARCHITECTURE.md's "Known Gaps"). Policy: keep the most
recent `settings.backup_retention_keep` ready snapshots. A candidate outside
that window is only ever deleted if ALL of the following hold — getting any
one of these wrong either loses data that exists nowhere else, or corrupts a
still-retained incremental snapshot's restore chain:

1. It is not the last remaining `ready` snapshot (retention must never reach
   zero good backups on the VPS).
2. No still-retained snapshot's parent chain depends on it — an incremental
   snapshot's storage-delta.tar.gz only contains objects that *changed*
   since its parent; deleting an ancestor a kept snapshot still references
   would make that kept snapshot unrestorable.
3. At least one still-*active* (non-revoked) device has confirmed a full
   download of it (`backup_snapshot_devices`, populated by
   admin_backups.py's ack-download) — "the server pruned its copy" must
   never mean "every copy of this data is now gone."
"""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from . import storage_s3

log = logging.getLogger(__name__)


async def _protected_ancestor_ids(session: AsyncSession, keep_ids: list[str]) -> set[str]:
    """Walk each kept snapshot's parent chain back to its full checkpoint —
    every id visited must survive pruning regardless of the keep-count."""
    protected: set[str] = set(keep_ids)
    frontier = list(keep_ids)
    while frontier:
        rows = (
            await session.execute(
                text(
                    "select id, parent_snapshot_id from public.backup_snapshots "
                    "where id = any(:ids) and parent_snapshot_id is not null"
                ),
                {"ids": frontier},
            )
        ).mappings().all()
        frontier = []
        for row in rows:
            parent_id = str(row["parent_snapshot_id"])
            if parent_id not in protected:
                protected.add(parent_id)
                frontier.append(parent_id)
    return protected


async def run_retention_once(session: AsyncSession) -> dict[str, object]:
    ready = (
        await session.execute(
            text(
                "select id, sequence, manifest_object_key from public.backup_snapshots "
                "where status = 'ready' order by sequence desc"
            )
        )
    ).mappings().all()

    if len(ready) <= 1:
        return {"pruned": [], "reason": "one or fewer ready snapshots exist"}

    keep_count = max(1, settings.backup_retention_keep)
    keep = ready[:keep_count]
    keep_ids = [str(row["id"]) for row in keep]
    candidates = ready[keep_count:]

    protected = await _protected_ancestor_ids(session, keep_ids)

    pruned: list[dict[str, object]] = []
    skipped: list[dict[str, object]] = []
    for row in candidates:
        snapshot_id = str(row["id"])
        if snapshot_id in protected:
            skipped.append({"id": snapshot_id, "sequence": row["sequence"], "reason": "referenced by a retained incremental snapshot"})
            continue

        has_offsite_copy = await session.scalar(
            text(
                "select exists(select 1 from public.backup_snapshot_devices bsd "
                "join public.backup_devices d on d.id = bsd.device_id "
                "where bsd.snapshot_id = :id and d.status = 'active')"
            ),
            {"id": row["id"]},
        )
        if not has_offsite_copy:
            skipped.append({"id": snapshot_id, "sequence": row["sequence"], "reason": "no confirmed off-VPS copy yet"})
            continue

        prefix = f"{snapshot_id}/"
        try:
            objects = await storage_s3.list_objects(bucket=settings.backup_s3_bucket, prefix=prefix)
            for obj in objects:
                await storage_s3.delete_object(obj["Key"], bucket=settings.backup_s3_bucket)
        except Exception:  # noqa: BLE001 - do not delete the DB row if we couldn't confirm the objects are gone
            log.exception("Retention: failed to delete MinIO objects for snapshot %s; leaving the row in place", snapshot_id)
            skipped.append({"id": snapshot_id, "sequence": row["sequence"], "reason": "MinIO deletion failed"})
            continue

        await session.execute(
            text(
                "insert into public.backup_audit_log (snapshot_id, snapshot_sequence, action, detail) "
                "values (:id, :sequence, 'prune', cast(:detail as jsonb))"
            ),
            {"id": row["id"], "sequence": row["sequence"], "detail": '{"reason": "retention"}'},
        )
        await session.execute(text("delete from public.backup_snapshots where id = :id"), {"id": row["id"]})
        pruned.append({"id": snapshot_id, "sequence": row["sequence"]})

    await session.commit()
    log.info("Backup retention: pruned %d, skipped %d, kept %d", len(pruned), len(skipped), len(keep))
    return {"pruned": pruned, "skipped": skipped, "kept": len(keep)}
