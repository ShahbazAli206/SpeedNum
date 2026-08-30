"""Unit tests for the pure plan-catalog lookups in app/plans.py."""

from __future__ import annotations

from app.plans import PLAN_CATALOG, plan_tier, suggested_caps


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
