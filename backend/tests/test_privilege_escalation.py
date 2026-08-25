"""Guards against an admin (or an AdminUserDep-level caller in general — an
owner or firm admin, never a true platform superadmin) ever being able to
create or promote an account to `is_superadmin`.

There is no runtime check anywhere for this today, by design: `is_superadmin`
is simply absent from every schema an admin-level endpoint accepts as input,
and `services.accounts.provision()` — the one function that actually inserts
a new `profiles` row, used by team/user creation, bulk import, portal invites
and tenant provisioning alike — has no parameter for it either. A field that
was never declared writable can't be smuggled through `apply_updates`
(app/utils.py), which only ever copies keys already present on a validated
Pydantic model.

These tests exist so that if a future change ever adds `is_superadmin` to one
of these schemas — even accidentally, e.g. by widening a schema to inherit
from `ProfileRead` — it fails loudly here instead of quietly reopening this.
"""

from __future__ import annotations

import inspect

from app.schemas import (
    PlatformUserCreate,
    PlatformUserUpdate,
    ProfileUpdate,
    StaffCreate,
    TenantAdminCreate,
    TenantAdminEdit,
    UserImportRow,
)
from app.services import accounts


def test_profile_column_defaults_to_not_superadmin():
    from app.models import Profile

    assert Profile.__table__.columns["is_superadmin"].default.arg is False


def test_provision_has_no_is_superadmin_parameter():
    assert "is_superadmin" not in inspect.signature(accounts.provision).parameters


# Every schema an admin-level (or lesser) endpoint accepts as a request body
# for creating or editing an account. None of them may expose is_superadmin —
# if one needs to someday, that decision should be a superadmin-only path,
# not a silent field addition here.
_WRITABLE_ACCOUNT_SCHEMAS = [
    PlatformUserCreate,
    PlatformUserUpdate,
    StaffCreate,
    ProfileUpdate,
    UserImportRow,
]


def test_no_admin_facing_schema_exposes_is_superadmin():
    for schema in _WRITABLE_ACCOUNT_SCHEMAS:
        assert "is_superadmin" not in schema.model_fields, schema.__name__


def test_tenant_provisioning_schemas_do_not_expose_is_superadmin():
    """Belt-and-suspenders: these two are already gated behind SuperadminDep
    (only a superadmin can reach POST/PATCH /admin/tenants at all), so this
    isn't the actual boundary — but the field still has no business being on
    a schema that flows into `services.accounts.provision`."""
    for schema in (TenantAdminCreate, TenantAdminEdit):
        assert "is_superadmin" not in schema.model_fields, schema.__name__
