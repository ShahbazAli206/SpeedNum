"""Tenant-defined staff roles and their permission grants.

Owner/superadmin-gated throughout, same as team.py's roster management —
deciding what a role may see or do is a structural, owner-level action, not
something a role could grant itself. See app/permissions.py for how these
grants are actually enforced at request time.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import func, select

from ..deps import OwnerOrSuperadminDep, SessionDep, client_ip
from ..models import Profile, Role, RolePermission
from ..permissions import PERMISSION_CATALOG, PERMISSION_KEYS
from ..schemas import Ok, PermissionInfo, RoleCreate, RoleRead, RoleUpdate
from ..services import audit
from ..utils import ensure_found, read

router = APIRouter(prefix="/roles", tags=["roles"])


def _validate_permission_keys(keys: list[str]) -> None:
    unknown = sorted(set(keys) - set(PERMISSION_KEYS))
    if unknown:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown permission key(s): {', '.join(unknown)}"
        )


async def _hydrate(session: SessionDep, tenant_id: uuid.UUID, roles: list[Role]) -> list[RoleRead]:
    if not roles:
        return []
    role_ids = [role.id for role in roles]

    grants: dict[uuid.UUID, dict[str, bool]] = {rid: {} for rid in role_ids}
    for role_id, key, allowed in await session.execute(
        select(RolePermission.role_id, RolePermission.permission_key, RolePermission.allowed).where(
            RolePermission.role_id.in_(role_ids)
        )
    ):
        grants[role_id][key] = allowed

    counts = dict(
        (
            await session.execute(
                select(Profile.role_id, func.count(Profile.id))
                .where(Profile.tenant_id == tenant_id, Profile.role_id.in_(role_ids))
                .group_by(Profile.role_id)
            )
        ).all()
    )

    return [
        read(RoleRead, role, permissions=grants.get(role.id, {}), member_count=counts.get(role.id, 0))
        for role in roles
    ]


@router.get("/permissions", response_model=list[PermissionInfo])
async def list_permission_catalog(user: OwnerOrSuperadminDep) -> list[PermissionInfo]:
    """The fixed, system-defined set of permission keys a role can be granted.
    Static — not tenant data — but still gated the same as the rest of this
    router since it only makes sense alongside the role editor."""
    return [PermissionInfo(key=p.key, label=p.label, description=p.description) for p in PERMISSION_CATALOG]


@router.get("", response_model=list[RoleRead])
async def list_roles(session: SessionDep, user: OwnerOrSuperadminDep) -> list[RoleRead]:
    roles = (
        await session.scalars(
            select(Role).where(Role.tenant_id == user.tenant_id).order_by(Role.name)
        )
    ).all()
    return await _hydrate(session, user.tenant_id, list(roles))


@router.post("", response_model=RoleRead, status_code=status.HTTP_201_CREATED)
async def create_role(
    payload: RoleCreate, session: SessionDep, user: OwnerOrSuperadminDep, request: Request
) -> RoleRead:
    _validate_permission_keys([p.permission_key for p in payload.permissions])

    existing = await session.scalar(
        select(Role.id).where(
            Role.tenant_id == user.tenant_id, func.lower(Role.name) == payload.name.strip().lower()
        )
    )
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, f"A role named '{payload.name}' already exists.")

    role = Role(tenant_id=user.tenant_id, name=payload.name.strip(), description=payload.description)
    session.add(role)
    await session.flush()

    for grant in payload.permissions:
        session.add(RolePermission(role_id=role.id, permission_key=grant.permission_key, allowed=grant.allowed))
    await session.flush()

    await audit.record(
        session,
        tenant_id=user.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="created",
        entity="role",
        entity_id=role.id,
        summary=f"Created role '{role.name}'",
        ip_address=client_ip(request),
    )

    rows = await _hydrate(session, user.tenant_id, [role])
    return rows[0]


@router.patch("/{role_id}", response_model=RoleRead)
async def update_role(
    role_id: uuid.UUID,
    payload: RoleUpdate,
    session: SessionDep,
    user: OwnerOrSuperadminDep,
    request: Request,
) -> RoleRead:
    role = await session.scalar(
        select(Role).where(Role.id == role_id, Role.tenant_id == user.tenant_id)
    )
    ensure_found(role, "Role")

    changed: list[str] = []
    if payload.name is not None and payload.name.strip() != role.name:
        clash = await session.scalar(
            select(Role.id).where(
                Role.tenant_id == user.tenant_id,
                Role.id != role.id,
                func.lower(Role.name) == payload.name.strip().lower(),
            )
        )
        if clash:
            raise HTTPException(status.HTTP_409_CONFLICT, f"A role named '{payload.name}' already exists.")
        role.name = payload.name.strip()
        changed.append("name")

    if payload.description is not None and payload.description != role.description:
        role.description = payload.description
        changed.append("description")

    if payload.permissions is not None:
        _validate_permission_keys([p.permission_key for p in payload.permissions])
        existing_grants = (
            await session.scalars(select(RolePermission).where(RolePermission.role_id == role.id))
        ).all()
        for grant_row in existing_grants:
            await session.delete(grant_row)
        await session.flush()
        for grant in payload.permissions:
            session.add(RolePermission(role_id=role.id, permission_key=grant.permission_key, allowed=grant.allowed))
        changed.append("permissions")

    await session.flush()

    if changed:
        await audit.record(
            session,
            tenant_id=user.tenant_id,
            actor_id=user.profile.id,
            actor_email=user.profile.email,
            action="updated",
            entity="role",
            entity_id=role.id,
            summary=f"Updated role '{role.name}' ({', '.join(changed)})",
            ip_address=client_ip(request),
        )

    rows = await _hydrate(session, user.tenant_id, [role])
    return rows[0]


@router.delete("/{role_id}", response_model=Ok)
async def delete_role(
    role_id: uuid.UUID, session: SessionDep, user: OwnerOrSuperadminDep, request: Request
) -> Ok:
    role = await session.scalar(
        select(Role).where(Role.id == role_id, Role.tenant_id == user.tenant_id)
    )
    ensure_found(role, "Role")

    in_use = await session.scalar(
        select(func.count(Profile.id)).where(Profile.tenant_id == user.tenant_id, Profile.role_id == role.id)
    )
    if in_use:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{in_use} staff member(s) still use this role — reassign them to another role first.",
        )

    name = role.name
    await session.delete(role)

    await audit.record(
        session,
        tenant_id=user.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="deleted",
        entity="role",
        entity_id=role_id,
        summary=f"Deleted role '{name}'",
        ip_address=client_ip(request),
    )
    return Ok(message=f"Role '{name}' deleted")
