"""Staff attendance: first-login and confirmed-logout tracking behind the
Timesheet page (routers/timesheet.py).

record_login is called from services.local_auth.issue_tokens on every real
sign-in (password, magic link, OAuth) — issue_tokens is not called by
refresh(), so a silent token refresh never counts as a new "login". Only
fires for non-owner, non-superadmin firm staff with a tenant already
attached — a client-portal account, the company Owner, a platform
superadmin, or a not-yet-onboarded profile (no tenant yet, e.g.
mid-register) is skipped; the Owner runs the practice, they don't clock in.

record_login runs inside its own SAVEPOINT and never lets a failure there
(e.g. the attendance_days table not existing yet because this deploy's
migration hasn't been applied) propagate and fail the sign-in that
triggered it — login must never depend on this side feature being fully
migrated. A real incident: shipping the hook without this safety net took
production login down for every owner/staff account until the migration
landed. Never repeat that; keep this wrapped.

record_logout_confirm is called only when the staff member explicitly
answers "yes" to "Is this your job end time?" on Logout — never on a raw
session end, tab close, or declined/dismissed prompt, which is what keeps
an unconfirmed day's end_time null (an "empty" sign-off) instead of guessing.
Returns None for a profile attendance doesn't track (see _tracks_attendance).
"""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import AttendanceDay, Profile
from ..utils import now_utc, today_utc

log = logging.getLogger(__name__)


def _tracks_attendance(profile: Profile) -> bool:
    """The Owner runs the practice and isn't "staff" for this feature's
    purpose — spec is explicit that only staff (admin/clerk/accountant-type
    roles) get a Timesheet clock-in/out, not the company Owner, and a
    platform superadmin is excluded for the same reason. A client-portal
    account or a profile with no tenant yet (e.g. mid-register) never
    qualifies either."""
    return (
        profile.tenant_id is not None
        and profile.client_id is None
        and profile.role != "owner"
        and not profile.is_superadmin
    )


async def record_login(session: AsyncSession, profile: Profile) -> None:
    if not _tracks_attendance(profile):
        return
    try:
        async with session.begin_nested():
            today = today_utc()
            existing = await session.scalar(
                select(AttendanceDay.id).where(
                    AttendanceDay.profile_id == profile.id, AttendanceDay.work_date == today
                )
            )
            if existing is not None:
                return  # first login of the day already recorded — start_time is never overwritten
            session.add(
                AttendanceDay(
                    tenant_id=profile.tenant_id,
                    profile_id=profile.id,
                    work_date=today,
                    start_time=now_utc(),
                )
            )
    except Exception:  # noqa: BLE001 - sign-in must survive this feature being broken/unmigrated
        log.warning("attendance.record_login failed; sign-in continues without it", exc_info=True)


async def record_logout_confirm(session: AsyncSession, profile: Profile) -> AttendanceDay | None:
    if not _tracks_attendance(profile):
        return None
    today = today_utc()
    row = await session.scalar(
        select(AttendanceDay).where(
            AttendanceDay.profile_id == profile.id, AttendanceDay.work_date == today
        )
    )
    now = now_utc()
    if row is None:
        # Defensive: a confirmed logout implies a login happened, but guard
        # against the day rolling over between the two, or the login hook
        # having failed/been skipped for some now-stale reason.
        row = AttendanceDay(
            tenant_id=profile.tenant_id, profile_id=profile.id, work_date=today, start_time=now
        )
        session.add(row)
    row.end_time = now
    await session.flush()
    return row


def worked_seconds(row: AttendanceDay) -> int:
    if row.end_time is None:
        return 0
    return max(0, int((row.end_time - row.start_time).total_seconds()))
