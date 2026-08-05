"""Client-portal book: sales invoices the client issued to its own customers.

Distinct from `engagement_letters` (the firm billing the client) — this is the
client's own accounts-receivable ledger, shown on /dashboard/invoices. See
db/migrations/0004_client_books.sql and app/deps.py::BookScope.
"""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Query, status
from sqlalchemy import select

from ..deps import BookScopeDep, ClientScopeDep, SessionDep
from ..models import Client, ClientInvoice
from ..schemas import ClientInvoiceCreate, ClientInvoiceRead, ClientInvoiceTotals, ClientInvoiceUpdate, Ok
from ..utils import apply_updates, ensure_client_in_tenant, ensure_found, read, today_utc

router = APIRouter(prefix="/client-portal/invoices", tags=["client-portal"])


def _effective_status(row: ClientInvoice, today: date) -> str:
    """"sent" past its due date reads as "overdue" without a separate write path
    to keep in sync — the same read-time-derived approach as Deadline.urgency."""
    if row.status == "sent" and row.due_on < today:
        return "overdue"
    return row.status


def _amount(row: ClientInvoice) -> float:
    return float(row.amount) + float(row.tax)


def _serialise(row: ClientInvoice, client_name: str | None, today: date) -> ClientInvoiceRead:
    return read(ClientInvoiceRead, row, client_name=client_name, status=_effective_status(row, today))


def _scope_stmt(stmt, scope: BookScopeDep):
    return stmt.where(ClientInvoice.client_id == scope.client_id) if scope.client_id else stmt


@router.get("", response_model=list[ClientInvoiceRead])
async def list_invoices(
    session: SessionDep,
    scope: BookScopeDep,
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=200, ge=1, le=500),
) -> list[ClientInvoiceRead]:
    stmt = (
        select(ClientInvoice, Client.legal_name)
        .join(Client, Client.id == ClientInvoice.client_id)
        .where(ClientInvoice.tenant_id == scope.tenant_id)
    )
    rows = (await session.execute(_scope_stmt(stmt, scope).order_by(ClientInvoice.issued_on.desc()).limit(limit))).all()

    today = today_utc()
    items = [_serialise(row, name, today) for row, name in rows]
    if status_filter:
        wanted = {s.strip() for s in status_filter.split(",") if s.strip()}
        items = [item for item in items if item.status in wanted]
    return items


@router.get("/totals", response_model=ClientInvoiceTotals)
async def invoice_totals(session: SessionDep, scope: BookScopeDep) -> ClientInvoiceTotals:
    stmt = _scope_stmt(select(ClientInvoice).where(ClientInvoice.tenant_id == scope.tenant_id), scope)
    rows = (await session.scalars(stmt)).all()
    today = today_utc()

    billed = [r for r in rows if r.status != "draft"]
    paid = [r for r in billed if r.status == "paid"]
    overdue = [r for r in billed if _effective_status(r, today) == "overdue"]
    outstanding = [r for r in billed if _effective_status(r, today) == "sent"]

    return ClientInvoiceTotals(
        billed=round(sum(_amount(r) for r in billed), 2),
        collected=round(sum(_amount(r) for r in paid), 2),
        outstanding=round(sum(_amount(r) for r in outstanding), 2),
        overdue=round(sum(_amount(r) for r in overdue), 2),
        count=len(rows),
        overdue_count=len(overdue),
    )


@router.post("", response_model=ClientInvoiceRead, status_code=status.HTTP_201_CREATED)
async def create_invoice(
    payload: ClientInvoiceCreate, session: SessionDep, scope: ClientScopeDep
) -> ClientInvoiceRead:
    client = await ensure_client_in_tenant(session, scope.tenant_id, scope.client_id)
    row = ClientInvoice(tenant_id=scope.tenant_id, client_id=scope.client_id, **payload.model_dump())
    session.add(row)
    await session.flush()
    return _serialise(row, client.legal_name, today_utc())


async def _get_scoped(session: SessionDep, scope: BookScopeDep, invoice_id: uuid.UUID) -> ClientInvoice:
    stmt = select(ClientInvoice).where(ClientInvoice.id == invoice_id, ClientInvoice.tenant_id == scope.tenant_id)
    row = await session.scalar(_scope_stmt(stmt, scope))
    return ensure_found(row, "Invoice")


@router.patch("/{invoice_id}", response_model=ClientInvoiceRead)
async def update_invoice(
    invoice_id: uuid.UUID, payload: ClientInvoiceUpdate, session: SessionDep, scope: BookScopeDep
) -> ClientInvoiceRead:
    row = await _get_scoped(session, scope, invoice_id)
    apply_updates(row, payload)
    if row.status == "paid" and row.paid_on is None:
        row.paid_on = today_utc()
    elif row.status != "paid":
        row.paid_on = None
    await session.flush()
    client_name = await session.scalar(select(Client.legal_name).where(Client.id == row.client_id))
    return _serialise(row, client_name, today_utc())


@router.delete("/{invoice_id}", response_model=Ok)
async def delete_invoice(invoice_id: uuid.UUID, session: SessionDep, scope: BookScopeDep) -> Ok:
    row = await _get_scoped(session, scope, invoice_id)
    await session.delete(row)
    return Ok(message=f"Invoice {row.number} removed")
