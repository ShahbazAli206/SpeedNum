"""Client-portal book: tax obligations owed to a revenue authority.

Distinct from `public.deadlines` — a deadline is the firm's internal filing
work item (who prepares it, is the paperwork done); this is the client-visible
money owed for the same period. Optionally linked via `deadline_id`. Shown on
/dashboard/taxes.
"""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Request, status
from sqlalchemy import select

from ..deps import BookScopeDep, ClientScopeDep, SessionDep, StaffUserDep, client_ip
from ..models import Client, ClientTaxObligation
from ..schemas import (
    ClientTaxObligationCreate,
    ClientTaxObligationRead,
    ClientTaxObligationUpdate,
    Ok,
    TaxTotals,
)
from ..services import audit
from ..utils import apply_updates, ensure_client_in_tenant, ensure_found, now_utc, read, today_utc
from .client_expenses import gst_paid

router = APIRouter(prefix="/client-portal/taxes", tags=["client-portal"])


def _effective_status(row: ClientTaxObligation, today: date) -> str:
    if row.status == "filed":
        return "filed"
    return "overdue" if row.due_on < today else "open"


def _serialise(row: ClientTaxObligation, client_name: str | None, today: date) -> ClientTaxObligationRead:
    return read(
        ClientTaxObligationRead,
        row,
        client_name=client_name,
        status=_effective_status(row, today),
        days_remaining=(row.due_on - today).days,
    )


def _scope_stmt(stmt, scope: BookScopeDep):
    return stmt.where(ClientTaxObligation.client_id == scope.client_id) if scope.client_id else stmt


@router.get("", response_model=list[ClientTaxObligationRead])
async def list_taxes(session: SessionDep, scope: BookScopeDep) -> list[ClientTaxObligationRead]:
    stmt = (
        select(ClientTaxObligation, Client.legal_name)
        .join(Client, Client.id == ClientTaxObligation.client_id)
        .where(ClientTaxObligation.tenant_id == scope.tenant_id)
    )
    rows = (await session.execute(_scope_stmt(stmt, scope).order_by(ClientTaxObligation.due_on))).all()
    today = today_utc()
    return [_serialise(row, name, today) for row, name in rows]


@router.get("/totals", response_model=TaxTotals)
async def tax_totals(session: SessionDep, scope: BookScopeDep) -> TaxTotals:
    stmt = _scope_stmt(select(ClientTaxObligation).where(ClientTaxObligation.tenant_id == scope.tenant_id), scope)
    rows = (await session.scalars(stmt)).all()
    today = today_utc()

    open_rows = [r for r in rows if r.status != "filed"]
    gst_owing = sum(float(r.amount) for r in open_rows if "GST" in r.name.upper() or "HST" in r.name.upper())
    corporate = sum(
        float(r.amount) for r in open_rows if "CORPORATE" in r.name.upper() or "T2" in r.name.upper()
    )
    next_due = min(open_rows, key=lambda r: r.due_on) if open_rows else None

    return TaxTotals(
        gst_owing=round(gst_owing, 2),
        corporate_estimate=round(corporate, 2),
        input_tax_credits=await gst_paid(session, scope),
        total_owing=round(sum(float(r.amount) for r in open_rows), 2),
        next=_serialise(next_due, None, today) if next_due else None,
    )


@router.post("", response_model=ClientTaxObligationRead, status_code=status.HTTP_201_CREATED)
async def create_tax(
    payload: ClientTaxObligationCreate, session: SessionDep, scope: ClientScopeDep
) -> ClientTaxObligationRead:
    client = await ensure_client_in_tenant(session, scope.tenant_id, scope.client_id)
    row = ClientTaxObligation(tenant_id=scope.tenant_id, client_id=scope.client_id, **payload.model_dump())
    session.add(row)
    await session.flush()
    return _serialise(row, client.legal_name, today_utc())


async def _get_scoped(session: SessionDep, scope: BookScopeDep, tax_id: uuid.UUID) -> ClientTaxObligation:
    stmt = select(ClientTaxObligation).where(
        ClientTaxObligation.id == tax_id, ClientTaxObligation.tenant_id == scope.tenant_id
    )
    row = await session.scalar(_scope_stmt(stmt, scope))
    return ensure_found(row, "Tax obligation")


@router.patch("/{tax_id}", response_model=ClientTaxObligationRead)
async def update_tax(
    tax_id: uuid.UUID, payload: ClientTaxObligationUpdate, session: SessionDep, scope: BookScopeDep
) -> ClientTaxObligationRead:
    row = await _get_scoped(session, scope, tax_id)
    apply_updates(row, payload)
    await session.flush()
    client_name = await session.scalar(select(Client.legal_name).where(Client.id == row.client_id))
    return _serialise(row, client_name, today_utc())


@router.post("/{tax_id}/file", response_model=ClientTaxObligationRead)
async def mark_filed(
    tax_id: uuid.UUID, session: SessionDep, user: StaffUserDep, request: Request
) -> ClientTaxObligationRead:
    row = await session.scalar(
        select(ClientTaxObligation).where(
            ClientTaxObligation.id == tax_id, ClientTaxObligation.tenant_id == user.tenant_id
        )
    )
    ensure_found(row, "Tax obligation")
    row.status = "filed"
    row.filed_at = now_utc()
    await session.flush()
    await audit.record(
        session,
        tenant_id=user.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="filed",
        entity="client_tax_obligation",
        entity_id=row.id,
        summary=f"Filed {row.name} ({row.period_label or row.due_on.isoformat()})",
        ip_address=client_ip(request),
    )
    client_name = await session.scalar(select(Client.legal_name).where(Client.id == row.client_id))
    return _serialise(row, client_name, today_utc())


@router.delete("/{tax_id}", response_model=Ok)
async def delete_tax(tax_id: uuid.UUID, session: SessionDep, scope: BookScopeDep) -> Ok:
    row = await _get_scoped(session, scope, tax_id)
    await session.delete(row)
    return Ok(message=f"{row.name} removed")
