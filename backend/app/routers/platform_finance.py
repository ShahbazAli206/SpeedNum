"""Provider finance ledger — platform superadmin only.

Manual bookkeeping: a superadmin logs what a tenant firm paid (income) and
what the platform itself spends (hosting, domains, dev/maintenance cost —
expenses), and this computes profit from the two. No payment processor is
wired up (see PLATFORM_IMPLEMENTATION_LOG.md's Phase 2 notes) — this is
deliberately the fast, low-complexity version of "know your margin," not a
billing system.

Mirrors admin_backups.py's shape: SuperadminDep on every handler, local
Pydantic models rather than adding to the already-large schemas.py, since
none of this is tenant-facing data.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from ..deps import SessionDep, SuperadminDep
from ..models import PlatformExpense, PlatformIncome, Tenant
from ..schemas import Ok
from ..utils import ensure_found, read

router = APIRouter(prefix="/admin/finance", tags=["admin"])

ExpenseCategory = Literal["hosting", "domains", "development", "maintenance", "other"]


# --- schemas -------------------------------------------------------------------
class ExpenseCreate(BaseModel):
    category: ExpenseCategory
    vendor: str | None = None
    amount: Decimal = Field(gt=0)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    expense_date: date | None = None
    is_recurring: bool = False
    notes: str | None = None


class ExpenseUpdate(BaseModel):
    category: ExpenseCategory | None = None
    vendor: str | None = None
    amount: Decimal | None = Field(default=None, gt=0)
    currency: str | None = None
    expense_date: date | None = None
    is_recurring: bool | None = None
    notes: str | None = None


class ExpenseRead(BaseModel):
    id: uuid.UUID
    category: str
    vendor: str | None
    amount: Decimal
    currency: str
    expense_date: date
    is_recurring: bool
    notes: str | None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class IncomeCreate(BaseModel):
    tenant_id: uuid.UUID | None = None
    amount: Decimal = Field(gt=0)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    received_date: date | None = None
    method: str = "manual"
    notes: str | None = None


class IncomeUpdate(BaseModel):
    amount: Decimal | None = Field(default=None, gt=0)
    currency: str | None = None
    received_date: date | None = None
    method: str | None = None
    notes: str | None = None


class IncomeRead(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID | None
    tenant_name: str | None = None
    amount: Decimal
    currency: str
    received_date: date
    method: str
    notes: str | None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class FinanceSummary(BaseModel):
    total_income: Decimal
    total_expenses: Decimal
    profit: Decimal
    income_count: int
    expense_count: int


# --- expenses --------------------------------------------------------------------
@router.get("/expenses", response_model=list[ExpenseRead])
async def list_expenses(
    session: SessionDep,
    user: SuperadminDep,
    date_from: date | None = None,
    date_to: date | None = None,
    category: ExpenseCategory | None = None,
) -> list[ExpenseRead]:
    stmt = select(PlatformExpense)
    if date_from:
        stmt = stmt.where(PlatformExpense.expense_date >= date_from)
    if date_to:
        stmt = stmt.where(PlatformExpense.expense_date <= date_to)
    if category:
        stmt = stmt.where(PlatformExpense.category == category)
    rows = (await session.scalars(stmt.order_by(PlatformExpense.expense_date.desc()))).all()
    return [ExpenseRead.model_validate(row) for row in rows]


@router.post("/expenses", response_model=ExpenseRead, status_code=201)
async def create_expense(payload: ExpenseCreate, session: SessionDep, user: SuperadminDep) -> ExpenseRead:
    row = PlatformExpense(
        category=payload.category,
        vendor=payload.vendor,
        amount=payload.amount,
        currency=payload.currency.upper(),
        expense_date=payload.expense_date or date.today(),
        is_recurring=payload.is_recurring,
        notes=payload.notes,
        created_by=user.profile.id,
    )
    session.add(row)
    await session.flush()
    return ExpenseRead.model_validate(row)


@router.patch("/expenses/{expense_id}", response_model=ExpenseRead)
async def update_expense(
    expense_id: uuid.UUID, payload: ExpenseUpdate, session: SessionDep, user: SuperadminDep
) -> ExpenseRead:
    row = await session.get(PlatformExpense, expense_id)
    ensure_found(row, "Expense")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    await session.flush()
    return ExpenseRead.model_validate(row)


@router.delete("/expenses/{expense_id}", response_model=Ok)
async def delete_expense(expense_id: uuid.UUID, session: SessionDep, user: SuperadminDep) -> Ok:
    row = await session.get(PlatformExpense, expense_id)
    ensure_found(row, "Expense")
    await session.delete(row)
    return Ok(message="Expense deleted")


# --- income ----------------------------------------------------------------------
@router.get("/income", response_model=list[IncomeRead])
async def list_income(
    session: SessionDep,
    user: SuperadminDep,
    date_from: date | None = None,
    date_to: date | None = None,
    tenant_id: uuid.UUID | None = None,
) -> list[IncomeRead]:
    stmt = select(PlatformIncome, Tenant.name).outerjoin(Tenant, Tenant.id == PlatformIncome.tenant_id)
    if date_from:
        stmt = stmt.where(PlatformIncome.received_date >= date_from)
    if date_to:
        stmt = stmt.where(PlatformIncome.received_date <= date_to)
    if tenant_id:
        stmt = stmt.where(PlatformIncome.tenant_id == tenant_id)
    rows = (await session.execute(stmt.order_by(PlatformIncome.received_date.desc()))).all()
    return [read(IncomeRead, row, tenant_name=tenant_name) for row, tenant_name in rows]


@router.post("/income", response_model=IncomeRead, status_code=201)
async def create_income(payload: IncomeCreate, session: SessionDep, user: SuperadminDep) -> IncomeRead:
    tenant_name = None
    if payload.tenant_id:
        tenant = await session.get(Tenant, payload.tenant_id)
        ensure_found(tenant, "Tenant")
        tenant_name = tenant.name

    row = PlatformIncome(
        tenant_id=payload.tenant_id,
        amount=payload.amount,
        currency=payload.currency.upper(),
        received_date=payload.received_date or date.today(),
        method=payload.method,
        notes=payload.notes,
        created_by=user.profile.id,
    )
    session.add(row)
    await session.flush()
    return read(IncomeRead, row, tenant_name=tenant_name)


@router.patch("/income/{income_id}", response_model=IncomeRead)
async def update_income(
    income_id: uuid.UUID, payload: IncomeUpdate, session: SessionDep, user: SuperadminDep
) -> IncomeRead:
    row = await session.get(PlatformIncome, income_id)
    ensure_found(row, "Income entry")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    await session.flush()
    tenant_name = None
    if row.tenant_id:
        tenant = await session.get(Tenant, row.tenant_id)
        tenant_name = tenant.name if tenant else None
    return read(IncomeRead, row, tenant_name=tenant_name)


@router.delete("/income/{income_id}", response_model=Ok)
async def delete_income(income_id: uuid.UUID, session: SessionDep, user: SuperadminDep) -> Ok:
    row = await session.get(PlatformIncome, income_id)
    ensure_found(row, "Income entry")
    await session.delete(row)
    return Ok(message="Income entry deleted")


# --- summary -----------------------------------------------------------------
@router.get("/summary", response_model=FinanceSummary)
async def finance_summary(
    session: SessionDep,
    user: SuperadminDep,
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
) -> FinanceSummary:
    income_stmt = select(func.coalesce(func.sum(PlatformIncome.amount), 0), func.count(PlatformIncome.id))
    expense_stmt = select(func.coalesce(func.sum(PlatformExpense.amount), 0), func.count(PlatformExpense.id))
    if date_from:
        income_stmt = income_stmt.where(PlatformIncome.received_date >= date_from)
        expense_stmt = expense_stmt.where(PlatformExpense.expense_date >= date_from)
    if date_to:
        income_stmt = income_stmt.where(PlatformIncome.received_date <= date_to)
        expense_stmt = expense_stmt.where(PlatformExpense.expense_date <= date_to)

    total_income, income_count = (await session.execute(income_stmt)).one()
    total_expenses, expense_count = (await session.execute(expense_stmt)).one()

    return FinanceSummary(
        total_income=total_income,
        total_expenses=total_expenses,
        profit=total_income - total_expenses,
        income_count=income_count,
        expense_count=expense_count,
    )
