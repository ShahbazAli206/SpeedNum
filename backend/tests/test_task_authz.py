"""Unit tests for task-action authorization (app/permissions.py).

Task *management* — creating, reassigning, editing details, deleting — is
company-Owner-only, above and beyond the owner-configurable tasks.manage grant.
Task *execution* — moving a task through its statuses and tracking time — is
allowed for the task's own assignee even when they are not an Owner. These two
pure decision functions encode that split so workflows.py has one obvious place
to import them and this suite can exercise them without a database, exactly like
test_permissions.py exercises resolve_permission().
"""

from __future__ import annotations

import uuid

from app.deps import CurrentUser
from app.models import Profile, Tenant
from app.permissions import can_update_task_fields, is_firm_owner
from app.security import TokenClaims


def _user(*, role: str = "member", is_superadmin: bool = False, profile_id: uuid.UUID | None = None) -> CurrentUser:
    profile = Profile(
        id=profile_id or uuid.uuid4(),
        email="someone@example.com",
        full_name="Someone",
        role=role,
        is_superadmin=is_superadmin,
    )
    tenant = Tenant(id=uuid.uuid4(), name="Firm", slug="firm")
    profile.tenant_id = tenant.id
    claims = TokenClaims(user_id=str(profile.id), email=profile.email, role=None, metadata={}, raw={})
    return CurrentUser(profile=profile, tenant=tenant, claims=claims, role_permissions=None)


class TestIsFirmOwner:
    """Only the Owner (or a platform superadmin acting inside the tenant) counts.
    An Admin — who *does* carry tasks.manage in the legacy defaults — does not,
    which is the whole point: task creation/assignment is Owner-only regardless
    of the configurable grant."""

    def test_owner_is_firm_owner(self):
        assert is_firm_owner(_user(role="owner")) is True

    def test_superadmin_is_firm_owner_even_with_a_non_owner_role(self):
        assert is_firm_owner(_user(role="admin", is_superadmin=True)) is True

    def test_admin_is_not_firm_owner(self):
        assert is_firm_owner(_user(role="admin")) is False

    def test_plain_member_is_not_firm_owner(self):
        assert is_firm_owner(_user(role="member")) is False


class TestCanUpdateTaskFields:
    def test_owner_may_change_any_field(self):
        owner = _user(role="owner")
        assert can_update_task_fields(owner, uuid.uuid4(), {"title", "assignee_id", "status"}) is True

    def test_superadmin_may_change_any_field(self):
        su = _user(role="admin", is_superadmin=True)
        assert can_update_task_fields(su, uuid.uuid4(), {"title", "assignee_id"}) is True

    def test_assignee_may_change_only_status(self):
        me = uuid.uuid4()
        assert can_update_task_fields(_user(profile_id=me), me, {"status"}) is True

    def test_admin_who_is_the_assignee_may_change_status(self):
        me = uuid.uuid4()
        assert can_update_task_fields(_user(role="admin", profile_id=me), me, {"status"}) is True

    def test_assignee_may_not_reassign_their_own_task(self):
        me = uuid.uuid4()
        assert can_update_task_fields(_user(profile_id=me), me, {"assignee_id"}) is False

    def test_assignee_may_not_rename_their_own_task(self):
        me = uuid.uuid4()
        assert can_update_task_fields(_user(profile_id=me), me, {"title"}) is False

    def test_assignee_may_not_bundle_status_with_another_field(self):
        me = uuid.uuid4()
        assert can_update_task_fields(_user(profile_id=me), me, {"status", "priority"}) is False

    def test_non_assignee_non_owner_may_not_change_status(self):
        assert can_update_task_fields(_user(profile_id=uuid.uuid4()), uuid.uuid4(), {"status"}) is False

    def test_unassigned_task_status_is_owner_only(self):
        # assignee_id is None (nobody owns it) — a non-owner has no claim to it.
        assert can_update_task_fields(_user(profile_id=uuid.uuid4()), None, {"status"}) is False
