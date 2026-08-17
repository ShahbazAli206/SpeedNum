"""The backup snapshot scheduler.

Same pattern as services/scheduler.py (the reminder sweep), for the same
reasons: runs on a timer inside the API process, suits a single-container
VPS deployment, and dies with the process rather than outliving it.

Two properties make it safe, mirroring the reminder sweep exactly:

* **Exclusive.** `pg_try_advisory_xact_lock` with a *different* key than the
  reminder sweep's — each worker names the same lock for its own job, but the
  two jobs must never share one, or a worker running reminders would also
  block a worker trying to build a backup. Non-blocking: a worker that loses
  the race skips this tick instead of queueing behind the winner.
* **Non-fatal.** Every failure is logged and swallowed — a scheduled backup
  failing must never take the API down with it. `backup_snapshots.run_backup`
  already converts its own internal failures into a `failed` row rather than
  raising, but this loop guards against a genuinely unexpected exception too.

This sweep also demotes stale `pending`/`uploading` rows to `failed` — a
snapshot that crashed mid-build (container killed, VPS rebooted) would
otherwise sit forever in a state that isn't `ready` but also never gets
cleaned up, and would block `_latest_ready_snapshot`'s parent-chain lookups
from seeing a real prior snapshot.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, text

from ..config import settings
from ..db import SessionLocal
from . import backup_snapshots

log = logging.getLogger(__name__)

RETRY_AFTER = timedelta(minutes=30)

# Different constant than scheduler.py's SWEEP_LOCK_KEY on purpose — see
# module docstring. Advisory locks share one namespace per database.
BACKUP_LOCK_KEY = 8_531_207_441_009_112_777

# A snapshot stuck in pending/uploading longer than this is presumed dead
# (its worker crashed or the VPS restarted mid-build) and is demoted so it
# stops blocking the parent-chain lookup used to decide full-vs-incremental.
STALE_AFTER = timedelta(hours=2)


def _seconds_until_next_run(now: datetime) -> float:
    target = now.replace(hour=settings.backup_scheduler_hour, minute=0, second=0, microsecond=0)
    if target <= now:
        target += timedelta(days=1)
    return (target - now).total_seconds()


async def _demote_stale_snapshots() -> None:
    async with SessionLocal() as session:
        await session.execute(
            text(
                "update public.backup_snapshots set status = 'failed', "
                "error_message = 'Snapshot builder did not finish within the expected window "
                "(process crash or restart mid-build).', completed_at = now() "
                "where status in ('pending', 'uploading') and created_at < :cutoff"
            ),
            {"cutoff": datetime.now(timezone.utc) - STALE_AFTER},
        )
        await session.commit()


async def run_backup_once(*, trigger_source: str = "scheduled") -> dict[str, object]:
    """Build one snapshot. Skipped entirely when another worker holds the
    lock, matching the reminder sweep's non-blocking exclusivity."""
    await _demote_stale_snapshots()

    async with SessionLocal() as session:
        locked = bool(await session.scalar(select(func.pg_try_advisory_xact_lock(BACKUP_LOCK_KEY))))
        if not locked:
            log.info("Backup snapshot skipped — another worker holds the backup lock")
            return {"locked_out": True}

        result = await backup_snapshots.run_backup(session, trigger_source=trigger_source, triggered_by=None)
        return {
            "locked_out": False,
            "snapshot_id": str(result.id),
            "sequence": result.sequence,
            "status": result.status,
            "snapshot_kind": result.snapshot_kind,
        }


async def _loop() -> None:
    await asyncio.sleep(60)  # let the app finish starting before touching the database

    while True:
        delay = _seconds_until_next_run(datetime.now(timezone.utc))
        log.info("Next backup snapshot in %.1f hours", delay / 3600)
        try:
            await asyncio.sleep(delay)
        except asyncio.CancelledError:
            raise
        await _run_and_log("scheduled")


async def _run_and_log(trigger: str) -> None:
    try:
        result = await run_backup_once(trigger_source=trigger)
        if result.get("locked_out"):
            return
        log.info(
            "Backup snapshot (%s): sequence=%s status=%s kind=%s",
            trigger,
            result.get("sequence"),
            result.get("status"),
            result.get("snapshot_kind"),
        )
    except asyncio.CancelledError:
        raise
    except Exception:  # noqa: BLE001 - never let the scheduler kill the API
        log.exception("Backup snapshot (%s) failed; retrying at the next tick", trigger)
        await asyncio.sleep(RETRY_AFTER.total_seconds())


def start(app_state: object) -> asyncio.Task[None] | None:
    """Start the loop unless it is disabled or the database isn't configured."""
    if not settings.backup_scheduler_enabled:
        log.info("Backup scheduler disabled (BACKUP_SCHEDULER_ENABLED=false)")
        return None
    if not settings.is_configured:
        log.warning("Backup scheduler not started — DATABASE_URL is unset")
        return None

    log.info("Backup scheduler armed — daily snapshot at %02d:00 UTC", settings.backup_scheduler_hour)
    return asyncio.create_task(_loop(), name="backup-scheduler")
