"""Seat-limit enforcement — the "owners purchase N seats" half of the
platform build-out. Two independent pools:

  - staff seats: `Tenant.seats` (a first-class column that already existed —
    the superadmin tenant-edit screen already called this `max_users` and
    wrote it here, see admin.py's `_caps`/`provision_tenant`/`edit_tenant`).
  - client seats: `Tenant.settings["max_clients"]` (already existed as a
    soft/display-only cap in the same JSONB extension point every other
    ad-hoc tenant setting lives in).

Both caps already existed and were already shown on the superadmin console —
what did not exist anywhere was anything actually stopping a tenant from
going over either one. This module is that enforcement, plus the pure
counting logic it's built on (seat_exceeded), which is unit tested without a
database in tests/test_seats.py.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Client, Profile, Tenant


def int_cap(value: Any) -> int | None:
    """A stored limit, or None for 'unlimited'. Mirrors admin.py's
    identically-named private `_int_cap` — duplicated rather than imported
    across router/module boundaries for a two-line function, but keep them in
    sync if the "bools aren't ints" rule here ever changes."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    return None


def seat_exceeded(*, current: int, cap: int | None, adding: int = 1) -> bool:
    """Pure decision: would `adding` more (default 1) push `current` past
    `cap`? A None cap is unlimited and never exceeded."""
    if cap is None:
        return False
    return current + adding > cap


async def count_staff(session: AsyncSession, tenant_id) -> int:
    return (
        await session.scalar(
            select(func.count(Profile.id)).where(
                Profile.tenant_id == tenant_id, Profile.client_id.is_(None), Profile.is_active.is_(True)
            )
        )
    ) or 0


async def count_clients(session: AsyncSession, tenant_id) -> int:
    return (await session.scalar(select(func.count(Client.id)).where(Client.tenant_id == tenant_id))) or 0


async def ensure_staff_seat_available(session: AsyncSession, tenant: Tenant, *, adding: int = 1) -> None:
    """Raise 402 if provisioning `adding` more staff would exceed
    `tenant.seats`. Call before creating the account/invitation, not after —
    accounts.provision has no rollback-on-seat-limit of its own."""
    current = await count_staff(session, tenant.id)
    if seat_exceeded(current=current, cap=int_cap(tenant.seats), adding=adding):
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            f"This firm's staff seat limit ({tenant.seats}) is reached. Contact your provider for more seats.",
        )


async def ensure_client_seat_available(session: AsyncSession, tenant: Tenant, *, adding: int = 1) -> None:
    """Same as ensure_staff_seat_available, for `Tenant.settings['max_clients']`."""
    cap = int_cap((tenant.settings or {}).get("max_clients"))
    current = await count_clients(session, tenant.id)
    if seat_exceeded(current=current, cap=cap, adding=adding):
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            f"This firm's client seat limit ({cap}) is reached. Contact your provider for more seats.",
        )


async def remaining_client_seats(session: AsyncSession, tenant: Tenant) -> int | None:
    """How many more clients this tenant can create right now — None means
    unlimited. Built for the bulk client importer (imports.py), which needs
    to track remaining capacity across many new rows in one commit rather
    than re-querying the count before every single one."""
    cap = int_cap((tenant.settings or {}).get("max_clients"))
    if cap is None:
        return None
    current = await count_clients(session, tenant.id)
    return max(0, cap - current)


async def remaining_staff_seats(session: AsyncSession, tenant: Tenant) -> int | None:
    """Same as remaining_client_seats, for staff — built for the bulk
    user/staff importer."""
    cap = int_cap(tenant.seats)
    if cap is None:
        return None
    current = await count_staff(session, tenant.id)
    return max(0, cap - current)


async def seat_usage(session: AsyncSession, tenant: Tenant) -> dict[str, int | None]:
    """Read-only usage snapshot for a "14/20 seats used" indicator — see
    GET /settings/seats."""
    return {
        "staff_used": await count_staff(session, tenant.id),
        "staff_seats": tenant.seats,
        "client_used": await count_clients(session, tenant.id),
        "client_seats": int_cap((tenant.settings or {}).get("max_clients")),
    }
