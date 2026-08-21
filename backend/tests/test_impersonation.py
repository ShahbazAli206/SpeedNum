"""Platform-superadmin impersonation (act_as_tenant).

Two layers, both pure — no database, no HTTP client:

* the token layer (services/local_auth.create_access_token) stamps the claim
  and routing metadata, and security._verify_local reads it back;
* the dependency layer (deps.get_current_user) swaps the acting tenant to the
  impersonated firm — but only for an actual superadmin.

The endpoint that mints these tokens is superadmin-gated (SuperadminDep) and the
tokens are signed, so the claim can never be forged into existence; these tests
cover the two ends of what happens once it legitimately has been.
"""

from __future__ import annotations

import asyncio
import uuid

import pytest
from fastapi import HTTPException

from app.deps import get_current_user
from app.models import Profile, Tenant
from app.security import TokenClaims, verify_token
from app.services.local_auth import create_access_token


def _run(coro):
    return asyncio.run(coro)


def _profile(*, superadmin: bool, tenant_id: uuid.UUID | None) -> Profile:
    return Profile(
        id=uuid.uuid4(),
        email="root@speednum.com" if superadmin else "staff@firm.com",
        full_name="Root" if superadmin else "Staff",
        role="member",
        tenant_id=tenant_id,
        is_active=True,
        is_superadmin=superadmin,
    )


class FakeSession:
    """Just enough of AsyncSession for get_current_user: it looks a profile up by
    its token subject and tenants up by id."""

    def __init__(self, profile: Profile, tenants: list[Tenant]) -> None:
        self._profile = profile
        self._tenants = {t.id: t for t in tenants}

    async def scalar(self, _stmt):
        return self._profile

    async def get(self, _model, pk):
        return self._tenants.get(pk)


# --- token layer -------------------------------------------------------------
class TestImpersonationToken:
    def test_token_carries_the_act_as_claim_and_firm_routing(self):
        acting = uuid.uuid4()
        profile = _profile(superadmin=True, tenant_id=None)
        claims = verify_token(create_access_token(profile, act_as_tenant=acting))
        assert claims.raw["act_as_tenant"] == str(acting)
        # Routing metadata points the frontend proxy at the firm surface.
        assert claims.metadata["tenant_id"] == str(acting)
        assert claims.metadata["is_staff"] is True
        assert claims.metadata["is_portal"] is False
        # Still the superadmin's own identity — audit attributes to them.
        assert claims.user_id == str(profile.id)
        assert claims.email == "root@speednum.com"

    def test_an_ordinary_token_has_no_act_as_claim(self):
        profile = _profile(superadmin=True, tenant_id=None)
        claims = verify_token(create_access_token(profile))
        assert "act_as_tenant" not in claims.raw


# --- dependency layer --------------------------------------------------------
class TestGetCurrentUserImpersonation:
    def test_superadmin_with_the_claim_acts_as_the_firm(self):
        firm = Tenant(id=uuid.uuid4(), name="Amzad Amiri", slug="amzad")
        profile = _profile(superadmin=True, tenant_id=None)
        claims = TokenClaims(
            user_id=str(profile.id), email=profile.email, role=None,
            metadata={}, raw={"act_as_tenant": str(firm.id)},
        )
        user = _run(get_current_user(FakeSession(profile, [firm]), claims))
        assert user.impersonating is True
        assert user.tenant is firm
        assert user.tenant_id == firm.id
        # is_admin is True for a superadmin, so firm-admin routes are reachable.
        assert user.is_admin is True

    def test_a_non_superadmin_cannot_impersonate_even_with_the_claim(self):
        own = Tenant(id=uuid.uuid4(), name="Own Firm", slug="own")
        other = Tenant(id=uuid.uuid4(), name="Someone Else", slug="other")
        profile = _profile(superadmin=False, tenant_id=own.id)
        claims = TokenClaims(
            user_id=str(profile.id), email=profile.email, role=None,
            metadata={}, raw={"act_as_tenant": str(other.id)},
        )
        user = _run(get_current_user(FakeSession(profile, [own, other]), claims))
        assert user.impersonating is False
        assert user.tenant is own

    def test_an_unknown_target_tenant_is_ignored(self):
        profile = _profile(superadmin=True, tenant_id=None)
        claims = TokenClaims(
            user_id=str(profile.id), email=profile.email, role=None,
            metadata={}, raw={"act_as_tenant": str(uuid.uuid4())},
        )
        user = _run(get_current_user(FakeSession(profile, []), claims))
        assert user.impersonating is False
        assert user.tenant is None

    def test_a_malformed_target_tenant_is_ignored(self):
        profile = _profile(superadmin=True, tenant_id=None)
        claims = TokenClaims(
            user_id=str(profile.id), email=profile.email, role=None,
            metadata={}, raw={"act_as_tenant": "not-a-uuid"},
        )
        user = _run(get_current_user(FakeSession(profile, []), claims))
        assert user.impersonating is False

    def test_no_claim_leaves_a_superadmin_tenantless(self):
        profile = _profile(superadmin=True, tenant_id=None)
        claims = TokenClaims(
            user_id=str(profile.id), email=profile.email, role=None, metadata={}, raw={},
        )
        user = _run(get_current_user(FakeSession(profile, []), claims))
        assert user.impersonating is False
        assert user.tenant is None


def test_impersonation_survives_a_full_verify_roundtrip_into_get_current_user():
    """End-to-end of the pure path: mint a real signed token, verify it the way
    a request would, and feed the resulting claims through get_current_user."""
    firm = Tenant(id=uuid.uuid4(), name="Dilawar Tester", slug="dilawar")
    profile = _profile(superadmin=True, tenant_id=None)
    token = create_access_token(profile, act_as_tenant=firm.id)
    claims = verify_token(token)
    user = _run(get_current_user(FakeSession(profile, [firm]), claims))
    assert user.impersonating is True and user.tenant is firm
