"""Engagement letters: build, price, send for signature."""

from __future__ import annotations

import uuid
from datetime import timedelta

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import desc, select

from ..config import settings
from ..deps import SessionDep, TenantUserDep, client_ip
from ..models import Client, Contact, EngagementLetter, EngagementLetterItem
from ..schemas import (
    FirmSignRequest,
    LetterCreate,
    LetterItemInput,
    LetterItemRead,
    LetterRead,
    LetterSendRequest,
    LetterUpdate,
    MarkSignedRequest,
    Ok,
)
from ..services import audit
from ..services.email import letter_invite_html, send_email, sender_name
from ..utils import apply_updates, ensure_found, is_valid_signature_data_url, now_utc, read, sanitize_rich_text

router = APIRouter(prefix="/engagements", tags=["engagements"])

EDITABLE_STATES = ("draft", "sent", "viewed", "declined")

DEFAULT_BODY = """This letter confirms the terms of our engagement and the nature and scope of the
services we will provide.

We will perform the services listed below with professional care, in accordance with
the standards of the profession. Our fees are based on the scope described here;
work outside that scope will be quoted separately before it starts.

Either party may terminate this engagement with written notice. Fees for work
completed to the date of termination remain payable."""


def _share_url(token: str) -> str:
    return f"{settings.public_app_url.rstrip('/')}/engagement/{token}"


def _totals(items: list[EngagementLetterItem], tax_rate: float) -> tuple[float, float, float]:
    # tax_rate is a plain percentage (13 means 13%), matching every place that
    # displays it back ("{tax_rate}%" in the letter view, PDF, DOCX) — divide
    # by 100 here rather than expecting callers to pre-convert it to a fraction.
    subtotal = round(sum(float(item.amount) for item in items), 2)
    tax = round(subtotal * float(tax_rate or 0) / 100, 2)
    return subtotal, tax, round(subtotal + tax, 2)


async def _replace_items(
    session: SessionDep, letter: EngagementLetter, items: list[LetterItemInput], tenant_id: uuid.UUID
) -> None:
    for existing in list(letter.items):
        await session.delete(existing)
    letter.items.clear()
    await session.flush()

    for index, item in enumerate(items):
        amount = round(float(item.quantity) * float(item.unit_price), 2)
        session.add(
            EngagementLetterItem(
                tenant_id=tenant_id,
                letter_id=letter.id,
                service_id=item.service_id,
                description=item.description,
                quantity=item.quantity,
                unit_price=item.unit_price,
                amount=amount,
                position=index,
            )
        )
    await session.flush()
    await session.refresh(letter, ["items"])

    subtotal, tax, total = _totals(list(letter.items), float(letter.tax_rate or 0))
    letter.subtotal, letter.tax_amount, letter.total = subtotal, tax, total
    await session.flush()


def _to_read(letter: EngagementLetter, client_name: str | None = None) -> LetterRead:
    return read(
        LetterRead,
        letter,
        client_name=client_name or (letter.client.legal_name if letter.client else None),
        share_url=_share_url(letter.token),
        items=[LetterItemRead.model_validate(item) for item in letter.items],
    )


@router.get("", response_model=list[LetterRead])
async def list_letters(
    session: SessionDep,
    user: TenantUserDep,
    client_id: uuid.UUID | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=200, ge=1, le=500),
) -> list[LetterRead]:
    stmt = select(EngagementLetter).where(EngagementLetter.tenant_id == user.tenant_id)
    if client_id:
        stmt = stmt.where(EngagementLetter.client_id == client_id)
    if status_filter:
        stmt = stmt.where(EngagementLetter.status == status_filter)

    rows = (await session.scalars(stmt.order_by(desc(EngagementLetter.created_at)).limit(limit))).all()
    return [_to_read(row) for row in rows]


@router.post("", response_model=LetterRead, status_code=status.HTTP_201_CREATED)
async def create_letter(
    payload: LetterCreate, session: SessionDep, user: TenantUserDep, request: Request
) -> LetterRead:
    client = await session.scalar(
        select(Client).where(Client.id == payload.client_id, Client.tenant_id == user.tenant_id)
    )
    ensure_found(client, "Client")

    recipient_email = payload.recipient_email or client.email
    recipient_name = payload.recipient_name
    if not recipient_email or not recipient_name:
        primary = await session.scalar(
            select(Contact)
            .where(Contact.client_id == client.id, Contact.is_primary.is_(True))
            .limit(1)
        )
        if primary is not None:
            recipient_email = recipient_email or primary.email
            recipient_name = recipient_name or primary.full_name

    letter = EngagementLetter(
        tenant_id=user.tenant_id,
        client_id=client.id,
        title=payload.title,
        body=payload.body or DEFAULT_BODY,
        terms_html=sanitize_rich_text(payload.terms_html),
        currency=payload.currency,
        tax_rate=payload.tax_rate,
        period_start=payload.period_start,
        period_end=payload.period_end,
        recipient_name=recipient_name or client.legal_name,
        recipient_email=recipient_email,
        created_by=user.profile.id,
        expires_at=now_utc() + timedelta(days=60),
        # `items` is lazy="selectin", which piggybacks on the query that loaded
        # the parent row — a brand-new, never-queried object has no such query
        # to piggyback on, so touching `.items` anywhere below (here, in
        # _replace_items, or in _to_read) would try an implicit lazy load and
        # crash with MissingGreenlet under the async engine. Seeding it as an
        # already-loaded empty list up front sidesteps that entirely.
        items=[],
    )
    session.add(letter)
    await session.flush()

    if payload.items:
        await _replace_items(session, letter, payload.items, user.tenant_id)

    await audit.record(
        session,
        tenant_id=user.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="created",
        entity="engagement_letter",
        entity_id=letter.id,
        summary=f"Drafted engagement letter for {client.legal_name}",
        ip_address=client_ip(request),
    )
    return _to_read(letter, client.legal_name)


@router.get("/{letter_id}", response_model=LetterRead)
async def get_letter(letter_id: uuid.UUID, session: SessionDep, user: TenantUserDep) -> LetterRead:
    letter = await session.scalar(
        select(EngagementLetter).where(
            EngagementLetter.id == letter_id, EngagementLetter.tenant_id == user.tenant_id
        )
    )
    ensure_found(letter, "Engagement letter")
    return _to_read(letter)


@router.patch("/{letter_id}", response_model=LetterRead)
async def update_letter(
    letter_id: uuid.UUID, payload: LetterUpdate, session: SessionDep, user: TenantUserDep
) -> LetterRead:
    letter = await session.scalar(
        select(EngagementLetter).where(
            EngagementLetter.id == letter_id, EngagementLetter.tenant_id == user.tenant_id
        )
    )
    ensure_found(letter, "Engagement letter")
    if letter.status not in EDITABLE_STATES:
        raise HTTPException(status.HTTP_409_CONFLICT, f"A {letter.status} letter cannot be edited.")

    items = payload.items
    if "terms_html" in payload.model_fields_set:
        # Only touch it when the caller actually sent it — assigning
        # unconditionally would mark it "set" even when absent from the
        # request, and apply_updates (exclude_unset=True) would then wipe an
        # existing value with None on every unrelated PATCH.
        payload.terms_html = sanitize_rich_text(payload.terms_html)
    apply_updates(letter, payload, allowed={
        "title", "body", "terms_html", "currency", "tax_rate", "period_start", "period_end",
        "recipient_name", "recipient_email",
    })
    await session.flush()

    if items is not None:
        await _replace_items(session, letter, items, user.tenant_id)
    else:
        subtotal, tax, total = _totals(list(letter.items), float(letter.tax_rate or 0))
        letter.subtotal, letter.tax_amount, letter.total = subtotal, tax, total
        await session.flush()

    return _to_read(letter)


@router.post("/{letter_id}/send", response_model=LetterRead)
async def send_letter(
    letter_id: uuid.UUID,
    payload: LetterSendRequest,
    session: SessionDep,
    user: TenantUserDep,
    request: Request,
) -> LetterRead:
    letter = await session.scalar(
        select(EngagementLetter).where(
            EngagementLetter.id == letter_id, EngagementLetter.tenant_id == user.tenant_id
        )
    )
    ensure_found(letter, "Engagement letter")
    if letter.status == "signed":
        raise HTTPException(status.HTTP_409_CONFLICT, "This letter has already been signed.")
    if not letter.items:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Add at least one service line first.")

    if payload.recipient_email:
        letter.recipient_email = str(payload.recipient_email)
    if payload.recipient_name:
        letter.recipient_name = payload.recipient_name
    if not letter.recipient_email:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "A recipient email address is required.")

    letter.status = "sent"
    letter.sent_at = now_utc()
    letter.declined_at = None
    letter.decline_reason = None
    if letter.expires_at is None or letter.expires_at < now_utc():
        letter.expires_at = now_utc() + timedelta(days=60)
    await session.flush()

    client = await session.get(Client, letter.client_id)
    delivered = await send_email(
        to=letter.recipient_email,
        subject=f"{user.tenant.name}: {letter.title} for signature",
        html=letter_invite_html(
            firm_name=user.tenant.name,
            client_name=letter.recipient_name or (client.legal_name if client else "there"),
            letter_title=letter.title,
            total=float(letter.total),
            currency=letter.currency,
            url=_share_url(letter.token),
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
        entity="engagement_letter",
        entity_id=letter.id,
        summary=f"Sent {letter.title} to {letter.recipient_email}",
        metadata={"email_delivered": delivered},
        ip_address=client_ip(request),
    )
    return _to_read(letter, client.legal_name if client else None)


@router.post("/{letter_id}/sign", response_model=LetterRead)
async def firm_sign_letter(
    letter_id: uuid.UUID,
    payload: FirmSignRequest,
    session: SessionDep,
    user: TenantUserDep,
    request: Request,
) -> LetterRead:
    """The firm signs its own copy — separate from the client's signature captured
    on the public portal (`POST /portal/{token}/sign`)."""
    letter = await session.scalar(
        select(EngagementLetter).where(
            EngagementLetter.id == letter_id, EngagementLetter.tenant_id == user.tenant_id
        )
    )
    ensure_found(letter, "Engagement letter")
    if not is_valid_signature_data_url(payload.signature_data):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "The signature image is not valid.")

    letter.firm_signer_name = payload.signer_name.strip()
    letter.firm_signer_title = payload.signer_title
    letter.firm_signature_data = payload.signature_data
    letter.firm_signed_at = now_utc()
    await session.flush()

    await audit.record(
        session,
        tenant_id=user.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="firm_signed",
        entity="engagement_letter",
        entity_id=letter.id,
        summary=f"{payload.signer_name} signed {letter.title} on behalf of the firm",
        ip_address=client_ip(request),
    )
    return _to_read(letter)


@router.post("/{letter_id}/mark-signed", response_model=LetterRead)
async def mark_letter_signed(
    letter_id: uuid.UUID,
    payload: MarkSignedRequest,
    session: SessionDep,
    user: TenantUserDep,
    request: Request,
) -> LetterRead:
    """Manual override for a signature captured out of band (paper, email) —
    records the letter as signed without a signature image."""
    letter = await session.scalar(
        select(EngagementLetter).where(
            EngagementLetter.id == letter_id, EngagementLetter.tenant_id == user.tenant_id
        )
    )
    ensure_found(letter, "Engagement letter")
    if letter.status == "signed":
        raise HTTPException(status.HTTP_409_CONFLICT, "This letter has already been signed.")

    letter.status = "signed"
    letter.signed_at = now_utc()
    letter.signer_name = payload.signer_name or letter.recipient_name
    letter.signer_title = payload.signer_title
    letter.declined_at = None
    letter.decline_reason = None
    await session.flush()

    await audit.record(
        session,
        tenant_id=user.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="marked_signed",
        entity="engagement_letter",
        entity_id=letter.id,
        summary=f"Marked {letter.title} as signed manually",
        ip_address=client_ip(request),
    )
    return _to_read(letter)


@router.post("/{letter_id}/void", response_model=LetterRead)
async def void_letter(letter_id: uuid.UUID, session: SessionDep, user: TenantUserDep) -> LetterRead:
    letter = await session.scalar(
        select(EngagementLetter).where(
            EngagementLetter.id == letter_id, EngagementLetter.tenant_id == user.tenant_id
        )
    )
    ensure_found(letter, "Engagement letter")
    if letter.status == "signed":
        raise HTTPException(status.HTTP_409_CONFLICT, "A signed letter cannot be voided.")
    letter.status = "void"
    await session.flush()
    return _to_read(letter)


@router.post("/{letter_id}/duplicate", response_model=LetterRead, status_code=201)
async def duplicate_letter(
    letter_id: uuid.UUID, session: SessionDep, user: TenantUserDep
) -> LetterRead:
    source = await session.scalar(
        select(EngagementLetter).where(
            EngagementLetter.id == letter_id, EngagementLetter.tenant_id == user.tenant_id
        )
    )
    ensure_found(source, "Engagement letter")

    copy = EngagementLetter(
        tenant_id=user.tenant_id,
        client_id=source.client_id,
        title=source.title,
        body=source.body,
        currency=source.currency,
        tax_rate=source.tax_rate,
        period_start=source.period_start,
        period_end=source.period_end,
        recipient_name=source.recipient_name,
        recipient_email=source.recipient_email,
        created_by=user.profile.id,
        expires_at=now_utc() + timedelta(days=60),
        # See the identical comment in create_letter — a brand-new object has
        # no originating query for `items`'s lazy="selectin" to piggyback on.
        items=[],
    )
    session.add(copy)
    await session.flush()

    await _replace_items(
        session,
        copy,
        [
            LetterItemInput(
                service_id=item.service_id,
                description=item.description,
                quantity=float(item.quantity),
                unit_price=float(item.unit_price),
            )
            for item in source.items
        ],
        user.tenant_id,
    )
    return _to_read(copy)


@router.delete("/{letter_id}", response_model=Ok)
async def delete_letter(letter_id: uuid.UUID, session: SessionDep, user: TenantUserDep) -> Ok:
    letter = await session.scalar(
        select(EngagementLetter).where(
            EngagementLetter.id == letter_id, EngagementLetter.tenant_id == user.tenant_id
        )
    )
    ensure_found(letter, "Engagement letter")
    if letter.status == "signed":
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Signed letters are part of the audit trail and cannot be deleted."
        )
    await session.delete(letter)
    return Ok(message="Letter deleted")
