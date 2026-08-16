"""Unit tests for the pure logic in app/services/rate_limit.py.

The atomic increment-and-check (_hit) needs a real Postgres connection — it
is an INSERT ... ON CONFLICT ... RETURNING, not something meaningfully
fakeable with a mock session — so it is verified separately against a real
database (see PROGRESS.md's rate-limiting entry for that run's actual
output) rather than here. What's pure and testable without a database is
the window-bucketing math those atomic checks rely on.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.services.rate_limit import _window_start


class _FixedClock:
    """Stands in for the module's `datetime` name. Only the two classmethods
    _window_start actually calls need to work; both delegate to the real
    datetime class so their normal semantics (arithmetic, tzinfo, ...) are
    untouched — only "now" is frozen."""

    def __init__(self, fixed: datetime) -> None:
        self._fixed = fixed

    def now(self, tz=None):  # noqa: ANN001 - matches datetime.now's signature
        return self._fixed

    @staticmethod
    def fromtimestamp(*args, **kwargs):
        return datetime.fromtimestamp(*args, **kwargs)


def _freeze(monkeypatch, at: datetime) -> None:
    monkeypatch.setattr("app.services.rate_limit.datetime", _FixedClock(at))


class TestWindowBucketing:
    def test_two_timestamps_in_the_same_window_bucket_together(self, monkeypatch):
        base = datetime(2026, 1, 1, 12, 34, 0, tzinfo=timezone.utc)

        _freeze(monkeypatch, base + timedelta(seconds=2))
        first = _window_start(60)

        _freeze(monkeypatch, base + timedelta(seconds=57))
        second = _window_start(60)

        assert first == second == base

    def test_crossing_a_window_boundary_produces_a_new_bucket(self, monkeypatch):
        base = datetime(2026, 1, 1, 12, 34, 0, tzinfo=timezone.utc)

        _freeze(monkeypatch, base + timedelta(seconds=59))
        before = _window_start(60)

        _freeze(monkeypatch, base + timedelta(seconds=61))
        after = _window_start(60)

        assert before == base
        assert after == base + timedelta(minutes=1)
        assert after > before

    def test_a_five_minute_window_buckets_by_five_minutes_not_one(self, monkeypatch):
        base = datetime(2026, 1, 1, 12, 30, 0, tzinfo=timezone.utc)

        _freeze(monkeypatch, base + timedelta(minutes=4, seconds=59))
        within = _window_start(300)

        _freeze(monkeypatch, base + timedelta(minutes=5, seconds=1))
        next_window = _window_start(300)

        assert within == base
        assert next_window == base + timedelta(minutes=5)

    def test_window_start_is_always_timezone_aware_utc(self):
        result = _window_start(60)
        assert result.tzinfo is not None
        assert result.utcoffset() == timedelta(0)
