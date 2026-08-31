"""Unit tests for the pure plan-catalog lookups in app/plans.py."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

from app.plans import PLAN_CATALOG, plan_tier, suggested_caps
from app.routers.plan_requests import PlanRequestAdminRead
from app.utils import read


class TestPlanTier:
    def test_known_key_returns_the_tier(self):
        tier = plan_tier("growth")
        assert tier is not None
        assert tier["key"] == "growth"

    def test_unknown_key_returns_none(self):
        assert plan_tier("made-up-plan") is None

    def test_every_catalog_entry_has_a_unique_key(self):
        keys = [tier["key"] for tier in PLAN_CATALOG]
        assert len(keys) == len(set(keys))


class TestSuggestedCaps:
    def test_known_plan_returns_its_caps(self):
        assert suggested_caps("starter") == (25, 3)

    def test_enterprise_is_unlimited(self):
        assert suggested_caps("enterprise") == (None, None)

    def test_unknown_plan_is_unlimited_rather_than_a_lookup_error(self):
        """A superadmin can still set an arbitrary custom plan name on a
        tenant (see routers/admin.py's TenantAdminEdit.plan) — that isn't in
        the catalog, so it isn't a KeyError, it's just no suggestion."""
        assert suggested_caps("custom-enterprise-deal") == (None, None)


class TestPlanRequestAdminRead:
    """Regression guard for the /admin/plan-requests queue 500.

    read() calls model_validate(orm_row) BEFORE layering on tenant_name via
    model_copy, and the ORM PlanChangeRequest row carries no tenant_name /
    requested_by_email attribute. If either field is required (no default) that
    first validation pass raises, 500-ing the whole superadmin queue the moment
    one request exists. These fields must stay optional. See plan_requests.py.
    """

    def _orm_row(self) -> SimpleNamespace:
        # Mirrors a PlanChangeRequest ORM row: note the deliberate absence of
        # tenant_name and requested_by_email, exactly as SQLAlchemy hands it over.
        return SimpleNamespace(
            id=uuid.uuid4(),
            tenant_id=uuid.uuid4(),
            current_plan="trial",
            requested_plan="starter",
            note="please upgrade",
            status="pending",
            resolution_note=None,
            resolved_at=None,
            created_at=datetime.now(timezone.utc),
        )

    def test_read_serialises_an_orm_row_with_layered_tenant_name(self):
        result = read(PlanRequestAdminRead, self._orm_row(), tenant_name="Acme Ltd")
        assert result.tenant_name == "Acme Ltd"
        assert result.requested_plan == "starter"
        assert result.requested_by_email is None

    def test_computed_fields_are_optional_on_the_schema(self):
        # The two fields the ORM row cannot supply must both default, or
        # model_validate raises before read() can fill them in.
        for field_name in ("tenant_name", "requested_by_email"):
            assert not PlanRequestAdminRead.model_fields[field_name].is_required()


class TestPlanPricing:
    """Cards on /billing show a price now — every tier must carry one."""

    def test_every_tier_carries_a_price(self):
        for tier in PLAN_CATALOG:
            assert "price" in tier
            assert tier["price"] is None or isinstance(tier["price"], int)

    def test_enterprise_is_quoted_not_fixed(self):
        tier = plan_tier("enterprise")
        assert tier is not None
        assert tier["price"] is None

    def test_paid_tiers_have_a_nonnegative_price(self):
        for key in ("trial", "starter", "growth", "pro"):
            tier = plan_tier(key)
            assert tier is not None
            assert isinstance(tier["price"], int) and tier["price"] >= 0


class TestPlanRequestCustomAndAttachment:
    """Custom-plan sizing + the image attachment must serialise through read()
    the same way, and stay optional so an older row (no such attrs) still
    validates — the same guarantee TestPlanRequestAdminRead protects."""

    def _custom_row(self) -> SimpleNamespace:
        return SimpleNamespace(
            id=uuid.uuid4(),
            tenant_id=uuid.uuid4(),
            current_plan="growth",
            requested_plan="custom",
            note=None,
            custom_clients=250,
            custom_seats=15,
            attachment="data:image/png;base64,iVBORw0KGgo=",
            status="pending",
            resolution_note=None,
            resolved_at=None,
            created_at=datetime.now(timezone.utc),
        )

    def test_custom_fields_round_trip(self):
        result = read(PlanRequestAdminRead, self._custom_row(), tenant_name="Big Firm")
        assert result.requested_plan == "custom"
        assert result.custom_clients == 250
        assert result.custom_seats == 15
        assert result.attachment is not None and result.attachment.startswith("data:image/")

    def test_new_fields_default_when_absent(self):
        # A row without the custom/attachment attributes (as an old row, or the
        # SimpleNamespace SQLAlchemy would hand over before these columns) must
        # still validate — all three carry a default of None.
        row = SimpleNamespace(
            id=uuid.uuid4(),
            tenant_id=uuid.uuid4(),
            current_plan="trial",
            requested_plan="starter",
            note=None,
            status="pending",
            resolution_note=None,
            resolved_at=None,
            created_at=datetime.now(timezone.utc),
        )
        result = read(PlanRequestAdminRead, row, tenant_name="Acme")
        assert result.custom_clients is None
        assert result.custom_seats is None
        assert result.attachment is None

    def test_new_fields_are_optional_on_the_schema(self):
        for field_name in ("custom_clients", "custom_seats", "attachment"):
            assert not PlanRequestAdminRead.model_fields[field_name].is_required()
