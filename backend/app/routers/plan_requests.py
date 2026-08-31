"""Plan-change requests: an owner asks to move their firm to a different plan
tier, a platform superadmin reviews and applies it (or declines it).

Two routers live in this one file because they're two halves of the same
small workflow: `/billing/*` is what the firm side sees (their own plan, the
catalog, their own request history), `/admin/plan-requests/*` is the
superadmin's queue for acting on them. Neither self-serve-applies a plan —
see PLATFORM_IMPLEMENTATION_LOG.md-style reasoning in app/seats.py: seat caps
are provider-controlled, so a request is not the same thing as a change.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from ..deps import AdminUserDep, SessionDep, SuperadminDep, TenantUserDep, client_ip
from ..models import PlanChangeRequest, Tenant
from ..plans import PLAN_CATALOG
from ..schemas import Ok
from ..seats import seat_usage
from ..services import audit
from ..utils import ensure_found, read
from .admin import apply_tenant_edit

router = APIRouter(prefix="/billing", tags=["billing"])
admin_router = APIRouter(prefix="/admin/plan-requests", tags=["admin"])


# --- schemas -----------------------------------------------------------------
class PlanTierRead(BaseModel):
    key: str
    label: str
    max_clients: int | None
    max_staff: int | None
    blurb: str


class BillingOverview(BaseModel):
    current_plan: str
    max_clients: int | None
    max_users: int | None
    staff_used: int
    client_used: int
    catalog: list[PlanTierRead]
    has_pending_request: bool


class PlanRequestCreate(BaseModel):
    requested_plan: str = Field(min_length=1, max_length=40)
    note: str | None = Field(default=None, max_length=2000)


class PlanRequestRead(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    current_plan: str
    requested_plan: str
    note: str | None
    status: str
    resolution_note: str | None
    resolved_at: datetime | None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class PlanRequestAdminRead(PlanRequestRead):
    # Both are layered on by read() via model_copy — but model_validate(orm_row)
    # runs first, and the ORM PlanChangeRequest has neither attribute, so both
    # must carry a default or that validation pass raises before the real value
    # is applied (a 500 on the whole /admin/plan-requests queue). Same optional
    # shape as platform_finance.IncomeRead.tenant_name for the same reason.
    tenant_name: str | None = None
    requested_by_email: str | None = None


class PlanRequestApprove(BaseModel):
    """Both caps are required, even though either may be null ("unlimited") —
    the superadmin confirms the exact numbers being granted rather than the
    catalog's suggestion silently applying. See app/plans.py's suggested_caps
    for what the frontend prefills these with."""

    max_clients: int | None = Field(ge=0)
    max_users: int | None = Field(ge=0)


class PlanRequestReject(BaseModel):
    note: str | None = Field(default=None, max_length=2000)


# --- helpers -------------------------------------------------------------------
async def _notify_platform(session: SessionDep, *, title: str, body: str, link: str | None = None) -> None:
    """Best-effort notification into the platform's own workspace (see
    Tenant.settings.is_platform, and components/firm/shell.tsx's
    isPlatformTenant on the frontend for the matching concept). A no-op until
    one tenant has been flagged as the platform's workspace."""
    rows = (await session.execute(select(Tenant.id, Tenant.settings))).all()
    platform_id = next((tid for tid, s in rows if bool((s or {}).get("is_platform"))), None)
    if platform_id is None:
        return
    await audit.notify(session, tenant_id=platform_id, title=title, body=body, link=link, type="billing")


# --- firm side: /billing ------------------------------------------------------
@router.get("/plans", response_model=BillingOverview)
async def get_billing_overview(session: SessionDep, user: TenantUserDep) -> BillingOverview:
    tenant = user.tenant
    usage = await seat_usage(session, tenant)
    pending = await session.scalar(
        select(func.count(PlanChangeRequest.id)).where(
            PlanChangeRequest.tenant_id == tenant.id, PlanChangeRequest.status == "pending"
        )
    )
    return BillingOverview(
        current_plan=tenant.plan,
        max_clients=usage["client_seats"],
        max_users=usage["staff_seats"],
        staff_used=usage["staff_used"],
        client_used=usage["client_used"],
        catalog=[PlanTierRead(**tier) for tier in PLAN_CATALOG],
        has_pending_request=bool(pending),
    )


@router.get("/requests", response_model=list[PlanRequestRead])
async def list_own_plan_requests(session: SessionDep, user: TenantUserDep) -> list[PlanRequestRead]:
    rows = (
        await session.scalars(
            select(PlanChangeRequest)
            .where(PlanChangeRequest.tenant_id == user.tenant.id)
            .order_by(PlanChangeRequest.created_at.desc())
        )
    ).all()
    return [PlanRequestRead.model_validate(row) for row in rows]


@router.post("/requests", response_model=PlanRequestRead, status_code=status.HTTP_201_CREATED)
async def create_plan_request(
    payload: PlanRequestCreate, session: SessionDep, user: AdminUserDep, request: Request
) -> PlanRequestRead:
    tenant = user.tenant
    if payload.requested_plan == tenant.plan:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This firm is already on that plan.")

    existing = await session.scalar(
        select(PlanChangeRequest.id).where(
            PlanChangeRequest.tenant_id == tenant.id, PlanChangeRequest.status == "pending"
        )
    )
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A plan change request is already pending for this firm.")

    row = PlanChangeRequest(
        tenant_id=tenant.id,
        requested_by=user.profile.id,
        current_plan=tenant.plan,
        requested_plan=payload.requested_plan,
        note=payload.note,
    )
    session.add(row)
    await session.flush()

    await audit.record(
        session,
        tenant_id=tenant.id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="requested",
        entity="plan_change_request",
        entity_id=row.id,
        summary=f"{user.profile.email} requested a move from {tenant.plan} to {payload.requested_plan}",
        ip_address=client_ip(request),
    )
    await _notify_platform(
        session,
        title=f"Plan change requested: {tenant.name}",
        body=f"{tenant.name} asked to move from {tenant.plan} to {payload.requested_plan}.",
        link="/admin/plan-requests",
    )
    return PlanRequestRead.model_validate(row)


@router.delete("/requests/{request_id}", response_model=Ok)
async def cancel_plan_request(request_id: uuid.UUID, session: SessionDep, user: AdminUserDep) -> Ok:
    row = await session.get(PlanChangeRequest, request_id)
    ensure_found(row, "Plan change request")
    if row.tenant_id != user.tenant.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan change request not found")
    if row.status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, "Only a pending request can be cancelled.")
    row.status = "cancelled"
    row.resolved_at = datetime.now(timezone.utc)
    row.resolved_by = user.profile.id
    await session.flush()
    return Ok(message="Request cancelled")


# --- provider side: /admin/plan-requests --------------------------------------
@admin_router.get("", response_model=list[PlanRequestAdminRead])
async def list_plan_requests(
    session: SessionDep,
    user: SuperadminDep,
    status_filter: str | None = Query(default=None, alias="status"),
) -> list[PlanRequestAdminRead]:
    stmt = select(PlanChangeRequest, Tenant.name).join(Tenant, Tenant.id == PlanChangeRequest.tenant_id)
    if status_filter:
        stmt = stmt.where(PlanChangeRequest.status == status_filter)
    rows = (await session.execute(stmt.order_by(PlanChangeRequest.created_at.desc()))).all()
    return [read(PlanRequestAdminRead, row, tenant_name=tenant_name) for row, tenant_name in rows]


@admin_router.post("/{request_id}/approve", response_model=PlanRequestAdminRead)
async def approve_plan_request(
    request_id: uuid.UUID,
    payload: PlanRequestApprove,
    session: SessionDep,
    user: SuperadminDep,
    request: Request,
) -> PlanRequestAdminRead:
    row = await session.get(PlanChangeRequest, request_id)
    ensure_found(row, "Plan change request")
    if row.status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, "This request was already resolved.")

    tenant = await session.get(Tenant, row.tenant_id)
    ensure_found(tenant, "Tenant")

    changed = await apply_tenant_edit(
        session,
        tenant,
        {"plan": row.requested_plan, "max_clients": payload.max_clients, "max_users": payload.max_users},
    )

    row.status = "approved"
    row.resolved_at = datetime.now(timezone.utc)
    row.resolved_by = user.profile.id
    await session.flush()

    if changed:
        await audit.record(
            session,
            tenant_id=tenant.id,
            actor_id=user.profile.id,
            actor_email=user.profile.email,
            action="approved",
            entity="plan_change_request",
            entity_id=row.id,
            summary=f"Approved {tenant.name}'s move to {row.requested_plan} ({', '.join(sorted(set(changed)))})",
            ip_address=client_ip(request),
        )
    await audit.notify(
        session,
        tenant_id=tenant.id,
        title="Your plan change was approved",
        body=f"{tenant.name} is now on the {row.requested_plan} plan.",
        link="/billing",
    )
    return read(PlanRequestAdminRead, row, tenant_name=tenant.name)


@admin_router.post("/{request_id}/reject", response_model=PlanRequestAdminRead)
async def reject_plan_request(
    request_id: uuid.UUID,
    payload: PlanRequestReject,
    session: SessionDep,
    user: SuperadminDep,
    request: Request,
) -> PlanRequestAdminRead:
    row = await session.get(PlanChangeRequest, request_id)
    ensure_found(row, "Plan change request")
    if row.status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, "This request was already resolved.")

    tenant = await session.get(Tenant, row.tenant_id)
    ensure_found(tenant, "Tenant")

    row.status = "rejected"
    row.resolution_note = payload.note
    row.resolved_at = datetime.now(timezone.utc)
    row.resolved_by = user.profile.id
    await session.flush()

    await audit.record(
        session,
        tenant_id=tenant.id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="rejected",
        entity="plan_change_request",
        entity_id=row.id,
        summary=f"Declined {tenant.name}'s request to move to {row.requested_plan}",
        ip_address=client_ip(request),
    )
    await audit.notify(
        session,
        tenant_id=tenant.id,
        title="Your plan change request was declined",
        body=payload.note or f"Your request to move to {row.requested_plan} was declined.",
        link="/billing",
    )
    return read(PlanRequestAdminRead, row, tenant_name=tenant.name)
