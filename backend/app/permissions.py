"""Owner-configurable permissions for tenant-defined staff roles.

Two authorization layers coexist in this codebase:

  - deps.py's require_admin / require_owner_or_superadmin / etc. gate fixed,
    structural actions (managing the staff roster, tenant billing) that only
    an Owner or a platform superadmin may ever do, regardless of how a tenant
    configures anything. Those are unaffected by this module.

  - This module gates the day-to-day, owner-configurable actions named in the
    platform build-out: whether a role sees every client or only the ones
    assigned to them, whether it sees every task or only tasks tied to its own
    clients, and whether it can reassign a client to someone else. An Owner
    grants these per tenant-defined Role (app.models.Role /
    app.models.RolePermission); a plain Owner action never needs one of these
    checks because has_permission() always lets Owner (and superadmin) through.

PERMISSION_KEYS is deliberately small: only what the platform-lifecycle
scope-out actually asked for (client visibility/assignment, task visibility).
clients.manage / clients.delete / services.manage / tasks.manage are defined
and seeded (so an Owner can see and toggle them today) but are not yet
enforced on any write endpoint — see PLATFORM_IMPLEMENTATION_LOG.md.
"""

from __future__ import annotations

from dataclasses import dataclass

from .models import Client, Role, RolePermission

PERMISSION_KEYS: tuple[str, ...] = (
    "clients.view_all",
    "clients.manage",
    "clients.delete",
    "clients.assign",
    "services.manage",
    "tasks.view_all",
    "tasks.manage",
)


@dataclass(frozen=True, slots=True)
class PermissionInfo:
    key: str
    label: str
    description: str


PERMISSION_CATALOG: tuple[PermissionInfo, ...] = (
    PermissionInfo(
        "clients.view_all",
        "See every client",
        "Off restricts this role to only the clients assigned to them (Client.owner_id).",
    ),
    PermissionInfo(
        "clients.manage",
        "Create and edit clients",
        "Off means this role cannot create a client record or edit an existing one.",
    ),
    PermissionInfo(
        "clients.delete",
        "Delete clients",
        "Off means this role cannot permanently delete a client.",
    ),
    PermissionInfo(
        "clients.assign",
        "Reassign clients to staff",
        "Off means this role cannot change which staff member a client is assigned to.",
    ),
    PermissionInfo(
        "services.manage",
        "Manage the service catalogue",
        "Off means this role cannot create/edit services or assign services to a client.",
    ),
    PermissionInfo(
        "tasks.view_all",
        "See tasks for every client",
        "Off restricts visible client-linked tasks/projects to clients assigned to them. Internal (non-client) tasks stay visible either way.",
    ),
    PermissionInfo(
        "tasks.manage",
        "Create and edit tasks",
        "Off means this role cannot create, edit, or move tasks/projects.",
    ),
)

# Reproduces exactly what the hardcoded 4-role enum did before this system
# existed. Used for (a) the migration's seed data (kept in sync by hand — see
# db/migrations/0018_roles_permissions.sql's header comment) and (b) as the
# runtime fallback for any profile whose role_id is somehow still unset (a
# brand-new profile created between deploy and a UI update, for instance).
_LEGACY_DEFAULTS: dict[str, dict[str, bool]] = {
    "admin": {
        "clients.view_all": False,
        "clients.manage": True,
        "clients.delete": True,
        "clients.assign": True,
        "services.manage": True,
        "tasks.view_all": True,
        "tasks.manage": True,
    },
    "member": {
        "clients.view_all": True,
        "clients.manage": True,
        "clients.delete": False,
        "clients.assign": True,
        "services.manage": True,
        "tasks.view_all": True,
        "tasks.manage": True,
    },
    "viewer": {
        "clients.view_all": True,
        "clients.manage": True,
        "clients.delete": False,
        "clients.assign": True,
        "services.manage": True,
        "tasks.view_all": True,
        "tasks.manage": True,
    },
}

# Applied when seeding a brand-new tenant's starter roles (see seed_default_roles
# below) — same three names and grants the migration backfilled onto existing
# tenants, so the experience is identical whether a firm predates this feature
# or signs up after it.
DEFAULT_ROLE_TEMPLATES: tuple[tuple[str, str, dict[str, bool]], ...] = (
    ("Admin", "Restricted to their own assigned clients.", _LEGACY_DEFAULTS["admin"]),
    ("Member", "Full access to the firm's book.", _LEGACY_DEFAULTS["member"]),
    ("Viewer", "Full access to the firm's book.", _LEGACY_DEFAULTS["viewer"]),
)


def resolve_permission(
    *,
    is_superadmin: bool,
    legacy_role: str,
    role_permissions: dict[str, bool] | None,
    key: str,
) -> bool:
    """Pure decision function — no session, no request, so it's directly unit
    testable. `role_permissions` is the caller's role_id's grants (None if
    they have no role_id, e.g. Owner, or an as-yet-unmigrated profile)."""
    if is_superadmin or legacy_role == "owner":
        return True
    if role_permissions is not None:
        return role_permissions.get(key, False)
    return _LEGACY_DEFAULTS.get(legacy_role, {}).get(key, True)


def has_permission(user, key: str) -> bool:
    """Convenience wrapper around resolve_permission for a deps.CurrentUser.
    Kept separate from resolve_permission so routers have one obvious import,
    while tests exercise the pure function directly without constructing a
    full CurrentUser."""
    return resolve_permission(
        is_superadmin=bool(user.profile.is_superadmin),
        legacy_role=user.profile.role,
        role_permissions=user.role_permissions,
        key=key,
    )


async def seed_default_roles(session, tenant_id) -> None:
    """Give a brand-new tenant the same three starter roles (Admin/Member/
    Viewer) that db/migrations/0018_roles_permissions.sql backfilled onto
    every tenant that existed before this feature — so a firm that signs up
    after this ships has an identical starting point to one that predates it.
    Called from deps._provision_profile (self-serve signup) and
    admin.provision_tenant (superadmin-created tenant)."""
    for name, description, grants in DEFAULT_ROLE_TEMPLATES:
        role = Role(tenant_id=tenant_id, name=name, description=description)
        session.add(role)
        await session.flush()
        for key, allowed in grants.items():
            session.add(RolePermission(role_id=role.id, permission_key=key, allowed=allowed))
    await session.flush()


def client_owner_clause(user):
    """SQLAlchemy filter clause restricting a query to clients owned by this
    user (Client.owner_id == user.id), or None when clients.view_all lets
    them see the whole tenant's book.

    Shared by clients.py, services.py's /client-services listing, and
    workflows.py's /tasks and /projects listings — every place a client is
    involved should apply the same rule. Before this permissions system
    existed, only /clients/* did (clients.py's old _owner_scope), which was a
    real gap: a restricted admin could still see every client's
    service-assignments and tasks through those other two routers."""
    if has_permission(user, "clients.view_all"):
        return None
    return Client.owner_id == user.profile.id
