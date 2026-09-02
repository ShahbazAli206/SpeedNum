"""Unit tests for the pure attendance-duration logic behind the Timesheet
page (app/services/attendance.py). record_login/record_logout_confirm need a
database session, so only worked_seconds — a plain function of an
AttendanceDay row — is exercised here, the same scoping test_utils.py and
test_permissions.py use for their own pure-function suites."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from app.models import AttendanceDay
from app.services.attendance import worked_seconds


def _row(*, start: datetime, end: datetime | None) -> AttendanceDay:
    return AttendanceDay(
        id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        profile_id=uuid.uuid4(),
        work_date=start.date(),
        start_time=start,
        end_time=end,
    )


class TestWorkedSeconds:
    def test_no_confirmed_logout_is_zero(self):
        start = datetime(2026, 9, 3, 9, 0, tzinfo=timezone.utc)
        assert worked_seconds(_row(start=start, end=None)) == 0

    def test_confirmed_logout_is_the_span_between_first_login_and_last_confirm(self):
        start = datetime(2026, 9, 3, 9, 0, tzinfo=timezone.utc)
        end = start + timedelta(hours=8, minutes=30)
        assert worked_seconds(_row(start=start, end=end)) == 8 * 3600 + 30 * 60

    def test_never_goes_negative(self):
        # Shouldn't happen given how record_logout_confirm stamps `now()`,
        # but a manually-edited (owner correction) row could invert the
        # order — clamp rather than surface a negative duration.
        start = datetime(2026, 9, 3, 17, 0, tzinfo=timezone.utc)
        end = start - timedelta(hours=1)
        assert worked_seconds(_row(start=start, end=end)) == 0
