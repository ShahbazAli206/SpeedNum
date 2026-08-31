"""Firm invoicing: the accounting firm's own accounts receivable — invoices it
issues its clients, with line items and partial payments.

Distinct from client_invoices.py (the client's own sales invoices to its
customers, shown on /dashboard/invoices) and from engagements.py's
EngagementLetter (a signable fee quote with no payment state). Modelled
directly on engagements.py's line-item/totals/send shape and
client_invoices.py's read-time overdue derivation. See
db/migrations/0026_invoicing_and_bills.sql.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import select

from ..deps import SessionDep, TenantUserDep, client_ip
from ..models import Client, Contact, FirmInvoice, FirmInvoiceItem, FirmInvoicePayment
from ..permissions import has_permission, invoice_owner_clause
from ..schemas import (
    FirmInvoiceCreate,
    FirmInvoiceItemInput,
    FirmInvoiceItemRead,
    FirmInvoicePaymentCreate,
    FirmInvoicePaymentRead,
    FirmInvoiceRead,
    FirmInvoiceSendRequest,
    FirmInvoiceTotals,
    FirmInvoiceUpdate,
    Ok,
)
from ..services import audit
from ..services.email import invoice_email_html, send_email, sender_name
from ..utils import apply_updates, ensure_client_in_tenant, ensure_found, now_utc, read, today_utc

router = APIRouter(prefix="/invoices", tags=["invoices"])

# A paid or void invoice is part of the financial record and locked — same
# posture as engagements.py's EDITABLE_STATES for a signed letter.
LOCKED_STATES = ("paid", "void")


def _require_manage(user) -> None:
    if not has_permission(user, "invoices.manage"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Missing permission: invoices.manage")


def _effective_status(row: FirmInvoice, today: date) -> str:
    """"sent" past its due date reads as "overdue" without a separate write
    path to keep in sync — same convention as client_invoices.py."""
    if row.status == "sent" and row.due_on < today:
        return "overdue"
    return row.status


def _totals(items: list[FirmInvoiceItem], tax_rate: float) -> tuple[float, float, float]:
    subtotal = round(sum(float(item.amount) for item in items), 2)
    tax = round(subtotal * float(tax_rate or 0) / 100, 2)
    return subtotal, tax, round(subtotal + tax, 2)


async def _replace_items(
    session: SessionDep, invoice: FirmInvoice, items: list[FirmInvoiceItemInput], tenant_id: uuid.UUID
) -> None:
    for existing in list(invoice.items):
        await session.delete(existing)
    invoice.items.clear()
    await session.flush()

    for index, item in enumerate(items):
        amount = round(float(item.quantity) * float(item.unit_price), 2)
        session.add(
            FirmInvoiceItem(
                tenant_id=tenant_id,
                invoice_id=invoice.id,
                service_id=item.service_id,
                description=item.description,
                quantity=item.quantity,
                unit_price=item.unit_price,
                amount=amount,
                position=index,
            )
        )
    await session.flush()
    await session.refresh(invoice, ["items"])

    subtotal, tax, total = _totals(list(invoice.items), float(invoice.tax_rate or 0))
    invoice.subtotal, invoice.tax_amount, invoice.total = subtotal, tax, total
    await session.flush()


def _to_read(invoice: FirmInvoice, client_name: str | None, today: date) -> FirmInvoiceRead:
    return read(
        FirmInvoiceRead,
        invoice,
        client_name=client_name or (invoice.client.legal_name if invoice.client else None),
        status=_effective_status(invoice, today),
        items=[FirmInvoiceItemRead.model_validate(item) for item in invoice.items],
        payments=[FirmInvoicePaymentRead.model_validate(payment) for payment in invoice.payments],
    )


def _base_stmt(user):
    stmt = (
        select(FirmInvoice, Client.legal_name)
        .join(Client, Client.id == FirmInvoice.client_id)
        .where(FirmInvoice.tenant_id == user.tenant_id)
    )
    scope = invoice_owner_clause(user)
    if scope is not None:
        stmt = stmt.where(scope)
    return stmt


@router.get("", response_model=list[FirmInvoiceRead])
async def list_invoices(
    session: SessionDep,
    user: TenantUserDep,
    client_id: uuid.UUID | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=200, ge=1, le=500),
) -> list[FirmInvoiceRead]:
    stmt = _base_stmt(user)
    if client_id:
        stmt = stmt.where(FirmInvoice.client_id == client_id)
    rows = (await session.execute(stmt.order_by(FirmInvoice.issued_on.desc()).limit(limit))).all()

    today = today_utc()
    items = [_to_read(row, name, today) for row, name in rows]
    if status_filter:
        wanted = {s.strip() for s in status_filter.split(",") if s.strip()}
        items = [item for item in items if item.status in wanted]
    return items


@router.get("/totals", response_model=FirmInvoiceTotals)
async def invoice_totals(session: SessionDep, user: TenantUserDep) -> FirmInvoiceTotals:
    stmt = select(FirmInvoice).where(FirmInvoice.tenant_id == user.tenant_id)
    scope = invoice_owner_clause(user)
    if scope is not None:
        stmt = stmt.join(Client, Client.id == FirmInvoice.client_id).where(scope)
    rows = (await session.scalars(stmt)).all()
    today = today_utc()

    billed = [r for r in rows if r.status != "draft"]
    paid = [r for r in billed if r.status == "paid"]
    overdue = [r for r in billed if _effective_status(r, today) == "overdue"]
    outstanding = [r for r in billed if _effective_status(r, today) == "sent"]

    return FirmInvoiceTotals(
        billed=round(sum(float(r.total) for r in billed), 2),
        collected=round(sum(float(r.amount_paid) for r in billed), 2),
        outstanding=round(sum(float(r.total) - float(r.amount_paid) for r in outstanding), 2),
        overdue=round(sum(float(r.total) - float(r.amount_paid) for r in overdue), 2),
        count=len(rows),
        overdue_count=len(overdue),
    )


@router.post("", response_model=FirmInvoiceRead, status_code=status.HTTP_201_CREATED)
async def create_invoice(
    payload: FirmInvoiceCreate, session: SessionDep, user: TenantUserDep, request: Request
) -> FirmInvoiceRead:
    _require_manage(user)
    client = await ensure_client_in_tenant(session, user.tenant_id, payload.client_id)

    recipient_email = payload.recipient_email or client.email
    recipient_name = payload.recipient_name
    if not recipient_email or not recipient_name:
        primary = await session.scalar(
            select(Contact).where(Contact.client_id == client.id, Contact.is_primary.is_(True)).limit(1)
        )
        if primary is not None:
            recipient_email = recipient_email or primary.email
            recipient_name = recipient_name or primary.full_name

    invoice = FirmInvoice(
        tenant_id=user.tenant_id,
        client_id=client.id,
        number=payload.number,
        title=payload.title,
        description=payload.description,
        issued_on=payload.issued_on or today_utc(),
        due_on=payload.due_on,
        currency=payload.currency,
        tax_rate=payload.tax_rate,
        recipient_name=recipient_name or client.legal_name,
        recipient_email=recipient_email,
        notes=payload.notes,
        created_by=user.profile.id,
        # See engagements.py::create_letter's identical comment — `items` and
        # `payments` are lazy="selectin", which piggybacks on the query that
        # loaded the parent row. A brand-new, never-queried object has none to
        # piggyback on, so seeding both as already-loaded empty lists avoids an
        # implicit lazy load (MissingGreenlet) under the async engine.
        items=[],
        payments=[],
    )
    session.add(invoice)
    await session.flush()

    if payload.items:
        await _replace_items(session, invoice, payload.items, user.tenant_id)

    await audit.record(
        session,
        tenant_id=user.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="created",
        entity="firm_invoice",
        entity_id=invoice.id,
        summary=f"Created invoice {invoice.number} for {client.legal_name}",
        ip_address=client_ip(request),
    )
    return _to_read(invoice, client.legal_name, today_utc())


async def _get_scoped(session: SessionDep, user, invoice_id: uuid.UUID) -> tuple[FirmInvoice, str | None]:
    stmt = _base_stmt(user).where(FirmInvoice.id == invoice_id)
    row = (await session.execute(stmt)).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    return row[0], row[1]


@router.get("/{invoice_id}", response_model=FirmInvoiceRead)
async def get_invoice(invoice_id: uuid.UUID, session: SessionDep, user: TenantUserDep) -> FirmInvoiceRead:
    invoice, client_name = await _get_scoped(session, user, invoice_id)
    return _to_read(invoice, client_name, today_utc())


@router.patch("/{invoice_id}", response_model=FirmInvoiceRead)
async def update_invoice(
    invoice_id: uuid.UUID, payload: FirmInvoiceUpdate, session: SessionDep, user: TenantUserDep
) -> FirmInvoiceRead:
    _require_manage(user)
    invoice, client_name = await _get_scoped(session, user, invoice_id)
    if invoice.status in LOCKED_STATES:
        raise HTTPException(status.HTTP_409_CONFLICT, f"A {invoice.status} invoice cannot be edited.")

    items = payload.items
    apply_updates(invoice, payload, allowed={
        "number", "title", "description", "issued_on", "due_on", "currency", "tax_rate",
        "recipient_name", "recipient_email", "notes",
    })
    await session.flush()

    if items is not None:
        await _replace_items(session, invoice, items, user.tenant_id)
    else:
        subtotal, tax, total = _totals(list(invoice.items), float(invoice.tax_rate or 0))
        invoice.subtotal, invoice.tax_amount, invoice.total = subtotal, tax, total
        await session.flush()

    return _to_read(invoice, client_name, today_utc())


@router.post("/{invoice_id}/send", response_model=FirmInvoiceRead)
async def send_invoice(
    invoice_id: uuid.UUID,
    payload: FirmInvoiceSendRequest,
    session: SessionDep,
    user: TenantUserDep,
    request: Request,
) -> FirmInvoiceRead:
    _require_manage(user)
    invoice, client_name = await _get_scoped(session, user, invoice_id)
    if invoice.status in LOCKED_STATES:
        raise HTTPException(status.HTTP_409_CONFLICT, f"A {invoice.status} invoice cannot be sent.")
    if not invoice.items:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Add at least one line item first.")

    if payload.recipient_email:
        invoice.recipient_email = str(payload.recipient_email)
    if payload.recipient_name:
        invoice.recipient_name = payload.recipient_name
    if not invoice.recipient_email:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "A recipient email address is required.")

    invoice.status = "sent"
    invoice.sent_at = now_utc()
    await session.flush()

    delivered = await send_email(
        to=invoice.recipient_email,
        subject=f"{user.tenant.name}: invoice {invoice.number}",
        html=invoice_email_html(
            from_name=user.tenant.name,
            recipient_name=invoice.recipient_name or (client_name or "there"),
            invoice_number=invoice.number,
            invoice_title=invoice.title,
            total=float(invoice.total),
            currency=invoice.currency,
            due_on=invoice.due_on.isoformat(),
            brand_color=user.tenant.brand_color,
            message=payload.message,
        ),
        reply_to=user.profile.email,
        from_name=sender_name(user.tenant.name, user.tenant.email_from_name),
    )

    await audit.record(
        session,
        tenant_id=user.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="sent",
        entity="firm_invoice",
        entity_id=invoice.id,
        summary=f"Sent invoice {invoice.number} to {invoice.recipient_email}",
        metadata={"email_delivered": delivered},
        ip_address=client_ip(request),
    )
    return _to_read(invoice, client_name, today_utc())


def _apply_payment_state(invoice: FirmInvoice) -> None:
    """Recompute amount_paid/status/paid_on from the current payments list.
    Called after every payment insert/delete rather than incrementing in
    place, so a deleted payment can never leave a stale total behind."""
    invoice.amount_paid = round(sum(float(p.amount) for p in invoice.payments), 2)
    if invoice.amount_paid >= float(invoice.total) and float(invoice.total) > 0:
        invoice.status = "paid"
        invoice.paid_on = max((p.paid_on for p in invoice.payments), default=today_utc())
    elif invoice.status == "paid":
        # A payment was removed and the invoice is no longer fully paid —
        # fall back to "sent" (it was necessarily sent to be paid at all).
        invoice.status = "sent"
        invoice.paid_on = None


@router.post("/{invoice_id}/payments", response_model=FirmInvoiceRead, status_code=status.HTTP_201_CREATED)
async def record_payment(
    invoice_id: uuid.UUID,
    payload: FirmInvoicePaymentCreate,
    session: SessionDep,
    user: TenantUserDep,
    request: Request,
) -> FirmInvoiceRead:
    _require_manage(user)
    invoice, client_name = await _get_scoped(session, user, invoice_id)
    if invoice.status in ("draft", "void"):
        raise HTTPException(status.HTTP_409_CONFLICT, f"A {invoice.status} invoice cannot take a payment.")

    session.add(
        FirmInvoicePayment(
            tenant_id=user.tenant_id,
            invoice_id=invoice.id,
            amount=payload.amount,
            paid_on=payload.paid_on or today_utc(),
            method=payload.method,
            notes=payload.notes,
            created_by=user.profile.id,
        )
    )
    await session.flush()
    await session.refresh(invoice, ["payments"])
    _apply_payment_state(invoice)
    await session.flush()

    await audit.record(
        session,
        tenant_id=user.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="payment_recorded",
        entity="firm_invoice",
        entity_id=invoice.id,
        summary=f"Recorded a {invoice.currency} {float(payload.amount):,.2f} payment on invoice {invoice.number}",
        ip_address=client_ip(request),
    )
    return _to_read(invoice, client_name, today_utc())


@router.delete("/{invoice_id}/payments/{payment_id}", response_model=FirmInvoiceRead)
async def delete_payment(
    invoice_id: uuid.UUID, payment_id: uuid.UUID, session: SessionDep, user: TenantUserDep
) -> FirmInvoiceRead:
    _require_manage(user)
    invoice, client_name = await _get_scoped(session, user, invoice_id)
    payment = next((p for p in invoice.payments if p.id == payment_id), None)
    ensure_found(payment, "Payment")

    await session.delete(payment)
    await session.flush()
    await session.refresh(invoice, ["payments"])
    _apply_payment_state(invoice)
    await session.flush()

    return _to_read(invoice, client_name, today_utc())


@router.post("/{invoice_id}/void", response_model=FirmInvoiceRead)
async def void_invoice(invoice_id: uuid.UUID, session: SessionDep, user: TenantUserDep) -> FirmInvoiceRead:
    _require_manage(user)
    invoice, client_name = await _get_scoped(session, user, invoice_id)
    if invoice.status == "paid":
        raise HTTPException(status.HTTP_409_CONFLICT, "A paid invoice cannot be voided.")
    invoice.status = "void"
    await session.flush()
    return _to_read(invoice, client_name, today_utc())


@router.post("/{invoice_id}/duplicate", response_model=FirmInvoiceRead, status_code=201)
async def duplicate_invoice(
    invoice_id: uuid.UUID, session: SessionDep, user: TenantUserDep
) -> FirmInvoiceRead:
    _require_manage(user)
    source, client_name = await _get_scoped(session, user, invoice_id)

    copy = FirmInvoice(
        tenant_id=user.tenant_id,
        client_id=source.client_id,
        # `number` is unique per client — appending a suffix keeps the copy
        # nameable without the caller picking a new number up front. A second
        # duplicate of the same source collides and surfaces as the standard
        # 409 from main.py's IntegrityError handler, same as any other
        # duplicate-number conflict.
        number=f"{source.number}-COPY",
        title=source.title,
        description=source.description,
        due_on=today_utc() + timedelta(days=30),
        currency=source.currency,
        tax_rate=source.tax_rate,
        recipient_name=source.recipient_name,
        recipient_email=source.recipient_email,
        notes=source.notes,
        created_by=user.profile.id,
        items=[],
        payments=[],
    )
    session.add(copy)
    await session.flush()

    await _replace_items(
        session,
        copy,
        [
            FirmInvoiceItemInput(
                service_id=item.service_id,
                description=item.description,
                quantity=float(item.quantity),
                unit_price=float(item.unit_price),
            )
            for item in source.items
        ],
        user.tenant_id,
    )
    return _to_read(copy, client_name, today_utc())


@router.delete("/{invoice_id}", response_model=Ok)
async def delete_invoice(invoice_id: uuid.UUID, session: SessionDep, user: TenantUserDep) -> Ok:
    _require_manage(user)
    invoice, _ = await _get_scoped(session, user, invoice_id)
    if invoice.status == "paid":
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Paid invoices are part of the financial record and cannot be deleted."
        )
    await session.delete(invoice)
    return Ok(message=f"Invoice {invoice.number} removed")
