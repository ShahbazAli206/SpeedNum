"""Client-portal read-only view of the firm's invoices to this client — the
read counterpart of firm_invoices.py's write-side router, shown on
/dashboard/accountant-invoices.

Distinct from client_invoices.py (prefix /client-portal/invoices — the
client's OWN sales invoices to ITS customers). No write endpoints here: there
is no payment processor wired up, so a portal account cannot "pay" an
invoice — it can only see what its accountant issued and download the PDF (a
client-side concern, not this API). See db/migrations/0026.
"""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from ..deps import BookScopeDep, SessionDep
from ..models import Client, FirmInvoice
from ..schemas import FirmInvoiceItemRead, FirmInvoicePaymentRead, FirmInvoiceRead, FirmInvoiceTotals
from ..utils import read, today_utc

router = APIRouter(prefix="/client-portal/firm-invoices", tags=["client-portal"])


def _effective_status(row: FirmInvoice, today: date) -> str:
    if row.status == "sent" and row.due_on < today:
        return "overdue"
    return row.status


def _serialise(row: FirmInvoice, client_name: str | None, today: date) -> FirmInvoiceRead:
    return read(
        FirmInvoiceRead,
        row,
        client_name=client_name,
        status=_effective_status(row, today),
        items=[FirmInvoiceItemRead.model_validate(item) for item in row.items],
        payments=[FirmInvoicePaymentRead.model_validate(payment) for payment in row.payments],
    )


def _scope_stmt(stmt, scope: BookScopeDep):
    return stmt.where(FirmInvoice.client_id == scope.client_id) if scope.client_id else stmt


def _visible_stmt(scope: BookScopeDep):
    # "draft" is a work in progress the firm hasn't sent yet — invisible to
    # the client, same convention as engagements.py's letters not appearing
    # on the portal until sent.
    return select(FirmInvoice, Client.legal_name).join(Client, Client.id == FirmInvoice.client_id).where(
        FirmInvoice.tenant_id == scope.tenant_id, FirmInvoice.status != "draft"
    )


@router.get("", response_model=list[FirmInvoiceRead])
async def list_firm_invoices(
    session: SessionDep, scope: BookScopeDep, limit: int = Query(default=200, ge=1, le=500)
) -> list[FirmInvoiceRead]:
    stmt = _scope_stmt(_visible_stmt(scope), scope)
    rows = (await session.execute(stmt.order_by(FirmInvoice.issued_on.desc()).limit(limit))).all()
    today = today_utc()
    return [_serialise(row, name, today) for row, name in rows]


@router.get("/totals", response_model=FirmInvoiceTotals)
async def firm_invoice_totals(session: SessionDep, scope: BookScopeDep) -> FirmInvoiceTotals:
    stmt = _scope_stmt(
        select(FirmInvoice).where(FirmInvoice.tenant_id == scope.tenant_id, FirmInvoice.status != "draft"), scope
    )
    rows = (await session.scalars(stmt)).all()
    today = today_utc()

    overdue = [r for r in rows if _effective_status(r, today) == "overdue"]
    outstanding = [r for r in rows if _effective_status(r, today) == "sent"]

    return FirmInvoiceTotals(
        billed=round(sum(float(r.total) for r in rows), 2),
        collected=round(sum(float(r.amount_paid) for r in rows), 2),
        outstanding=round(sum(float(r.total) - float(r.amount_paid) for r in outstanding), 2),
        overdue=round(sum(float(r.total) - float(r.amount_paid) for r in overdue), 2),
        count=len(rows),
        overdue_count=len(overdue),
    )


@router.get("/{invoice_id}", response_model=FirmInvoiceRead)
async def get_firm_invoice(
    invoice_id: uuid.UUID, session: SessionDep, scope: BookScopeDep
) -> FirmInvoiceRead:
    stmt = _scope_stmt(_visible_stmt(scope), scope).where(FirmInvoice.id == invoice_id)
    row = (await session.execute(stmt)).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    invoice, client_name = row
    return _serialise(invoice, client_name, today_utc())
