"""Shared sign/decline/serialise logic for an engagement letter.

Used by both the public magic-link flow (routers/portal.py, no login, access
is by unguessable token) and the authenticated client-portal flow
(routers/client_engagements.py, a logged-in client signing their own firm's
letter). One set of state-machine rules and audit/notify behavior, rather
than two copies that can quietly drift apart.
"""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Client, EngagementLetter, Tenant
from ..schemas import LetterItemRead, PortalBrand, PortalLetter
from ..utils import is_valid_signature_data_url, now_utc
from . import audit

#: Statuses a recipient (token or logged-in client) may ever see. A "draft"
#: hasn't been shared yet and "void" was withdrawn — see routers/portal.py's
#: original _load for the same list this mirrors.
VIEWABLE_STATUSES = ("sent", "viewed", "signed", "declined")


def can_sign(current_status: str) -> bool:
    """Pure decision: is this letter in a state a recipient may sign from?
    Already-signed and draft/void are excluded — a re-sign after decline is
    allowed (the recipient changed their mind), a re-sign after signed is not
    (that would silently overwrite an executed record)."""
    return current_status in ("sent", "viewed", "declined")


def can_decline(current_status: str) -> bool:
    """Pure decision: anything except an already-signed letter may still be
    declined — including a second decline, which just updates the reason."""
    return current_status != "signed"


def serialise_portal_letter(letter: EngagementLetter, client: Client, tenant: Tenant) -> PortalLetter:
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


async def mark_viewed(session: AsyncSession, letter: EngagementLetter, client: Client, tenant: Tenant) -> None:
    if letter.status != "sent":
        return
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


async def apply_signature(
    session: AsyncSession,
    letter: EngagementLetter,
    client: Client,
    tenant: Tenant,
    *,
    signer_name: str,
    signer_title: str | None,
    signature_data: str,
    agreed: bool,
    ip_address: str | None,
    actor_email: str | None = None,
) -> None:
    if letter.status == "signed":
        raise HTTPException(status.HTTP_409_CONFLICT, "This letter has already been signed.")
    if not can_sign(letter.status):
        raise HTTPException(status.HTTP_409_CONFLICT, "This letter is not available for signature.")
    if not agreed:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "You must agree to the terms to sign.")
    if not is_valid_signature_data_url(signature_data):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "The signature image is not valid.")

    letter.status = "signed"
    letter.signed_at = now_utc()
    letter.signer_name = signer_name.strip()
    letter.signer_title = signer_title
    letter.signature_data = signature_data
    letter.signature_ip = ip_address
    letter.declined_at = None
    letter.decline_reason = None

    await audit.record(
        session,
        tenant_id=tenant.id,
        actor_email=actor_email or letter.recipient_email,
        action="signed",
        entity="engagement_letter",
        entity_id=letter.id,
        summary=f"{signer_name} signed {letter.title}",
        metadata={"client": client.legal_name},
        ip_address=ip_address,
    )
    await audit.notify(
        session,
        tenant_id=tenant.id,
        type="letter_signed",
        title=f"{client.legal_name} signed {letter.title}",
        body=f"Signed by {signer_name} — {letter.currency} {float(letter.total):,.2f}.",
        link=f"/engagements/{letter.id}",
    )
    await session.flush()


async def apply_decline(
    session: AsyncSession,
    letter: EngagementLetter,
    client: Client,
    tenant: Tenant,
    *,
    reason: str | None,
    ip_address: str | None,
    actor_email: str | None = None,
) -> None:
    if not can_decline(letter.status):
        raise HTTPException(status.HTTP_409_CONFLICT, "This letter has already been signed.")

    letter.status = "declined"
    letter.declined_at = now_utc()
    letter.decline_reason = reason

    await audit.record(
        session,
        tenant_id=tenant.id,
        actor_email=actor_email or letter.recipient_email,
        action="declined",
        entity="engagement_letter",
        entity_id=letter.id,
        summary=f"{client.legal_name} declined {letter.title}",
        metadata={"reason": reason},
        ip_address=ip_address,
    )
    await audit.notify(
        session,
        tenant_id=tenant.id,
        type="letter_declined",
        title=f"{client.legal_name} declined {letter.title}",
        body=reason or "No reason was given.",
        link=f"/engagements/{letter.id}",
    )
    await session.flush()
