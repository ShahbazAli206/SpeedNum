"""Postgres-backed rate limiting for the few endpoints that create
logins/credentials or accept unauthenticated input — see db/migrations/
0008_rate_limits.sql for why this is a table, not Redis or an in-process
counter.

What this does NOT cover: login, signup, password reset, and OTP/magic-link
are Supabase Auth operations the browser calls directly — they never reach
this API at all, so rate limiting them is Supabase's responsibility, not
this module's. What this DOES cover is what this application actually
controls: endpoints that create staff/portal logins, send invitations, or
accept public unauthenticated input.
"""

from __future__ import annotations

import logging
import random
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from math import floor

from fastapi import HTTPException, Request, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import SessionDep, TenantUserDep, client_ip

log = logging.getLogger(__name__)

#: Cheap, unlocked opportunistic cleanup so the table doesn't grow forever —
#: no cron job needed for a table this disposable. 1-in-200 checks is often
#: enough at any real request volume without adding a per-request DELETE.
_CLEANUP_PROBABILITY = 1 / 200
_CLEANUP_MAX_AGE_SECONDS = 3600


def _window_start(window_seconds: int) -> datetime:
    """Buckets `now` down to the start of its fixed window, e.g. window_seconds=60
    maps 12:34:57 and 12:34:02 to the same 12:34:00 bucket but 12:35:01 to a new one."""
    now = datetime.now(timezone.utc).timestamp()
    bucketed = floor(now / window_seconds) * window_seconds
    return datetime.fromtimestamp(bucketed, tz=timezone.utc)


async def _hit(session: AsyncSession, *, key: str, window_seconds: int) -> int:
    """Atomically increments the counter for `key` in the current fixed
    window and returns the new count. The INSERT...ON CONFLICT...RETURNING
    is one round trip and one row lock, so two workers racing on the same
    key can never both observe a stale pre-increment count."""
    window_start = _window_start(window_seconds)
    result = await session.execute(
        text(
            """
            insert into public.rate_limit_hits (bucket_key, window_start, count)
            values (:key, :window_start, 1)
            on conflict (bucket_key, window_start)
            do update set count = public.rate_limit_hits.count + 1
            returning count
            """
        ),
        {"key": key, "window_start": window_start},
    )
    count = result.scalar_one()

    if random.random() < _CLEANUP_PROBABILITY:
        await session.execute(
            text(
                "delete from public.rate_limit_hits "
                "where window_start < now() - make_interval(secs => :max_age)"
            ),
            {"max_age": _CLEANUP_MAX_AGE_SECONDS},
        )

    return count


def _too_many_requests(message: str, *, window_seconds: int) -> HTTPException:
    return HTTPException(
        status.HTTP_429_TOO_MANY_REQUESTS,
        message,
        headers={"Retry-After": str(window_seconds)},
    )


def rate_limit_by_ip(
    name: str, *, limit: int, window_seconds: int = 60
) -> Callable[[Request, SessionDep], Awaitable[None]]:
    """For endpoints reachable without authentication — keyed by caller IP
    (via deps.client_ip, the same X-Forwarded-For handling the audit trail
    already uses)."""

    async def _check(request: Request, session: SessionDep) -> None:
        key = f"{name}:ip:{client_ip(request) or 'unknown'}"
        count = await _hit(session, key=key, window_seconds=window_seconds)
        if count > limit:
            log.warning("Rate limit exceeded: %s", key)
            raise _too_many_requests(
                "Too many requests. Try again in a moment.", window_seconds=window_seconds
            )

    return _check


def rate_limit_by_tenant(
    name: str, *, limit: int, window_seconds: int = 60
) -> Callable[[SessionDep, TenantUserDep], Awaitable[None]]:
    """For authenticated admin actions — keyed by tenant, not caller IP, so a
    firm's staff sharing an office network aren't limited by each other, and
    one firm's abuse can't exhaust another's quota. Requires TenantUserDep,
    so this can only guard routes already behind that dependency (every
    target route in this pass is)."""

    async def _check(session: SessionDep, user: TenantUserDep) -> None:
        scope = user.tenant.id if user.tenant is not None else user.profile.id
        key = f"{name}:tenant:{scope}"
        count = await _hit(session, key=key, window_seconds=window_seconds)
        if count > limit:
            log.warning("Rate limit exceeded: %s", key)
            raise _too_many_requests(
                "Too many requests from your organisation. Try again in a moment.",
                window_seconds=window_seconds,
            )

    return _check
