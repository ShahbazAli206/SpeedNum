"""Unit tests for the backup scheduler's clock (app/services/backup_scheduler.py).

Same property as test_scheduler.py's reminder-sweep tests: a restart must not
drift the daily snapshot time, and the lock-key constant must actually differ
from the reminder sweep's (otherwise the two jobs would block each other).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.config import settings
from app.services import scheduler
from app.services.backup_scheduler import BACKUP_LOCK_KEY, _seconds_until_next_run

HOUR = settings.backup_scheduler_hour


def at(hour: int, minute: int = 0, day: int = 15) -> datetime:
    return datetime(2026, 8, day, hour, minute, tzinfo=timezone.utc)


def test_before_the_target_hour_waits_until_today():
    remaining = _seconds_until_next_run(at(HOUR - 1))
    assert remaining == 3600


def test_at_the_target_hour_waits_a_full_day():
    assert _seconds_until_next_run(at(HOUR)) == timedelta(days=1).total_seconds()


def test_after_the_target_hour_waits_until_tomorrow():
    remaining = _seconds_until_next_run(at(HOUR + 1))
    assert remaining == timedelta(days=1).total_seconds() - 3600


def test_the_hour_does_not_drift_across_restarts():
    for hour in range(24):
        for minute in (0, 37):
            now = at(hour, minute)
            landing = now + timedelta(seconds=_seconds_until_next_run(now))
            assert landing.hour == HOUR
            assert landing.minute == 0
            assert landing.second == 0


def test_lock_key_differs_from_the_reminder_sweep():
    """If these ever collided, a worker sweeping reminders would also block a
    worker trying to build a backup — the two jobs must never share a lock."""
    assert BACKUP_LOCK_KEY != scheduler.SWEEP_LOCK_KEY
