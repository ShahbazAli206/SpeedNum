"""The reminder scheduler.

Reminders were endpoint-driven only: `POST /reminders/run` (one firm) and
`POST /admin/reminders/sweep` (all firms). Both are correct, but nothing called
them — so a "10 days left" reminder only existed if a human happened to open the
page and press *Check now*, which defeats the point of a reminder.

This runs the cross-tenant sweep on a timer inside the API process. That suits a
single-container deployment on a VPS: no external cron to install, no second
service to keep credentialed, and the job dies with the process rather than
outliving it.

Two properties make it safe:

* **Idempotent.** `services/reminders.persist` inserts with
  ``ON CONFLICT DO NOTHING`` against ``reminders_dedupe_unique`` and returns only
  genuinely new rows, so a duplicate run creates nothing and emails no one. An
  overlapping manual *Check now* is equally harmless.
* **Non-fatal.** Every failure is logged and swallowed. A sweep that throws must
  never take the API down with it, and the next tick simply tries again.

If you later run more than one API replica, either set
``REMINDER_SCHEDULER_ENABLED=false`` on all but one, or turn it off everywhere
and drive `POST /admin/reminders/sweep` from a single external cron. Two replicas
both sweeping is *safe* (see idempotency above) but wasteful.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from ..config import settings
from ..db import SessionLocal
from ..models import Tenant

log = logging.getLogger(__name__)

# How long to wait after a failure before trying again, rather than spinning.
RETRY_AFTER = timedelta(minutes=15)


def _seconds_until_next_run(now: datetime) -> float:
    """Seconds from `now` until the next scheduled hour, in UTC.

    Deliberately computed against a wall clock rather than a fixed 24h interval:
    a restart at 09:05 should not permanently move the daily sweep to 09:05.
    """
    target = now.replace(
        hour=settings.reminder_sweep_hour, minute=0, second=0, microsecond=0
    )
    if target <= now:
        target += timedelta(days=1)
    return (target - now).total_seconds()


async def run_sweep_once() -> dict[str, int]:
    """Sweep every active tenant. Returns the same totals as the admin endpoint."""
    # Imported here, not at module scope: `sweep_tenant` lives in the reminders
    # *router*, which imports the rest of the app. A top-level import would make
    # services depend on routers and create a cycle through main.py.
    from ..routers.reminders import sweep_tenant

    totals = {"tenants": 0, "created": 0, "skipped": 0, "emailed": 0, "scanned": 0}

    async with SessionLocal() as session:
        tenants = (await session.scalars(select(Tenant).where(Tenant.is_active.is_(True)))).all()
        for tenant in tenants:
            try:
                result = await sweep_tenant(session, tenant, send_emails=True)
            except Exception:  # noqa: BLE001 - one bad tenant must not stop the rest
                log.exception("Reminder sweep failed for tenant %s", tenant.id)
                await session.rollback()
                continue
            totals["tenants"] += 1
            for key, value in result.as_dict().items():
                totals[key] += value
        await session.commit()

    return totals


async def _loop() -> None:
    # Give the app a moment to finish starting before touching the database, so
    # a cold container doesn't race its own connection pool.
    await asyncio.sleep(settings.reminder_sweep_delay_seconds)

    if settings.reminder_sweep_on_start:
        await _sweep_and_log("startup")

    while True:
        delay = _seconds_until_next_run(datetime.now(timezone.utc))
        log.info("Next reminder sweep in %.1f hours", delay / 3600)
        try:
            await asyncio.sleep(delay)
        except asyncio.CancelledError:
            raise
        await _sweep_and_log("scheduled")


async def _sweep_and_log(trigger: str) -> None:
    try:
        totals = await run_sweep_once()
        log.info(
            "Reminder sweep (%s): %s tenants, %s created, %s emailed, %s scanned",
            trigger,
            totals["tenants"],
            totals["created"],
            totals["emailed"],
            totals["scanned"],
        )
    except asyncio.CancelledError:
        raise
    except Exception:  # noqa: BLE001 - never let the scheduler kill the API
        log.exception("Reminder sweep (%s) failed; retrying at the next tick", trigger)
        await asyncio.sleep(RETRY_AFTER.total_seconds())


def start(app_state: object) -> asyncio.Task[None] | None:
    """Start the loop unless it is disabled or the database isn't configured."""
    if not settings.reminder_scheduler_enabled:
        log.info("Reminder scheduler disabled (REMINDER_SCHEDULER_ENABLED=false)")
        return None
    if not settings.is_configured:
        log.warning("Reminder scheduler not started — DATABASE_URL is unset")
        return None

    log.info(
        "Reminder scheduler armed — daily sweep at %02d:00 UTC",
        settings.reminder_sweep_hour,
    )
    return asyncio.create_task(_loop(), name="reminder-sweep")
