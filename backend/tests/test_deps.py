"""Unit tests for the authorisation dependencies in app/deps.py.

These are the checks that stand between one firm's data and another's, and
between a client-portal login and the firm-internal API. They are ordinary async
functions taking an already-resolved user, so they can be exercised directly
without a database or an HTTP client — which is the whole reason the checks live
in dependencies rather than scattered through the routers.
"""

from __future__ import annotations

import asyncio
import uuid

import pytest
from fastapi import HTTPException

from app.deps import CurrentUser, get_firm_linked_user, get_tenant_user
from app.models import Profile, Tenant
from app.security import TokenClaims


def _user(
    *,
    tenant: bool = True,
    client_id: uuid.UUID | None = None,
    must_change_password: bool = False,
) -> CurrentUser:
    profile = Profile(
        id=uuid.uuid4(),
        email="someone@example.com",
        full_name="Someone",
        role="member",
        client_id=client_id,
        must_change_password=must_change_password,
    )
    row = Tenant(id=uuid.uuid4(), name="Firm", slug="firm") if tenant else None
    if row is not None:
        profile.tenant_id = row.id
    claims = TokenClaims(user_id=str(profile.id), email=profile.email, role=None, metadata={}, raw={})
    return CurrentUser(profile=profile, tenant=row, claims=claims)


def _run(coro):
    return asyncio.run(coro)


class TestTemporaryPasswordGate:
    """An admin-generated temporary password is emailed in plaintext and often
    read out loud. Until it is replaced the account gets no data — and that has
    to be enforced here, because the frontend modal is only a prompt."""

    def test_an_account_on_a_temporary_password_is_refused(self):
        with pytest.raises(HTTPException) as caught:
            _run(get_firm_linked_user(_user(must_change_password=True)))
        assert caught.value.status_code == 428

    def test_the_refusal_is_distinguishable_from_a_role_failure(self):
        """428, not 403 — the client keys the forced-password prompt off the
        status rather than off the message text."""
        with pytest.raises(HTTPException) as caught:
            _run(get_firm_linked_user(_user(must_change_password=True)))
        assert caught.value.status_code != 403

    def test_a_portal_account_on_a_temporary_password_is_refused_too(self):
        with pytest.raises(HTTPException) as caught:
            _run(get_firm_linked_user(_user(client_id=uuid.uuid4(), must_change_password=True)))
        assert caught.value.status_code == 428

    def test_the_gate_applies_to_staff_endpoints_as_well(self):
        """get_tenant_user builds on get_firm_linked_user, so every firm-side
        router inherits the check without naming it."""
        with pytest.raises(HTTPException) as caught:
            _run(get_tenant_user(_run(_passthrough(_user(must_change_password=True)))))
        assert caught.value.status_code == 428

    def test_a_settled_account_passes(self):
        user = _user()
        assert _run(get_firm_linked_user(user)) is user

    def test_no_tenant_is_still_reported_as_a_missing_firm(self):
        """The password gate must not shadow the older 409 — a brand new signup
        with no firm yet is a different problem with a different fix."""
        with pytest.raises(HTTPException) as caught:
            _run(get_firm_linked_user(_user(tenant=False)))
        assert caught.value.status_code == 409


async def _passthrough(user: CurrentUser) -> CurrentUser:
    """get_tenant_user takes what get_firm_linked_user returned. Calling the
    inner one first mirrors how FastAPI resolves the chain, so the test fails if
    the two are ever wired up independently."""
    return await get_firm_linked_user(user)


class TestPortalAccountsCannotUseFirmEndpoints:
    """Regression cover for the access-control gap that `profiles.client_id`
    introduced: a portal login has a tenant too, so "has a tenant" alone let it
    read the firm's entire book."""

    def test_a_portal_account_is_rejected(self):
        user = _user(client_id=uuid.uuid4())
        with pytest.raises(HTTPException) as caught:
            _run(get_tenant_user(user))
        assert caught.value.status_code == 403

    def test_firm_staff_pass(self):
        user = _user()
        assert _run(get_tenant_user(user)) is user
