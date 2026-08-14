"""Public client portal — no login, access is by unguessable letter token."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from ..deps import SessionDep, client_ip
from ..models import Client, EngagementLetter, Tenant
from ..schemas import (
    LetterItemRead,
    PortalBrand,
    PortalDeclineRequest,
    PortalLetter,
    PortalSignRequest,
)
from ..services import audit
from ..utils import is_valid_signature_data_url, now_utc

router = APIRouter(prefix="/portal", tags=["portal"])

VIEWABLE = ("sent", "viewed", "signed", "declined")


async def _load(session: SessionDep, token: str) -> tuple[EngagementLetter, Client, Tenant]:
    row = (
        await session.execute(
            select(EngagementLetter, Client, Tenant)
            .join(Client, Client.id == EngagementLetter.client_id)
            .join(Tenant, Tenant.id == EngagementLetter.tenant_id)
            .where(EngagementLetter.token == token)
        )
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This link is not valid.")

    letter, client, tenant = row
    if letter.status == "draft":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This letter has not been shared yet.")
    if letter.status == "void":
        raise HTTPException(status.HTTP_410_GONE, "This letter has been withdrawn.")
    if letter.expires_at is not None and letter.expires_at < now_utc() and letter.status != "signed":
        raise HTTPException(status.HTTP_410_GONE, "This signing link has expired. Ask your accountant to resend it.")
    return letter, client, tenant


def _serialise(letter: EngagementLetter, client: Client, tenant: Tenant) -> PortalLetter:
    return PortalLetter(
        id=letter.id,
        title=letter.title,
        body=letter.body,
        terms_html=letter.terms_html,
        status=letter.status,
        currency=letter.currency,
        subtotal=float(letter.subtotal),
        tax_rate=float(letter.tax_rate),
        tax_amount=float(letter.tax_amount),
        total=float(letter.total),
        period_start=letter.period_start,
        period_end=letter.period_end,
        client_name=client.legal_name,
        recipient_name=letter.recipient_name,
        signed_at=letter.signed_at,
        signer_name=letter.signer_name,
        signer_title=letter.signer_title,
        signature_data=letter.signature_data,
        firm_signer_name=letter.firm_signer_name,
        firm_signer_title=letter.firm_signer_title,
        firm_signature_data=letter.firm_signature_data,
        firm_signed_at=letter.firm_signed_at,
        expires_at=letter.expires_at,
        items=[LetterItemRead.model_validate(item) for item in letter.items],
        brand=PortalBrand(
            firm_name=tenant.name,
            logo_url=tenant.logo_url,
            brand_color=tenant.brand_color,
            letter_footer=tenant.letter_footer,
        ),
    )


@router.get("/{token}", response_model=PortalLetter)
async def view_letter(token: str, session: SessionDep) -> PortalLetter:
    letter, client, tenant = await _load(session, token)

    if letter.status == "sent":
        letter.status = "viewed"
        letter.viewed_at = now_utc()
        await audit.record(
            session,
            tenant_id=tenant.id,
            action="viewed",
            entity="engagement_letter",
            entity_id=letter.id,
            summary=f"{client.legal_name} opened {letter.title}",
        )
        await session.flush()

    return _serialise(letter, client, tenant)


@router.post("/{token}/sign", response_model=PortalLetter)
async def sign_letter(
    token: str, payload: PortalSignRequest, session: SessionDep, request: Request
) -> PortalLetter:
    letter, client, tenant = await _load(session, token)

    if letter.status == "signed":
        raise HTTPException(status.HTTP_409_CONFLICT, "This letter has already been signed.")
    if letter.status not in ("sent", "viewed", "declined"):
        raise HTTPException(status.HTTP_409_CONFLICT, "This letter is not available for signature.")
    if not payload.agreed:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "You must agree to the terms to sign.")
    if not is_valid_signature_data_url(payload.signature_data):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "The signature image is not valid.")

    letter.status = "signed"
    letter.signed_at = now_utc()
    letter.signer_name = payload.signer_name.strip()
    letter.signer_title = payload.signer_title
    letter.signature_data = payload.signature_data
    letter.signature_ip = client_ip(request)
    letter.declined_at = None
    letter.decline_reason = None

    await audit.record(
        session,
        tenant_id=tenant.id,
        actor_email=letter.recipient_email,
        action="signed",
        entity="engagement_letter",
        entity_id=letter.id,
        summary=f"{payload.signer_name} signed {letter.title}",
        metadata={"client": client.legal_name},
        ip_address=client_ip(request),
    )
    await audit.notify(
        session,
        tenant_id=tenant.id,
        type="letter_signed",
        title=f"{client.legal_name} signed {letter.title}",
        body=f"Signed by {payload.signer_name} — {letter.currency} {float(letter.total):,.2f}.",
        link=f"/engagements/{letter.id}",
    )
    await session.flush()

    return _serialise(letter, client, tenant)


@router.post("/{token}/decline", response_model=PortalLetter)
async def decline_letter(
    token: str, payload: PortalDeclineRequest, session: SessionDep, request: Request
) -> PortalLetter:
    letter, client, tenant = await _load(session, token)

    if letter.status == "signed":
        raise HTTPException(status.HTTP_409_CONFLICT, "This letter has already been signed.")

    letter.status = "declined"
    letter.declined_at = now_utc()
    letter.decline_reason = payload.reason

    await audit.record(
        session,
        tenant_id=tenant.id,
        actor_email=letter.recipient_email,
        action="declined",
        entity="engagement_letter",
        entity_id=letter.id,
        summary=f"{client.legal_name} declined {letter.title}",
        metadata={"reason": payload.reason},
        ip_address=client_ip(request),
    )
    await audit.notify(
        session,
        tenant_id=tenant.id,
        type="letter_declined",
        title=f"{client.legal_name} declined {letter.title}",
        body=payload.reason or "No reason was given.",
        link=f"/engagements/{letter.id}",
    )
    await session.flush()

    return _serialise(letter, client, tenant)
