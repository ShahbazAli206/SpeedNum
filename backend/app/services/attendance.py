"""Staff attendance: first-login and confirmed-logout tracking behind the
Timesheet page (routers/timesheet.py).

record_login is called from services.local_auth.issue_tokens on every real
sign-in (password, magic link, OAuth) — issue_tokens is not called by
refresh(), so a silent token refresh never counts as a new "login". Only
fires for firm staff with a tenant already attached; a client-portal
account or a not-yet-onboarded profile (no tenant yet, e.g. mid-register)
is skipped.

record_logout_confirm is called only when the staff member explicitly
answers "yes" to "Is this your job end time?" on Logout — never on a raw
session end, tab close, or declined/dismissed prompt, which is what keeps
an unconfirmed day's end_time null (an "empty" sign-off) instead of guessing.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import AttendanceDay, Profile
from ..utils import now_utc, today_utc


async def record_login(session: AsyncSession, profile: Profile) -> None:
    if profile.tenant_id is None or profile.client_id is not None:
        return
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


async def record_logout_confirm(session: AsyncSession, profile: Profile) -> AttendanceDay:
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
        # having been skipped for some now-stale reason.
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
