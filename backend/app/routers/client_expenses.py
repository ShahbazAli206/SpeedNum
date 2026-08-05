"""Client-portal book: expenses the client incurred running its business.

`status` starts "pending" — a client (or their bookkeeper) submits an expense,
and only firm staff can approve or reject it. Shown on /dashboard/expenses.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import select

from ..deps import BookScopeDep, ClientScopeDep, SessionDep, StaffUserDep, client_ip
from ..models import Client, ClientExpense
from ..schemas import (
    CategoryTotal,
    ClientExpenseCreate,
    ClientExpenseRead,
    ClientExpenseTotals,
    ClientExpenseUpdate,
    Ok,
)
from ..services import audit
from ..utils import apply_updates, ensure_client_in_tenant, ensure_found, read

router = APIRouter(prefix="/client-portal/expenses", tags=["client-portal"])


def _scope_stmt(stmt, scope: BookScopeDep):
    return stmt.where(ClientExpense.client_id == scope.client_id) if scope.client_id else stmt


@router.get("", response_model=list[ClientExpenseRead])
async def list_expenses(
    session: SessionDep,
    scope: BookScopeDep,
    status_filter: str | None = Query(default=None, alias="status"),
    category: str | None = None,
    limit: int = Query(default=200, ge=1, le=500),
) -> list[ClientExpenseRead]:
    stmt = (
        select(ClientExpense, Client.legal_name)
        .join(Client, Client.id == ClientExpense.client_id)
        .where(ClientExpense.tenant_id == scope.tenant_id)
    )
    if status_filter:
        stmt = stmt.where(ClientExpense.status == status_filter)
    if category:
        stmt = stmt.where(ClientExpense.category == category)
    rows = (await session.execute(_scope_stmt(stmt, scope).order_by(ClientExpense.spent_on.desc()).limit(limit))).all()
    return [read(ClientExpenseRead, row, client_name=name) for row, name in rows]


async def _approved_rows(session: SessionDep, scope: BookScopeDep) -> list[ClientExpense]:
    stmt = _scope_stmt(
        select(ClientExpense).where(
            ClientExpense.tenant_id == scope.tenant_id, ClientExpense.status == "approved"
        ),
        scope,
    )
    return list((await session.scalars(stmt)).all())


async def gst_paid(session: SessionDep, scope: BookScopeDep) -> float:
    """The input tax credit for a client's book — imported by client_taxes.py,
    mirroring how dashboard.py reuses deadlines.py's `_decorate`."""
    approved = await _approved_rows(session, scope)
    return round(sum(float(r.gst) for r in approved), 2)


@router.get("/totals", response_model=ClientExpenseTotals)
async def expense_totals(session: SessionDep, scope: BookScopeDep) -> ClientExpenseTotals:
    stmt = _scope_stmt(select(ClientExpense).where(ClientExpense.tenant_id == scope.tenant_id), scope)
    rows = (await session.scalars(stmt)).all()

    approved = [r for r in rows if r.status == "approved"]
    pending = [r for r in rows if r.status == "pending"]
    return ClientExpenseTotals(
        total=round(sum(float(r.amount) for r in rows), 2),
        approved=round(sum(float(r.amount) for r in approved), 2),
        pending=len(pending),
        pending_value=round(sum(float(r.amount) for r in pending), 2),
        categories=len({r.category for r in rows if r.status != "rejected"}),
        gst_paid=round(sum(float(r.gst) for r in approved), 2),
    )


@router.get("/by-category", response_model=list[CategoryTotal])
async def expenses_by_category(session: SessionDep, scope: BookScopeDep) -> list[CategoryTotal]:
    stmt = _scope_stmt(
        select(ClientExpense).where(
            ClientExpense.tenant_id == scope.tenant_id, ClientExpense.status != "rejected"
        ),
        scope,
    )
    rows = (await session.scalars(stmt)).all()
    totals: dict[str, float] = {}
    for row in rows:
        totals[row.category] = totals.get(row.category, 0) + float(row.amount)
    return sorted(
        (CategoryTotal(label=label, value=round(value, 2)) for label, value in totals.items()),
        key=lambda item: -item.value,
    )


@router.post("", response_model=ClientExpenseRead, status_code=status.HTTP_201_CREATED)
async def create_expense(
    payload: ClientExpenseCreate, session: SessionDep, scope: ClientScopeDep
) -> ClientExpenseRead:
    client = await ensure_client_in_tenant(session, scope.tenant_id, scope.client_id)
    row = ClientExpense(tenant_id=scope.tenant_id, client_id=scope.client_id, **payload.model_dump())
    session.add(row)
    await session.flush()
    return read(ClientExpenseRead, row, client_name=client.legal_name)


async def _get_scoped(session: SessionDep, scope: BookScopeDep, expense_id: uuid.UUID) -> ClientExpense:
    stmt = select(ClientExpense).where(ClientExpense.id == expense_id, ClientExpense.tenant_id == scope.tenant_id)
    row = await session.scalar(_scope_stmt(stmt, scope))
    return ensure_found(row, "Expense")


@router.patch("/{expense_id}", response_model=ClientExpenseRead)
async def update_expense(
    expense_id: uuid.UUID, payload: ClientExpenseUpdate, session: SessionDep, scope: BookScopeDep
) -> ClientExpenseRead:
    row = await _get_scoped(session, scope, expense_id)
    if row.status != "pending" and scope.is_portal:
        raise HTTPException(status.HTTP_409_CONFLICT, "This expense has already been reviewed.")
    apply_updates(row, payload)
    await session.flush()
    client_name = await session.scalar(select(Client.legal_name).where(Client.id == row.client_id))
    return read(ClientExpenseRead, row, client_name=client_name)


@router.post("/{expense_id}/approve", response_model=ClientExpenseRead)
async def approve_expense(
    expense_id: uuid.UUID, session: SessionDep, user: StaffUserDep, request: Request
) -> ClientExpenseRead:
    row = await session.scalar(
        select(ClientExpense).where(ClientExpense.id == expense_id, ClientExpense.tenant_id == user.tenant_id)
    )
    ensure_found(row, "Expense")
    row.status = "approved"
    await session.flush()
    await audit.record(
        session,
        tenant_id=user.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="approved",
        entity="client_expense",
        entity_id=row.id,
        summary=f"Approved {row.vendor} — {float(row.amount):,.2f}",
        ip_address=client_ip(request),
    )
    client_name = await session.scalar(select(Client.legal_name).where(Client.id == row.client_id))
    return read(ClientExpenseRead, row, client_name=client_name)


@router.post("/{expense_id}/reject", response_model=ClientExpenseRead)
async def reject_expense(
    expense_id: uuid.UUID, session: SessionDep, user: StaffUserDep, request: Request
) -> ClientExpenseRead:
    row = await session.scalar(
        select(ClientExpense).where(ClientExpense.id == expense_id, ClientExpense.tenant_id == user.tenant_id)
    )
    ensure_found(row, "Expense")
    row.status = "rejected"
    await session.flush()
    await audit.record(
        session,
        tenant_id=user.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="rejected",
        entity="client_expense",
        entity_id=row.id,
        summary=f"Rejected {row.vendor} — {float(row.amount):,.2f}",
        ip_address=client_ip(request),
    )
    client_name = await session.scalar(select(Client.legal_name).where(Client.id == row.client_id))
    return read(ClientExpenseRead, row, client_name=client_name)


@router.delete("/{expense_id}", response_model=Ok)
async def delete_expense(expense_id: uuid.UUID, session: SessionDep, scope: BookScopeDep) -> Ok:
    row = await _get_scoped(session, scope, expense_id)
    await session.delete(row)
    return Ok(message=f"Expense removed ({row.vendor})")
