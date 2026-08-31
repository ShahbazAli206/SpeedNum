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
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from ..deps import AdminUserDep, SessionDep, SuperadminDep, TenantUserDep, client_ip
from ..models import Plan, PlanChangeRequest, PlatformInvoice, Tenant
from ..plans import PLAN_CATALOG
from ..schemas import Ok
from ..seats import seat_usage
from ..services import audit
from ..utils import ensure_found, read, today_utc
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
    # Monthly list price in whole dollars; None = quoted per firm (Enterprise).
    price: int | None = None


class BillingOverview(BaseModel):
    current_plan: str
    max_clients: int | None
    max_users: int | None
    staff_used: int
    client_used: int
    catalog: list[PlanTierRead]
    has_pending_request: bool
    # Expiry dates (0024) so the company's billing page can show them and offer
    # "Request renewal" when either is close or past. Null = not tracked.
    plan_expires_at: datetime | None = None
    service_expires_at: datetime | None = None


class RenewalRequest(BaseModel):
    note: str | None = Field(default=None, max_length=2000)


class CompanyInvoiceItemRead(BaseModel):
    id: uuid.UUID
    description: str
    quantity: float
    unit_price: float
    amount: float
    position: int

    model_config = {"from_attributes": True}


class CompanyInvoiceRead(BaseModel):
    """Read-only view of a PlatformInvoice from the paying company's side —
    the counterpart of platform_invoices.py's InvoiceRead, shown on the
    company's own /billing page. See db/migrations/0026."""

    id: uuid.UUID
    number: str
    title: str
    issued_on: date
    due_on: date
    currency: str
    subtotal: float
    tax_rate: float
    tax_amount: float
    total: float
    amount_paid: float
    status: str
    paid_on: date | None = None
    notes: str | None = None
    created_at: datetime | None = None
    items: list[CompanyInvoiceItemRead] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class PlanRequestCreate(BaseModel):
    # A catalog key ("starter"…) or the sentinel "custom", in which case
    # custom_clients/custom_seats carry the requested sizing.
    requested_plan: str = Field(min_length=1, max_length=40)
    note: str | None = Field(default=None, max_length=2000)
    custom_clients: int | None = Field(default=None, ge=1, le=1_000_000)
    custom_seats: int | None = Field(default=None, ge=1, le=1_000_000)
    # Optional image data URL (data:image/...). Capped here so a runaway paste
    # can't bloat the row — ~4M chars of base64 is roughly a 3 MB image.
    attachment: str | None = Field(default=None, max_length=4_000_000)


class PlanRequestRead(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    current_plan: str
    requested_plan: str
    note: str | None
    custom_clients: int | None = None
    custom_seats: int | None = None
    attachment: str | None = None
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
    # The catalog is DB-backed and superadmin-editable (/admin/plans); read the
    # active plans in display order. Fall back to app/plans.py's PLAN_CATALOG
    # only if the table is empty (a fresh DB not yet seeded / a test fixture).
    plan_rows = (
        await session.scalars(
            select(Plan).where(Plan.is_active.is_(True)).order_by(Plan.position, Plan.created_at)
        )
    ).all()
    catalog = (
        [
            PlanTierRead(
                key=p.key,
                label=p.label,
                max_clients=p.max_clients,
                max_staff=p.max_staff,
                blurb=p.blurb,
                price=p.price,
            )
            for p in plan_rows
        ]
        if plan_rows
        else [PlanTierRead(**tier) for tier in PLAN_CATALOG]
    )
    return BillingOverview(
        current_plan=tenant.plan,
        max_clients=usage["client_seats"],
        max_users=usage["staff_seats"],
        staff_used=usage["staff_used"],
        client_used=usage["client_used"],
        catalog=catalog,
        has_pending_request=bool(pending),
        plan_expires_at=tenant.plan_expires_at,
        service_expires_at=tenant.service_expires_at,
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


def _company_invoice_status(row: PlatformInvoice, today: date) -> str:
    if row.status == "sent" and row.due_on < today:
        return "overdue"
    return row.status


def _to_company_invoice_read(row: PlatformInvoice, today: date) -> CompanyInvoiceRead:
    base = CompanyInvoiceRead.model_validate(row)
    return base.model_copy(
        update={
            "status": _company_invoice_status(row, today),
            "items": [CompanyInvoiceItemRead.model_validate(item) for item in row.items],
        }
    )


@router.get("/invoices", response_model=list[CompanyInvoiceRead])
async def list_company_invoices(session: SessionDep, user: TenantUserDep) -> list[CompanyInvoiceRead]:
    """Invoices SpeedNum has sent this firm — the read-only counterpart of
    platform_invoices.py's superadmin-side router. "draft" invoices are
    invisible here, same as firm_invoices.py's own client-facing view."""
    stmt = (
        select(PlatformInvoice)
        .where(PlatformInvoice.tenant_id == user.tenant_id, PlatformInvoice.status != "draft")
        .order_by(PlatformInvoice.issued_on.desc())
    )
    rows = (await session.scalars(stmt)).all()
    today = today_utc()
    return [_to_company_invoice_read(row, today) for row in rows]


@router.get("/invoices/{invoice_id}", response_model=CompanyInvoiceRead)
async def get_company_invoice(
    invoice_id: uuid.UUID, session: SessionDep, user: TenantUserDep
) -> CompanyInvoiceRead:
    row = await session.scalar(
        select(PlatformInvoice).where(
            PlatformInvoice.id == invoice_id,
            PlatformInvoice.tenant_id == user.tenant_id,
            PlatformInvoice.status != "draft",
        )
    )
    ensure_found(row, "Invoice")
    return _to_company_invoice_read(row, today_utc())


@router.post("/requests", response_model=PlanRequestRead, status_code=status.HTTP_201_CREATED)
async def create_plan_request(
    payload: PlanRequestCreate, session: SessionDep, user: AdminUserDep, request: Request
) -> PlanRequestRead:
    tenant = user.tenant
    is_custom = payload.requested_plan == "custom"
    if is_custom:
        if payload.custom_clients is None or payload.custom_seats is None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "A custom plan needs both a client count and a staff-seat count.",
            )
    elif payload.requested_plan == tenant.plan:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This firm is already on that plan.")

    if payload.attachment is not None and not payload.attachment.startswith("data:image/"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The attachment must be an image.")

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
        custom_clients=payload.custom_clients if is_custom else None,
        custom_seats=payload.custom_seats if is_custom else None,
        attachment=payload.attachment,
    )
    session.add(row)
    await session.flush()

    target = (
        f"a custom plan ({payload.custom_clients} clients / {payload.custom_seats} staff)"
        if is_custom
        else payload.requested_plan
    )
    await audit.record(
        session,
        tenant_id=tenant.id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="requested",
        entity="plan_change_request",
        entity_id=row.id,
        summary=f"{user.profile.email} requested a move from {tenant.plan} to {target}",
        ip_address=client_ip(request),
    )
    await _notify_platform(
        session,
        title=f"Plan change requested: {tenant.name}",
        body=f"{tenant.name} asked to move from {tenant.plan} to {target}.",
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


@router.post("/renewal-request", response_model=Ok, status_code=status.HTTP_201_CREATED)
async def request_renewal(
    payload: RenewalRequest, session: SessionDep, user: AdminUserDep, request: Request
) -> Ok:
    """A company owner/admin asks the platform to renew / reactivate their plan —
    a lightweight ping into the firm-owner's bell (via _notify_platform), distinct
    from a plan-tier change (POST /requests, which opens a reviewable queue item).
    Deduped to once per 24h so a repeatedly-clicked expiry banner can't spam the
    platform."""
    tenant = user.tenant
    now = datetime.now(timezone.utc)
    tenant_settings = dict(tenant.settings or {})
    last_raw = tenant_settings.get("renewal_requested_at")
    if isinstance(last_raw, str):
        try:
            last = datetime.fromisoformat(last_raw)
        except ValueError:
            last = None
        if last is not None and now - last < timedelta(hours=24):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "A renewal request was already sent in the last 24 hours.",
            )

    note = (payload.note or "").strip()
    body = f"{tenant.name} asked to renew or reactivate their plan."
    if note:
        body += f" Note: {note}"
    await _notify_platform(
        session,
        title=f"{tenant.name} requested a plan renewal",
        body=body,
        link="/admin",
    )
    tenant_settings["renewal_requested_at"] = now.isoformat()
    tenant.settings = tenant_settings
    await audit.record(
        session,
        tenant_id=tenant.id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="requested",
        entity="renewal",
        summary=f"{tenant.name} requested a plan renewal",
        ip_address=client_ip(request),
    )
    return Ok(message="Renewal request sent")


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
