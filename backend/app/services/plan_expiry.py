"""Plan / server-domain expiry reminders for a company.

Companion to services/reminders.py, which handles a firm's own deadline / task /
letter countdowns. This module handles the *tenant-level* expiry dates added in
migration 0024 — `plan_expires_at` and `service_expires_at` — turning each into a
bell notification for the company as its date approaches, reusing the reminder
engine's threshold ladder and urgency scoring so the two feel identical.

The daily sweep (routers/reminders.sweep_tenant, driven by services/scheduler)
calls `sweep_tenant_expiry` per active tenant. A per-axis marker in
`tenants.settings->'expiry_notified'` stops a crossed rung from re-firing every
day; moving a date forward clears its marker (routers/admin.apply_tenant_edit via
`reset_marker`) so the ladder starts again from the top.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Tenant
from . import audit
from .reminders import crossed_threshold, reminder_days_for, severity_for

# settings key holding the "already reminded at rung N" marker per axis.
MARKER_KEY = "expiry_notified"

# How far ahead the superadmin "expiring soon" alert popup looks. Anything past
# its date always alerts regardless.
ALERT_WINDOW_DAYS = 30

# The two expiry axes: target key -> (Tenant column, human label, notification type).
TARGETS: dict[str, dict[str, str]] = {
    "plan": {"attr": "plan_expires_at", "label": "plan", "type": "plan_expiry"},
    "service": {
        "attr": "service_expires_at",
        "label": "server/domain access",
        "type": "service_expiry",
    },
}


def _expiry_phrase(days_remaining: int) -> str:
    """Natural wording for an expiry countdown — reads as 'expires', not the
    reminder engine's task-oriented 'left / overdue'."""
    if days_remaining < -1:
        return f"expired {abs(days_remaining)} days ago"
    if days_remaining == -1:
        return "expired yesterday"
    if days_remaining == 0:
        return "expires today"
    if days_remaining == 1:
        return "expires tomorrow"
    return f"expires in {days_remaining} days"


def reset_marker(settings: dict[str, Any], target: str) -> None:
    """Drop the 'already reminded' rung for one axis so the ladder re-fires from
    the top. Mutates the passed settings dict in place — call it from the same
    place that moves a date (apply_tenant_edit) on the fresh settings copy."""
    markers = settings.get(MARKER_KEY)
    if isinstance(markers, dict) and target in markers:
        markers = dict(markers)
        markers.pop(target, None)
        settings[MARKER_KEY] = markers


def alert_entries(tenant: Tenant, today: date) -> list[dict[str, Any]]:
    """This firm's expiry axes that are within the alert window or already past —
    the rows behind GET /admin/expiry-alerts. Empty when nothing is close."""
    out: list[dict[str, Any]] = []
    for target, meta in TARGETS.items():
        expires_at: datetime | None = getattr(tenant, meta["attr"])
        if expires_at is None:
            continue
        days = (expires_at.date() - today).days
        if days > ALERT_WINDOW_DAYS:
            continue
        out.append(
            {
                "target": target,
                "expires_at": expires_at,
                "days_remaining": days,
                "severity": severity_for(days),
            }
        )
    return out


async def sweep_tenant_expiry(session: AsyncSession, tenant: Tenant, *, today: date) -> int:
    """Emit one bell notification per expiry axis that has crossed a *new* rung on
    the ladder since we last notified, and advance the marker. Returns the count
    emitted (0 when nothing crossed). The caller commits the session."""
    settings = dict(tenant.settings or {})
    markers = dict(settings.get(MARKER_KEY) or {})
    ladder = reminder_days_for(settings)
    emitted = 0
    changed = False

    for target, meta in TARGETS.items():
        expires_at: datetime | None = getattr(tenant, meta["attr"])
        if expires_at is None:
            # No date on this axis — clear any stale marker so a future date starts clean.
            if target in markers:
                markers.pop(target, None)
                changed = True
            continue

        days = (expires_at.date() - today).days
        threshold = crossed_threshold(days, ladder)
        if threshold is None:
            continue  # still further out than the widest rung
        if markers.get(target) == threshold:
            continue  # already reminded at this rung

        label = meta["label"]
        phrase = _expiry_phrase(days)
        on_date = expires_at.date().isoformat()
        body = (
            f"Your {label} expired on {on_date}. Renew now to restore your SpidNums services."
            if days < 0
            else f"Your {label} is set to expire on {on_date}. "
            "Request a renewal to avoid any interruption to your SpidNums services."
        )
        await audit.notify(
            session,
            tenant_id=tenant.id,
            type=meta["type"],
            title=f"Your {label} {phrase}",
            body=body,
            link="/billing",
        )
        markers[target] = threshold
        emitted += 1
        changed = True

    if changed:
        settings[MARKER_KEY] = markers
        tenant.settings = settings

    return emitted
