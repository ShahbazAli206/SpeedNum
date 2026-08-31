"""Plan / server-domain expiry (migration 0024): lock-out enforcement + sweep helpers.

The expiry lock-out reuses the very same paths as the is_active suspend
(_ensure_firm_active on login, deps.get_current_user on a live token), just keyed
off a date instead of a boolean — so this mirrors test_suspended_firm.py. These
pin the pure date logic (firm_expiry_block and the services/plan_expiry helpers)
that the DB-backed reminder sweep and access checks build on.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.models import Profile, Tenant
from app.services import plan_expiry
from app.services.local_auth import (
    AuthError,
    PLAN_EXPIRED_MESSAGE,
    SERVICE_EXPIRED_MESSAGE,
    _ensure_firm_active,
    firm_expiry_block,
)

# A fixed "now" so the date arithmetic is deterministic regardless of run date.
NOW = datetime(2026, 8, 31, 12, 0, tzinfo=timezone.utc)


class FakeSession:
    """Stand-in for AsyncSession — `get` is the only call the helper makes.
    Records whether it was consulted so the superadmin-exemption test can prove
    the helper short-circuits before touching the database."""

    def __init__(self, tenant: Tenant | None) -> None:
        self._tenant = tenant
        self.get_called = False

    async def get(self, _model: type, _pk: uuid.UUID) -> Tenant | None:
        self.get_called = True
        return self._tenant


def _profile(*, tenant_id: uuid.UUID | None, is_superadmin: bool = False) -> Profile:
    return Profile(
        id=uuid.uuid4(),
        email="member@firm.example",
        full_name="Member",
        role="owner",
        tenant_id=tenant_id,
        is_superadmin=is_superadmin,
    )


def _tenant(*, plan_expires_at: datetime | None = None, service_expires_at: datetime | None = None) -> Tenant:
    # Columns must be passed explicitly — defaults aren't applied until a flush,
    # which never happens for an in-memory instance (see test_suspended_firm.py).
    return Tenant(
        id=uuid.uuid4(),
        name="Firm",
        slug="firm",
        is_active=True,
        plan_expires_at=plan_expires_at,
        service_expires_at=service_expires_at,
        settings={},
    )


def _run(coro):
    return asyncio.run(coro)


class TestFirmExpiryBlock:
    def test_no_dates_never_blocks(self):
        assert firm_expiry_block(_tenant(), NOW) is None

    def test_none_tenant_never_blocks(self):
        assert firm_expiry_block(None, NOW) is None

    def test_future_date_allows(self):
        assert firm_expiry_block(_tenant(plan_expires_at=NOW + timedelta(days=5)), NOW) is None

    def test_past_plan_date_blocks_with_the_date(self):
        expired = NOW - timedelta(days=1)
        message = firm_expiry_block(_tenant(plan_expires_at=expired), NOW)
        assert message == PLAN_EXPIRED_MESSAGE.format(date=expired.date().isoformat())

    def test_past_service_date_blocks_with_the_date(self):
        expired = NOW - timedelta(days=2)
        message = firm_expiry_block(_tenant(service_expires_at=expired), NOW)
        assert message == SERVICE_EXPIRED_MESSAGE.format(date=expired.date().isoformat())

    def test_plan_takes_precedence_when_both_past(self):
        tenant = _tenant(
            plan_expires_at=NOW - timedelta(days=1),
            service_expires_at=NOW - timedelta(days=1),
        )
        assert firm_expiry_block(tenant, NOW) == PLAN_EXPIRED_MESSAGE.format(
            date=(NOW - timedelta(days=1)).date().isoformat()
        )


class TestEnsureFirmActiveExpiry:
    def test_expired_plan_blocks_login(self):
        tenant = _tenant(plan_expires_at=datetime.now(timezone.utc) - timedelta(days=1))
        with pytest.raises(AuthError) as caught:
            _run(_ensure_firm_active(FakeSession(tenant), _profile(tenant_id=tenant.id)))
        # 403, not 401 — authenticated, but the firm's window has lapsed.
        assert caught.value.status_code == 403

    def test_superadmin_is_exempt_from_expiry(self):
        tenant = _tenant(plan_expires_at=datetime.now(timezone.utc) - timedelta(days=1))
        session = FakeSession(tenant)
        _run(_ensure_firm_active(session, _profile(tenant_id=tenant.id, is_superadmin=True)))
        # Exempt before the tenant is even looked up, so a superadmin can extend it.
        assert session.get_called is False

    def test_future_date_allows_login(self):
        tenant = _tenant(plan_expires_at=datetime.now(timezone.utc) + timedelta(days=30))
        # No exception == allowed to proceed.
        _run(_ensure_firm_active(FakeSession(tenant), _profile(tenant_id=tenant.id)))


class TestExpiryPhrase:
    def test_reads_naturally_across_the_range(self):
        assert plan_expiry._expiry_phrase(5) == "expires in 5 days"
        assert plan_expiry._expiry_phrase(1) == "expires tomorrow"
        assert plan_expiry._expiry_phrase(0) == "expires today"
        assert plan_expiry._expiry_phrase(-1) == "expired yesterday"
        assert plan_expiry._expiry_phrase(-3) == "expired 3 days ago"


class TestAlertEntries:
    def test_in_window_included_far_future_excluded(self):
        tenant = _tenant(
            plan_expires_at=NOW + timedelta(days=5),  # inside the 30-day window
            service_expires_at=NOW + timedelta(days=60),  # beyond it
        )
        entries = plan_expiry.alert_entries(tenant, NOW.date())
        assert {e["target"] for e in entries} == {"plan"}
        assert entries[0]["days_remaining"] == 5

    def test_overdue_is_included_and_critical(self):
        entries = plan_expiry.alert_entries(_tenant(plan_expires_at=NOW - timedelta(days=3)), NOW.date())
        assert entries[0]["days_remaining"] == -3
        assert entries[0]["severity"] == "critical"

    def test_no_dates_is_empty(self):
        assert plan_expiry.alert_entries(_tenant(), NOW.date()) == []


class TestResetMarker:
    def test_drops_only_the_named_axis(self):
        settings = {"expiry_notified": {"plan": 7, "service": 14}, "other": 1}
        plan_expiry.reset_marker(settings, "plan")
        assert settings["expiry_notified"] == {"service": 14}
        assert settings["other"] == 1

    def test_noop_when_axis_absent(self):
        settings = {"expiry_notified": {"service": 14}}
        plan_expiry.reset_marker(settings, "plan")
        assert settings["expiry_notified"] == {"service": 14}

    def test_noop_when_no_markers_at_all(self):
        settings: dict = {}
        plan_expiry.reset_marker(settings, "plan")
        assert settings == {}
