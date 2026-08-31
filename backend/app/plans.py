"""The plan catalog shown to an owner on /billing and used as the default
seat allotment when a superadmin approves a plan-change request.

These numbers are a starting suggestion, not a hard business rule: a
superadmin can still set arbitrary `max_clients`/`max_users` on any tenant
from the admin console (see routers/admin.py's edit_tenant), and can override
the suggested caps for an individual approval too (see routers/plan_requests.py).
Adjust the numbers below in one place if pricing/limits change.
"""

from __future__ import annotations

from typing import TypedDict


class PlanTier(TypedDict):
    key: str
    label: str
    max_clients: int | None
    max_staff: int | None
    blurb: str
    # Monthly list price in whole dollars, shown on the billing cards. None
    # means "not a fixed price" (Enterprise is quoted per firm). These are a
    # default ladder — change them here in one place if pricing changes; the
    # frontend reads them from GET /billing/plans, it does not hardcode them.
    price: int | None


PLAN_CATALOG: list[PlanTier] = [
    {
        "key": "trial",
        "label": "Trial",
        "max_clients": 10,
        "max_staff": 2,
        "blurb": "14-day trial of the full product.",
        "price": 0,
    },
    {
        "key": "starter",
        "label": "Starter",
        "max_clients": 25,
        "max_staff": 3,
        "blurb": "Solo practitioners and small teams.",
        "price": 49,
    },
    {
        "key": "growth",
        "label": "Growth",
        "max_clients": 100,
        "max_staff": 10,
        "blurb": "Growing practices with several accountants.",
        "price": 149,
    },
    {
        "key": "pro",
        "label": "Pro",
        "max_clients": 500,
        "max_staff": 25,
        "blurb": "Established firms with a full team.",
        "price": 399,
    },
    {
        "key": "enterprise",
        "label": "Enterprise",
        "max_clients": None,
        "max_staff": None,
        "blurb": "Unlimited clients and staff, custom terms.",
        "price": None,
    },
]

_BY_KEY = {tier["key"]: tier for tier in PLAN_CATALOG}


def plan_tier(key: str) -> PlanTier | None:
    return _BY_KEY.get(key)


def suggested_caps(key: str) -> tuple[int | None, int | None]:
    """(max_clients, max_staff) suggested for a plan key, or (None, None) —
    unlimited — for a key outside the catalog (a superadmin can still name an
    arbitrary custom plan on a tenant)."""
    tier = plan_tier(key)
    if tier is None:
        return None, None
    return tier["max_clients"], tier["max_staff"]
