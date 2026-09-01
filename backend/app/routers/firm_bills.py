"""Firm bills: the accounting firm's own accounts payable — what it spends
running the practice (software, rent, salaries, ...), plus a read-only view of
what it has paid SpidNums for its own subscription.

The subscription rows are not stored here: they are `platform_income` rows the
platform superadmin already logs against this tenant on `/admin/finance` (see
platform_finance.py) or, once a platform invoice is paid, via
platform_invoices.py's record-payment endpoint (db/migrations/0026). Merging
them at read time means the two ledgers can never drift apart — there is
exactly one row for "Acme Corp paid $499", not a firm-side copy that could go
stale. See db/migrations/0026_invoicing_and_bills.sql.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from ..deps import SessionDep, TenantUserDep
from ..models import FirmBill, PlatformIncome
from ..schemas import FirmBillCreate, FirmBillRead, FirmBillTotals, FirmBillUpdate, Ok
from ..utils import apply_updates, ensure_found, today_utc

router = APIRouter(prefix="/bills", tags=["bills"])


def _require_admin(user) -> None:
    # Mirrors clients.py's inline has_permission checks in spirit: the firm's
    # own spend is sensitive enough to restrict to Owner/Admin/superadmin
    # (CurrentUser.is_admin), same bar as approving a plan-change request
    # (plan_requests.py's AdminUserDep) — but every staff member can still
    # read the list, same as /billing.
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Requires an owner or admin role.")


def _to_read(row: FirmBill) -> FirmBillRead:
    return FirmBillRead(
        id=row.id,
        category=row.category,
        vendor=row.vendor,
        amount=float(row.amount),
        currency=row.currency,
        bill_date=row.bill_date,
        due_date=row.due_date,
        status=row.status,
        paid_on=row.paid_on,
        is_recurring=row.is_recurring,
        notes=row.notes,
        source="manual",
        created_at=row.created_at,
    )


def _subscription_row(row: PlatformIncome) -> FirmBillRead:
    return FirmBillRead(
        id=row.id,
        category="subscription",
        vendor="SpidNums",
        amount=float(row.amount),
        currency=row.currency,
        bill_date=row.received_date,
        due_date=None,
        status="paid",
        paid_on=row.received_date,
        is_recurring=False,
        notes=row.notes,
        source="subscription",
        created_at=row.created_at,
    )


async def _subscription_rows(session: SessionDep, tenant_id: uuid.UUID) -> list[PlatformIncome]:
    stmt = select(PlatformIncome).where(PlatformIncome.tenant_id == tenant_id)
    return list((await session.scalars(stmt)).all())


@router.get("", response_model=list[FirmBillRead])
async def list_bills(
    session: SessionDep,
    user: TenantUserDep,
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=200, ge=1, le=500),
) -> list[FirmBillRead]:
    manual_stmt = select(FirmBill).where(FirmBill.tenant_id == user.tenant_id)
    manual_rows = (await session.scalars(manual_stmt.order_by(FirmBill.bill_date.desc()).limit(limit))).all()
    subscription_rows = await _subscription_rows(session, user.tenant_id)

    items = [_to_read(row) for row in manual_rows] + [_subscription_row(row) for row in subscription_rows]
    if status_filter:
        wanted = {s.strip() for s in status_filter.split(",") if s.strip()}
        items = [item for item in items if item.status in wanted]
    items.sort(key=lambda item: item.bill_date, reverse=True)
    return items[:limit]


@router.get("/totals", response_model=FirmBillTotals)
async def bill_totals(session: SessionDep, user: TenantUserDep) -> FirmBillTotals:
    manual_rows = (await session.scalars(select(FirmBill).where(FirmBill.tenant_id == user.tenant_id))).all()
    subscription_rows = await _subscription_rows(session, user.tenant_id)

    paid = sum(float(r.amount) for r in manual_rows if r.status == "paid") + sum(
        float(r.amount) for r in subscription_rows
    )
    unpaid = sum(float(r.amount) for r in manual_rows if r.status == "unpaid")

    return FirmBillTotals(
        paid=round(paid, 2),
        unpaid=round(unpaid, 2),
        count=len(manual_rows) + len(subscription_rows),
    )


@router.post("", response_model=FirmBillRead, status_code=status.HTTP_201_CREATED)
async def create_bill(payload: FirmBillCreate, session: SessionDep, user: TenantUserDep) -> FirmBillRead:
    _require_admin(user)
    row = FirmBill(
        tenant_id=user.tenant_id,
        category=payload.category,
        vendor=payload.vendor,
        amount=payload.amount,
        currency=payload.currency,
        bill_date=payload.bill_date or today_utc(),
        due_date=payload.due_date,
        is_recurring=payload.is_recurring,
        notes=payload.notes,
        created_by=user.profile.id,
    )
    session.add(row)
    await session.flush()
    return _to_read(row)


async def _get_manual(session: SessionDep, user, bill_id: uuid.UUID) -> FirmBill:
    row = await session.scalar(select(FirmBill).where(FirmBill.id == bill_id, FirmBill.tenant_id == user.tenant_id))
    return ensure_found(row, "Bill")


@router.patch("/{bill_id}", response_model=FirmBillRead)
async def update_bill(
    bill_id: uuid.UUID, payload: FirmBillUpdate, session: SessionDep, user: TenantUserDep
) -> FirmBillRead:
    _require_admin(user)
    row = await _get_manual(session, user, bill_id)
    apply_updates(row, payload)
    await session.flush()
    return _to_read(row)


@router.post("/{bill_id}/mark-paid", response_model=FirmBillRead)
async def mark_bill_paid(bill_id: uuid.UUID, session: SessionDep, user: TenantUserDep) -> FirmBillRead:
    _require_admin(user)
    row = await _get_manual(session, user, bill_id)
    row.status = "paid"
    row.paid_on = today_utc()
    await session.flush()
    return _to_read(row)


@router.post("/{bill_id}/mark-unpaid", response_model=FirmBillRead)
async def mark_bill_unpaid(bill_id: uuid.UUID, session: SessionDep, user: TenantUserDep) -> FirmBillRead:
    _require_admin(user)
    row = await _get_manual(session, user, bill_id)
    row.status = "unpaid"
    row.paid_on = None
    await session.flush()
    return _to_read(row)


@router.delete("/{bill_id}", response_model=Ok)
async def delete_bill(bill_id: uuid.UUID, session: SessionDep, user: TenantUserDep) -> Ok:
    _require_admin(user)
    row = await _get_manual(session, user, bill_id)
    await session.delete(row)
    return Ok(message="Bill deleted")
