"""Platform invoicing: invoice *documents* the provider sends tenant firms —
superadmin-only, layered on top of platform_finance.py's platform_income
ledger (money received). Recording a payment against one of these invoices
writes a platform_income row carrying invoice_id, so the existing profit
summary is unchanged and the same row surfaces on the firm's own /bills page
as a paid subscription bill (see firm_bills.py).

Mirrors platform_finance.py's shape (SuperadminDep on every handler, local
Pydantic models rather than growing the already-large schemas.py) and
firm_invoices.py's line-item/totals/send mechanics. See
db/migrations/0026_invoicing_and_bills.sql.
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select

from ..deps import SessionDep, SuperadminDep
from ..models import PlatformIncome, PlatformInvoice, PlatformInvoiceItem, Profile, Tenant
from ..schemas import Ok
from ..services import audit
from ..services.email import invoice_email_html, send_email
from ..utils import ensure_found, read, today_utc

router = APIRouter(prefix="/admin/finance/invoices", tags=["admin"])

LOCKED_STATES = ("paid", "void")


# --- schemas -------------------------------------------------------------------
class InvoiceItemInput(BaseModel):
    description: str = Field(min_length=1, max_length=300)
    quantity: float = 1
    unit_price: float = 0


class InvoiceItemRead(BaseModel):
    id: uuid.UUID
    description: str
    quantity: float
    unit_price: float
    amount: float
    position: int

    model_config = {"from_attributes": True}


class InvoiceCreate(BaseModel):
    tenant_id: uuid.UUID
    number: str = Field(min_length=1, max_length=40)
    title: str = "Invoice"
    issued_on: date | None = None
    due_on: date
    currency: str = Field(default="USD", min_length=3, max_length=3)
    tax_rate: float = 0
    notes: str | None = None
    items: list[InvoiceItemInput] = Field(default_factory=list)


class InvoiceUpdate(BaseModel):
    number: str | None = None
    title: str | None = None
    issued_on: date | None = None
    due_on: date | None = None
    currency: str | None = None
    tax_rate: float | None = None
    notes: str | None = None
    items: list[InvoiceItemInput] | None = None


class InvoiceSendRequest(BaseModel):
    recipient_email: EmailStr | None = None
    message: str | None = None


class PaymentCreate(BaseModel):
    amount: Decimal = Field(gt=0)
    received_date: date | None = None
    method: str = "manual"
    notes: str | None = None


class InvoiceRead(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID | None
    tenant_name: str | None = None
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
    status: Literal["draft", "sent", "paid", "overdue", "void"]
    paid_on: date | None = None
    notes: str | None = None
    created_at: object | None = None
    items: list[InvoiceItemRead] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class InvoiceTotals(BaseModel):
    billed: float = 0
    collected: float = 0
    outstanding: float = 0
    overdue: float = 0
    count: int = 0
    overdue_count: int = 0


# --- helpers -------------------------------------------------------------------
def _effective_status(row: PlatformInvoice, today: date) -> str:
    if row.status == "sent" and row.due_on < today:
        return "overdue"
    return row.status


def _totals(items: list[PlatformInvoiceItem], tax_rate: float) -> tuple[float, float, float]:
    subtotal = round(sum(float(item.amount) for item in items), 2)
    tax = round(subtotal * float(tax_rate or 0) / 100, 2)
    return subtotal, tax, round(subtotal + tax, 2)


async def _replace_items(session: SessionDep, invoice: PlatformInvoice, items: list[InvoiceItemInput]) -> None:
    for existing in list(invoice.items):
        await session.delete(existing)
    invoice.items.clear()
    await session.flush()

    for index, item in enumerate(items):
        amount = round(item.quantity * item.unit_price, 2)
        session.add(
            PlatformInvoiceItem(
                invoice_id=invoice.id,
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


def _to_read(invoice: PlatformInvoice, tenant_name: str | None, today: date) -> InvoiceRead:
    return read(
        InvoiceRead,
        invoice,
        tenant_name=tenant_name,
        status=_effective_status(invoice, today),
        items=[InvoiceItemRead.model_validate(item) for item in invoice.items],
    )


async def _recipient_email(session: SessionDep, tenant: Tenant) -> str | None:
    """The company email on file, or — many firms never set Tenant.email —
    the Owner's own login, since that account is guaranteed to exist."""
    if tenant.email:
        return tenant.email
    owner_email = await session.scalar(
        select(Profile.email).where(Profile.tenant_id == tenant.id, Profile.role == "owner").limit(1)
    )
    return owner_email


# --- routes ----------------------------------------------------------------------
@router.get("", response_model=list[InvoiceRead])
async def list_invoices(
    session: SessionDep,
    user: SuperadminDep,
    tenant_id: uuid.UUID | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=200, ge=1, le=500),
) -> list[InvoiceRead]:
    stmt = select(PlatformInvoice, Tenant.name).outerjoin(Tenant, Tenant.id == PlatformInvoice.tenant_id)
    if tenant_id:
        stmt = stmt.where(PlatformInvoice.tenant_id == tenant_id)
    rows = (await session.execute(stmt.order_by(PlatformInvoice.issued_on.desc()).limit(limit))).all()

    today = today_utc()
    items = [_to_read(invoice, name, today) for invoice, name in rows]
    if status_filter:
        wanted = {s.strip() for s in status_filter.split(",") if s.strip()}
        items = [item for item in items if item.status in wanted]
    return items


@router.get("/totals", response_model=InvoiceTotals)
async def invoice_totals(session: SessionDep, user: SuperadminDep) -> InvoiceTotals:
    rows = (await session.scalars(select(PlatformInvoice))).all()
    today = today_utc()

    billed = [r for r in rows if r.status != "draft"]
    overdue = [r for r in billed if _effective_status(r, today) == "overdue"]
    outstanding = [r for r in billed if _effective_status(r, today) == "sent"]

    return InvoiceTotals(
        billed=round(sum(float(r.total) for r in billed), 2),
        collected=round(sum(float(r.amount_paid) for r in billed), 2),
        outstanding=round(sum(float(r.total) - float(r.amount_paid) for r in outstanding), 2),
        overdue=round(sum(float(r.total) - float(r.amount_paid) for r in overdue), 2),
        count=len(rows),
        overdue_count=len(overdue),
    )


@router.post("", response_model=InvoiceRead, status_code=status.HTTP_201_CREATED)
async def create_invoice(payload: InvoiceCreate, session: SessionDep, user: SuperadminDep) -> InvoiceRead:
    tenant = await session.get(Tenant, payload.tenant_id)
    ensure_found(tenant, "Tenant")

    invoice = PlatformInvoice(
        tenant_id=tenant.id,
        number=payload.number,
        title=payload.title,
        issued_on=payload.issued_on or today_utc(),
        due_on=payload.due_on,
        currency=payload.currency.upper(),
        tax_rate=payload.tax_rate,
        notes=payload.notes,
        created_by=user.profile.id,
        # See engagements.py::create_letter — items is lazy="selectin", which
        # piggybacks on the query that loaded the parent; a brand-new object
        # has none, so seed it as already-loaded to avoid an implicit lazy
        # load (MissingGreenlet) under the async engine.
        items=[],
    )
    session.add(invoice)
    await session.flush()

    if payload.items:
        await _replace_items(session, invoice, payload.items)

    await audit.record(
        session,
        tenant_id=None,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="created",
        entity="platform_invoice",
        entity_id=invoice.id,
        summary=f"Created platform invoice {invoice.number} for {tenant.name}",
    )
    return _to_read(invoice, tenant.name, today_utc())


async def _get(session: SessionDep, invoice_id: uuid.UUID) -> tuple[PlatformInvoice, str | None]:
    row = (
        await session.execute(
            select(PlatformInvoice, Tenant.name)
            .outerjoin(Tenant, Tenant.id == PlatformInvoice.tenant_id)
            .where(PlatformInvoice.id == invoice_id)
        )
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    return row[0], row[1]


@router.get("/{invoice_id}", response_model=InvoiceRead)
async def get_invoice(invoice_id: uuid.UUID, session: SessionDep, user: SuperadminDep) -> InvoiceRead:
    invoice, tenant_name = await _get(session, invoice_id)
    return _to_read(invoice, tenant_name, today_utc())


@router.patch("/{invoice_id}", response_model=InvoiceRead)
async def update_invoice(
    invoice_id: uuid.UUID, payload: InvoiceUpdate, session: SessionDep, user: SuperadminDep
) -> InvoiceRead:
    invoice, tenant_name = await _get(session, invoice_id)
    if invoice.status in LOCKED_STATES:
        raise HTTPException(status.HTTP_409_CONFLICT, f"A {invoice.status} invoice cannot be edited.")

    items = payload.items
    for key, value in payload.model_dump(exclude_unset=True, exclude={"items"}).items():
        if key == "currency" and value:
            value = value.upper()
        setattr(invoice, key, value)
    await session.flush()

    if items is not None:
        await _replace_items(session, invoice, items)
    else:
        subtotal, tax, total = _totals(list(invoice.items), float(invoice.tax_rate or 0))
        invoice.subtotal, invoice.tax_amount, invoice.total = subtotal, tax, total
        await session.flush()

    return _to_read(invoice, tenant_name, today_utc())


@router.post("/{invoice_id}/send", response_model=InvoiceRead)
async def send_invoice(
    invoice_id: uuid.UUID, payload: InvoiceSendRequest, session: SessionDep, user: SuperadminDep
) -> InvoiceRead:
    invoice, tenant_name = await _get(session, invoice_id)
    if invoice.status in LOCKED_STATES:
        raise HTTPException(status.HTTP_409_CONFLICT, f"A {invoice.status} invoice cannot be sent.")
    if not invoice.items:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Add at least one line item first.")
    if invoice.tenant_id is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This invoice's tenant no longer exists.")

    tenant = await session.get(Tenant, invoice.tenant_id)
    ensure_found(tenant, "Tenant")
    recipient = str(payload.recipient_email) if payload.recipient_email else await _recipient_email(session, tenant)
    if not recipient:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "This company has no email on file — pass recipient_email."
        )

    invoice.status = "sent"
    await session.flush()

    delivered = await send_email(
        to=recipient,
        subject=f"SpeedNum: invoice {invoice.number}",
        html=invoice_email_html(
            from_name="SpeedNum",
            recipient_name=tenant.name,
            invoice_number=invoice.number,
            invoice_title=invoice.title,
            total=float(invoice.total),
            currency=invoice.currency,
            due_on=invoice.due_on.isoformat(),
            message=payload.message,
        ),
    )

    await audit.record(
        session,
        tenant_id=None,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="sent",
        entity="platform_invoice",
        entity_id=invoice.id,
        summary=f"Sent invoice {invoice.number} to {tenant.name} ({recipient})",
        metadata={"email_delivered": delivered},
    )
    return _to_read(invoice, tenant_name, today_utc())


@router.post("/{invoice_id}/record-payment", response_model=InvoiceRead)
async def record_payment(
    invoice_id: uuid.UUID, payload: PaymentCreate, session: SessionDep, user: SuperadminDep
) -> InvoiceRead:
    invoice, tenant_name = await _get(session, invoice_id)
    if invoice.status in ("draft", "void"):
        raise HTTPException(status.HTTP_409_CONFLICT, f"A {invoice.status} invoice cannot take a payment.")

    received_date = payload.received_date or today_utc()
    session.add(
        PlatformIncome(
            tenant_id=invoice.tenant_id,
            amount=payload.amount,
            currency=invoice.currency,
            received_date=received_date,
            method=payload.method,
            notes=payload.notes or f"Payment on invoice {invoice.number}",
            invoice_id=invoice.id,
            created_by=user.profile.id,
        )
    )
    await session.flush()

    amount_paid = (
        await session.scalars(select(PlatformIncome.amount).where(PlatformIncome.invoice_id == invoice.id))
    ).all()
    invoice.amount_paid = round(sum(float(a) for a in amount_paid), 2)
    if invoice.amount_paid >= float(invoice.total) and float(invoice.total) > 0:
        invoice.status = "paid"
        invoice.paid_on = received_date
    await session.flush()

    await audit.record(
        session,
        tenant_id=invoice.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="payment_recorded",
        entity="platform_invoice",
        entity_id=invoice.id,
        summary=f"Recorded a {invoice.currency} {float(payload.amount):,.2f} payment on invoice {invoice.number}",
    )
    return _to_read(invoice, tenant_name, today_utc())


@router.post("/{invoice_id}/void", response_model=InvoiceRead)
async def void_invoice(invoice_id: uuid.UUID, session: SessionDep, user: SuperadminDep) -> InvoiceRead:
    invoice, tenant_name = await _get(session, invoice_id)
    if invoice.status == "paid":
        raise HTTPException(status.HTTP_409_CONFLICT, "A paid invoice cannot be voided.")
    invoice.status = "void"
    await session.flush()
    return _to_read(invoice, tenant_name, today_utc())


@router.delete("/{invoice_id}", response_model=Ok)
async def delete_invoice(invoice_id: uuid.UUID, session: SessionDep, user: SuperadminDep) -> Ok:
    invoice, _ = await _get(session, invoice_id)
    if invoice.status == "paid":
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Paid invoices are part of the financial record and cannot be deleted."
        )
    await session.delete(invoice)
    return Ok(message=f"Invoice {invoice.number} removed")
