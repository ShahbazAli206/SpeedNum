"""Tenant-defined custom fields for clients, tasks and projects."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from ..deps import AdminUserDep, SessionDep, TenantUserDep
from ..models import CustomField
from ..schemas import CustomFieldCreate, CustomFieldRead, CustomFieldUpdate, Ok
from ..utils import apply_updates, ensure_found

router = APIRouter(prefix="/custom-fields", tags=["custom-fields"])


@router.get("", response_model=list[CustomFieldRead])
async def list_fields(
    session: SessionDep, user: TenantUserDep, entity: str | None = None
) -> list[CustomFieldRead]:
    stmt = select(CustomField).where(CustomField.tenant_id == user.tenant_id)
    if entity:
        stmt = stmt.where(CustomField.entity == entity)
    rows = (await session.scalars(stmt.order_by(CustomField.entity, CustomField.position))).all()
    return [CustomFieldRead.model_validate(row) for row in rows]


@router.post("", response_model=CustomFieldRead, status_code=status.HTTP_201_CREATED)
async def create_field(
    payload: CustomFieldCreate, session: SessionDep, user: AdminUserDep
) -> CustomFieldRead:
    exists = await session.scalar(
        select(CustomField.id).where(
            CustomField.tenant_id == user.tenant_id,
            CustomField.entity == payload.entity,
            CustomField.key == payload.key,
        )
    )
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Field key '{payload.key}' is already in use.")

    row = CustomField(tenant_id=user.tenant_id, **payload.model_dump())
    session.add(row)
    await session.flush()
    return CustomFieldRead.model_validate(row)


@router.patch("/{field_id}", response_model=CustomFieldRead)
async def update_field(
    field_id: uuid.UUID, payload: CustomFieldUpdate, session: SessionDep, user: AdminUserDep
) -> CustomFieldRead:
    row = await session.scalar(
        select(CustomField).where(CustomField.id == field_id, CustomField.tenant_id == user.tenant_id)
    )
    ensure_found(row, "Custom field")
    apply_updates(row, payload)
    await session.flush()
    return CustomFieldRead.model_validate(row)


@router.delete("/{field_id}", response_model=Ok)
async def delete_field(field_id: uuid.UUID, session: SessionDep, user: AdminUserDep) -> Ok:
    row = await session.scalar(
        select(CustomField).where(CustomField.id == field_id, CustomField.tenant_id == user.tenant_id)
    )
    ensure_found(row, "Custom field")
    await session.delete(row)
    return Ok(message="Custom field removed. Stored values are left untouched.")
