"""Unit tests for the pure seat-limit logic in app/seats.py.

The counting queries (_count_staff/_count_clients) need a database and aren't
tested here — same reasoning as test_permissions.py's client_owner_clause
tests: exercise the decision function directly, since that's where a bug
would actually hide (an off-by-one in the comparison, not in a SELECT COUNT).
"""

from __future__ import annotations

from app.seats import int_cap, seat_exceeded


class TestIntCap:
    def test_none_is_unlimited(self):
        assert int_cap(None) is None

    def test_a_bool_is_not_a_cap(self):
        """JSONB round-trips True/False as themselves, and `isinstance(True, int)`
        is True in Python — without this guard, Tenant.settings["max_clients"]
        = True would silently become a cap of 1."""
        assert int_cap(True) is None
        assert int_cap(False) is None

    def test_an_int_passes_through(self):
        assert int_cap(20) == 20

    def test_a_float_from_json_is_coerced_to_int(self):
        assert int_cap(20.0) == 20

    def test_a_string_is_not_a_cap(self):
        assert int_cap("20") is None


class TestSeatExceeded:
    def test_unlimited_cap_is_never_exceeded(self):
        assert seat_exceeded(current=1_000_000, cap=None) is False

    def test_under_the_cap_is_fine(self):
        assert seat_exceeded(current=4, cap=5) is False

    def test_exactly_at_the_cap_after_adding_is_fine(self):
        """current=4, adding 1 more lands at exactly 5 — the 5th seat is
        still purchased and usable, not a violation."""
        assert seat_exceeded(current=4, cap=5) is False

    def test_one_past_the_cap_is_exceeded(self):
        assert seat_exceeded(current=5, cap=5) is True

    def test_adding_more_than_one_is_accounted_for(self):
        """A bulk operation adding several at once (e.g. a future bulk-import
        seat check) — 18 current + 5 adding = 23 against a cap of 20."""
        assert seat_exceeded(current=18, cap=20, adding=5) is True
        assert seat_exceeded(current=15, cap=20, adding=5) is False

    def test_zero_cap_blocks_everything(self):
        assert seat_exceeded(current=0, cap=0) is True
