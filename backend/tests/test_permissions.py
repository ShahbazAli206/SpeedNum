"""Unit tests for the owner-configurable permission system (app/permissions.py).

Like test_deps.py, these build a CurrentUser directly from an in-memory
Profile/Tenant and call the pure decision functions — no database needed,
since resolve_permission() takes plain values and client_owner_clause() only
builds a SQLAlchemy expression, it never executes one.
"""

from __future__ import annotations

import asyncio
import uuid

import pytest
from fastapi import HTTPException

from app.deps import CurrentUser, require_admin, require_owner_or_superadmin
from app.models import Client, Profile, Tenant
from app.permissions import (
    DEFAULT_ROLE_TEMPLATES,
    PERMISSION_CATALOG,
    PERMISSION_KEYS,
    client_owner_clause,
    has_permission,
    resolve_permission,
)
from app.security import TokenClaims


def _user(*, role: str = "member", role_permissions: dict[str, bool] | None = None, is_superadmin: bool = False) -> CurrentUser:
    profile = Profile(
        id=uuid.uuid4(),
        email="someone@example.com",
        full_name="Someone",
        role=role,
        is_superadmin=is_superadmin,
    )
    tenant = Tenant(id=uuid.uuid4(), name="Firm", slug="firm")
    profile.tenant_id = tenant.id
    claims = TokenClaims(user_id=str(profile.id), email=profile.email, role=None, metadata={}, raw={})
    return CurrentUser(profile=profile, tenant=tenant, claims=claims, role_permissions=role_permissions)


class TestOwnerAndSuperadminBypassEverything:
    """The whole point of keeping Owner/superadmin out of the roles table —
    see the migration's header comment and permissions.py's module docstring."""

    def test_owner_passes_every_key_even_with_no_role_permissions_loaded(self):
        user = _user(role="owner", role_permissions=None)
        for key in PERMISSION_KEYS:
            assert has_permission(user, key), key

    def test_owner_passes_even_if_role_permissions_would_deny_it(self):
        """Defence in depth: an Owner profile should never carry role_permissions
        in practice (role_id stays null), but if it somehow did, Owner still
        wins — the role check is is_superadmin/role=='owner' first."""
        user = _user(role="owner", role_permissions={key: False for key in PERMISSION_KEYS})
        for key in PERMISSION_KEYS:
            assert has_permission(user, key), key

    def test_superadmin_passes_every_key_regardless_of_role(self):
        user = _user(role="admin", is_superadmin=True, role_permissions={"clients.view_all": False})
        for key in PERMISSION_KEYS:
            assert has_permission(user, key), key


class TestExplicitRolePermissionsAreAuthoritative:
    def test_a_granted_key_passes(self):
        user = _user(role="member", role_permissions={"clients.view_all": True})
        assert has_permission(user, "clients.view_all") is True

    def test_a_denied_key_fails(self):
        user = _user(role="member", role_permissions={"clients.view_all": False})
        assert has_permission(user, "clients.view_all") is False

    def test_a_key_missing_from_the_role_defaults_to_denied_not_allowed(self):
        """A role with an incomplete grant set (e.g. created before a new
        permission key existed) should not silently grant the new capability —
        the owner has to opt in explicitly."""
        user = _user(role="member", role_permissions={"clients.view_all": True})
        assert has_permission(user, "tasks.manage") is False


class TestLegacyFallbackMatchesThePreMigrationBehaviour:
    """profile.role_id is null (role_permissions is None) — the exact scenario
    for a profile that hasn't been backfilled onto a custom role yet. This
    must reproduce clients.py's old hardcoded `role == "admin"` check exactly,
    or an existing tenant's access changes the moment this feature ships."""

    def test_plain_admin_is_restricted_to_assigned_clients(self):
        user = _user(role="admin", role_permissions=None)
        assert has_permission(user, "clients.view_all") is False

    def test_plain_admin_can_still_manage_and_delete_clients(self):
        """Today AdminUserDep (owner/admin/superadmin) gates client deletion —
        a plain admin passes that, so the fallback must grant it too."""
        user = _user(role="admin", role_permissions=None)
        assert has_permission(user, "clients.manage") is True
        assert has_permission(user, "clients.delete") is True

    def test_member_sees_every_client(self):
        user = _user(role="member", role_permissions=None)
        assert has_permission(user, "clients.view_all") is True

    def test_member_cannot_delete_clients(self):
        """Today AdminUserDep excludes plain member/viewer from client
        deletion — the fallback must preserve that too."""
        user = _user(role="member", role_permissions=None)
        assert has_permission(user, "clients.delete") is False

    def test_viewer_matches_member_exactly(self):
        """Research finding: viewer has no distinct restriction from member
        anywhere in the pre-existing codebase."""
        member = _user(role="member", role_permissions=None)
        viewer = _user(role="viewer", role_permissions=None)
        for key in PERMISSION_KEYS:
            assert has_permission(member, key) == has_permission(viewer, key), key


class TestClientOwnerClause:
    def test_view_all_means_no_filter(self):
        user = _user(role="member", role_permissions={"clients.view_all": True})
        assert client_owner_clause(user) is None

    def test_missing_view_all_scopes_to_the_callers_own_clients(self):
        user = _user(role="admin", role_permissions={"clients.view_all": False})
        clause = client_owner_clause(user)
        assert clause is not None
        assert clause.right.value == user.profile.id

    def test_uses_the_shared_client_model_column(self):
        user = _user(role="admin", role_permissions={"clients.view_all": False})
        clause = client_owner_clause(user)
        assert clause.left.table is Client.__table__
        assert clause.left.name == "owner_id"


class TestPermissionCatalogIntegrity:
    """Guards against the three places a permission key is spelled out by hand
    (PERMISSION_KEYS, PERMISSION_CATALOG, the migration's seed data, and
    DEFAULT_ROLE_TEMPLATES) drifting apart — a typo in any one silently makes
    a permission uneditable in the UI, or unenforceable, or absent from a
    freshly seeded tenant."""

    def test_every_catalog_entry_has_a_key_in_permission_keys(self):
        assert {info.key for info in PERMISSION_CATALOG} == set(PERMISSION_KEYS)

    def test_every_default_role_template_only_grants_known_keys(self):
        for _name, _description, grants in DEFAULT_ROLE_TEMPLATES:
            assert set(grants.keys()) <= set(PERMISSION_KEYS)

    def test_every_default_role_template_grants_every_key(self):
        """Each starter role should have an explicit opinion on every
        permission, not rely on the missing-key-denies-by-default rule —
        otherwise adding a role from the UI (which always submits a full
        grant set) and the migration's seeded roles behave differently for
        the same missing key."""
        for _name, _description, grants in DEFAULT_ROLE_TEMPLATES:
            assert set(grants.keys()) == set(PERMISSION_KEYS)


class TestCustomRolesCannotEscalateToOwnerGatedActions:
    """Hardening-pass regression guard (Phase 4): app/permissions.py's grants
    only cover the 7 keys in PERMISSION_KEYS — staff-roster management and
    tenant billing stay behind deps.py's role/is_superadmin checks, which
    never consult a role's grants at all. Proves it by construction: a
    profile granted every permission key still fails the Owner-only
    dependencies, because those two systems are structurally independent."""

    def _member_with_every_permission_granted(self) -> CurrentUser:
        return _user(role="member", role_permissions={key: True for key in PERMISSION_KEYS})

    def test_full_grants_do_not_satisfy_require_owner_or_superadmin(self):
        user = self._member_with_every_permission_granted()
        with pytest.raises(HTTPException) as caught:
            asyncio.run(require_owner_or_superadmin(user))
        assert caught.value.status_code == 403

    def test_full_grants_do_not_satisfy_require_admin(self):
        user = self._member_with_every_permission_granted()
        with pytest.raises(HTTPException) as caught:
            asyncio.run(require_admin(user))
        assert caught.value.status_code == 403

    def test_an_actual_owner_needs_no_grants_at_all_to_pass_either(self):
        user = _user(role="owner", role_permissions=None)
        assert asyncio.run(require_owner_or_superadmin(user)) is user
        assert asyncio.run(require_admin(user)) is user


def test_resolve_permission_is_a_pure_function_independent_of_current_user():
    """The lower-level function CurrentUser-free code (a future seat-check
    endpoint, a script) can call directly without constructing a full request
    context."""
    assert resolve_permission(
        is_superadmin=False, legacy_role="admin", role_permissions=None, key="clients.view_all"
    ) is False
    assert resolve_permission(
        is_superadmin=True, legacy_role="admin", role_permissions=None, key="clients.view_all"
    ) is True
