"""Unit tests for the reminder scheduler's clock (app/services/scheduler.py).

The sweep itself is covered by test_reminders.py (the planning logic) and is
idempotent at the database level, so what is worth pinning down here is *when*
it runs — specifically that a restart cannot drift the daily run, which is the
bug you get from naively sleeping 24h in a loop.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.config import settings
from app.services.scheduler import _seconds_until_next_run

HOUR = settings.reminder_sweep_hour


def at(hour: int, minute: int = 0, day: int = 15) -> datetime:
    return datetime(2026, 8, day, hour, minute, tzinfo=timezone.utc)


def test_before_the_target_hour_waits_until_today():
    remaining = _seconds_until_next_run(at(HOUR - 1))
    assert remaining == 3600


def test_at_the_target_hour_waits_a_full_day():
    """Exactly on the hour counts as already run, not as due now — otherwise a
    process restarting at exactly 06:00:00 would sweep twice."""
    assert _seconds_until_next_run(at(HOUR)) == timedelta(days=1).total_seconds()


def test_after_the_target_hour_waits_until_tomorrow():
    remaining = _seconds_until_next_run(at(HOUR + 1))
    assert remaining == timedelta(days=1).total_seconds() - 3600


def test_the_hour_does_not_drift_across_restarts():
    """A restart at an arbitrary time must still land on the configured hour.

    This is the property a plain `await sleep(86400)` loop fails: restart at
    09:05 and the daily sweep moves permanently to 09:05.
    """
    for hour in range(24):
        for minute in (0, 37):
            now = at(hour, minute)
            landing = now + timedelta(seconds=_seconds_until_next_run(now))
            assert landing.hour == HOUR
            assert landing.minute == 0
            assert landing.second == 0


def test_next_run_is_always_in_the_future():
    for hour in range(24):
        assert _seconds_until_next_run(at(hour)) > 0


def test_next_run_is_never_more_than_a_day_away():
    for hour in range(24):
        for minute in (0, 30, 59):
            assert _seconds_until_next_run(at(hour, minute)) <= timedelta(days=1).total_seconds()
