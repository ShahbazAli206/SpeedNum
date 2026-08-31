"""Regression tests for the firm-suspension lockout.

A platform superadmin suspending a firm sets ``tenant.is_active = False``
(admin.suspend_tenant). Before this was enforced, that flag was written but
never read on any login path: the firm's owner, staff and client-portal logins
could all still sign in and keep using everything — exactly the bug reported
against the suspended "Mr" firm.

``_ensure_firm_active`` is the shared check every token-issuing path
(password login, refresh, magic link, Google OAuth) now runs, and
``deps.get_current_user`` mirrors it for sessions that were already live when
the firm was suspended. These tests pin its behaviour, including the two
deliberate exemptions (platform superadmins, and tenant-less accounts) that
keep a superadmin able to sign in and lift the suspension.
"""

from __future__ import annotations

import asyncio
import uuid

import pytest

from app.models import Profile, Tenant
from app.services.local_auth import AuthError, SUSPENDED_FIRM_MESSAGE, _ensure_firm_active


class FakeSession:
    """Stand-in for AsyncSession — ``get`` is the only call the helper makes.

    Records whether it was consulted, so the exemption tests can prove the
    helper short-circuits before ever touching the database."""

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


def _tenant(*, active: bool) -> Tenant:
    # is_active must be passed explicitly — the column default isn't applied
    # until a flush, which never happens for an in-memory instance.
    return Tenant(id=uuid.uuid4(), name="Firm", slug="firm", is_active=active)


def _run(coro):
    return asyncio.run(coro)


class TestEnsureFirmActive:
    def test_suspended_firm_blocks_a_normal_login(self):
        tenant = _tenant(active=False)
        with pytest.raises(AuthError) as caught:
            _run(_ensure_firm_active(FakeSession(tenant), _profile(tenant_id=tenant.id)))
        # 403, not 401 — the account is authenticated, its firm is disabled.
        assert caught.value.status_code == 403
        assert str(caught.value) == SUSPENDED_FIRM_MESSAGE

    def test_active_firm_allows_login(self):
        tenant = _tenant(active=True)
        # No exception raised == the login is allowed to proceed.
        _run(_ensure_firm_active(FakeSession(tenant), _profile(tenant_id=tenant.id)))

    def test_superadmin_is_exempt_even_when_their_firm_is_suspended(self):
        tenant = _tenant(active=False)
        session = FakeSession(tenant)
        _run(_ensure_firm_active(session, _profile(tenant_id=tenant.id, is_superadmin=True)))
        # Exempt before the tenant is even looked up, so a superadmin can always
        # sign in to lift the suspension.
        assert session.get_called is False

    def test_tenantless_account_is_exempt(self):
        session = FakeSession(None)
        _run(_ensure_firm_active(session, _profile(tenant_id=None)))
        assert session.get_called is False
