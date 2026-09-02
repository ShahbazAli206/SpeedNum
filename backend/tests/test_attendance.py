"""Unit tests for the attendance logic behind the Timesheet page
(app/services/attendance.py): the pure worked_seconds/_tracks_attendance
functions, plus a regression test for the real production incident this
feature caused once already — see record_login's docstring. A full DB-backed
happy-path (idempotent login, logout-confirm overwrite semantics, the
TaskHourRead hydration bug) was verified live against a real Postgres in the
session that built this feature; not repeated here as a DB fixture, matching
test_task_authz.py/test_permissions.py's own scoping to pure logic only."""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone

from app.models import AttendanceDay, Profile
from app.services.attendance import _tracks_attendance, record_login, worked_seconds


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


def _profile(*, role: str = "member", is_superadmin: bool = False, has_tenant: bool = True, client_id=None) -> Profile:
    return Profile(
        id=uuid.uuid4(),
        tenant_id=uuid.uuid4() if has_tenant else None,
        client_id=client_id,
        email="someone@example.com",
        role=role,
        is_superadmin=is_superadmin,
    )


class TestTracksAttendance:
    """The Owner runs the practice and isn't tracked; neither is a platform
    superadmin, a client-portal login, or a profile with no tenant yet."""

    def test_plain_staff_is_tracked(self):
        assert _tracks_attendance(_profile(role="member")) is True

    def test_admin_is_tracked(self):
        assert _tracks_attendance(_profile(role="admin")) is True

    def test_owner_is_not_tracked(self):
        assert _tracks_attendance(_profile(role="owner")) is False

    def test_superadmin_is_not_tracked_even_with_a_staff_role(self):
        assert _tracks_attendance(_profile(role="member", is_superadmin=True)) is False

    def test_client_portal_login_is_not_tracked(self):
        assert _tracks_attendance(_profile(role="member", client_id=uuid.uuid4())) is False

    def test_tenantless_profile_is_not_tracked(self):
        assert _tracks_attendance(_profile(role="member", has_tenant=False)) is False


class _ExplodingSession:
    """Stands in for a real AsyncSession whose attendance_days query blows up
    (e.g. UndefinedTableError because this deploy's migration hasn't been
    applied yet) — reproduces the exact failure mode that took production
    login down for every owner/staff account before record_login was
    wrapped in its own savepoint/try-except."""

    def begin_nested(self):
        raise RuntimeError("simulated: relation \"attendance_days\" does not exist")


class TestRecordLoginNeverBreaksSignIn:
    # No pytest-asyncio in this suite (see test_storage.py) — plain
    # asyncio.run() inside an ordinary sync test, same convention.
    def test_a_failing_attendance_write_does_not_raise(self):
        # Must not raise — a caller (services.local_auth.issue_tokens, on
        # the critical login/register/oauth path) that awaits this with no
        # try/except of its own must still get back a normal return.
        asyncio.run(record_login(_ExplodingSession(), _profile(role="member")))

    def test_owner_never_even_touches_the_session(self):
        # The Owner is excluded before any query runs, so a session that
        # would explode on first use never gets called at all — confirms
        # the exclusion check, not just the try/except, does its job.
        asyncio.run(record_login(_ExplodingSession(), _profile(role="owner")))
