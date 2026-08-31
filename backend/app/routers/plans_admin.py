"""Plan catalog management — platform superadmin only.

The billing catalog (plan names, prices, seat caps, and the set of plans) is
DB-backed so a superadmin can edit it without a deploy. Company owners read the
active plans via GET /billing/plans (see plan_requests.py's get_billing_overview);
this router is the write side. Mirrors platform_finance.py's shape: SuperadminDep
on every handler, local Pydantic models rather than growing schemas.py.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from ..deps import SessionDep, SuperadminDep
from ..models import Plan, Tenant
from ..schemas import Ok
from ..utils import ensure_found

router = APIRouter(prefix="/admin/plans", tags=["admin"])


def _slugify(label: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")
    return slug or "plan"


# --- schemas -------------------------------------------------------------------
class PlanCreate(BaseModel):
    label: str = Field(min_length=1, max_length=60)
    price: int | None = Field(default=None, ge=0, le=1_000_000)
    max_clients: int | None = Field(default=None, ge=0, le=10_000_000)
    max_staff: int | None = Field(default=None, ge=0, le=10_000_000)
    blurb: str = Field(default="", max_length=280)
    position: int | None = Field(default=None, ge=0)
    is_active: bool = True


class PlanUpdate(BaseModel):
    # All optional so PATCH can touch one field. price / max_* are nullable with
    # meaning (null = quoted / unlimited), so the frontend sends them explicitly
    # to change them and model_dump(exclude_unset=True) preserves that intent.
    label: str | None = Field(default=None, min_length=1, max_length=60)
    price: int | None = Field(default=None, ge=0, le=1_000_000)
    max_clients: int | None = Field(default=None, ge=0, le=10_000_000)
    max_staff: int | None = Field(default=None, ge=0, le=10_000_000)
    blurb: str | None = Field(default=None, max_length=280)
    position: int | None = Field(default=None, ge=0)
    is_active: bool | None = None


class PlanRead(BaseModel):
    id: uuid.UUID
    key: str
    label: str
    price: int | None
    max_clients: int | None
    max_staff: int | None
    blurb: str
    position: int
    is_active: bool
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


# --- endpoints -----------------------------------------------------------------
@router.get("", response_model=list[PlanRead])
async def list_plans(session: SessionDep, user: SuperadminDep) -> list[PlanRead]:
    rows = (
        await session.scalars(select(Plan).order_by(Plan.position, Plan.created_at))
    ).all()
    return [PlanRead.model_validate(row) for row in rows]


@router.post("", response_model=PlanRead, status_code=status.HTTP_201_CREATED)
async def create_plan(payload: PlanCreate, session: SessionDep, user: SuperadminDep) -> PlanRead:
    # Key is derived from the label and kept immutable (tenants store it as
    # Tenant.plan); de-duplicate with a numeric suffix rather than rejecting.
    base = _slugify(payload.label)
    key = base
    suffix = 2
    while await session.scalar(select(Plan.id).where(Plan.key == key)) is not None:
        key = f"{base}-{suffix}"
        suffix += 1

    position = payload.position
    if position is None:
        position = (await session.scalar(select(func.max(Plan.position))) or 0) + 1

    row = Plan(
        key=key,
        label=payload.label,
        price=payload.price,
        max_clients=payload.max_clients,
        max_staff=payload.max_staff,
        blurb=payload.blurb,
        position=position,
        is_active=payload.is_active,
    )
    session.add(row)
    await session.flush()
    return PlanRead.model_validate(row)


@router.patch("/{plan_id}", response_model=PlanRead)
async def update_plan(
    plan_id: uuid.UUID, payload: PlanUpdate, session: SessionDep, user: SuperadminDep
) -> PlanRead:
    row = await session.get(Plan, plan_id)
    ensure_found(row, "Plan")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    await session.flush()
    return PlanRead.model_validate(row)


@router.delete("/{plan_id}", response_model=Ok)
async def delete_plan(plan_id: uuid.UUID, session: SessionDep, user: SuperadminDep) -> Ok:
    row = await session.get(Plan, plan_id)
    ensure_found(row, "Plan")
    # Don't orphan firms that are currently on this plan — deactivating keeps the
    # tenant's stored plan meaningful while hiding it from the catalog.
    in_use = await session.scalar(select(func.count(Tenant.id)).where(Tenant.plan == row.key))
    if in_use:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{in_use} firm(s) are on this plan. Move them to another plan first, or deactivate it instead.",
        )
    await session.delete(row)
    return Ok(message="Plan deleted")
