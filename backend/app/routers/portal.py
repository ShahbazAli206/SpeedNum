"""Public client portal — no login, access is by unguessable letter token.

The sign/decline/serialise rules live in services/engagement_signing.py,
shared with routers/client_engagements.py (the authenticated counterpart for
a client who already has a portal login) — this router's job is purely
token-based access control before handing off to that shared logic.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from ..deps import SessionDep, client_ip
from ..models import Client, EngagementLetter, Tenant
from ..schemas import PortalDeclineRequest, PortalLetter, PortalSignRequest
from ..services import engagement_signing
from ..utils import now_utc

router = APIRouter(prefix="/portal", tags=["portal"])


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


@router.get("/{token}", response_model=PortalLetter)
async def view_letter(token: str, session: SessionDep) -> PortalLetter:
    letter, client, tenant = await _load(session, token)
    await engagement_signing.mark_viewed(session, letter, client, tenant)
    return engagement_signing.serialise_portal_letter(letter, client, tenant)


@router.post("/{token}/sign", response_model=PortalLetter)
async def sign_letter(
    token: str, payload: PortalSignRequest, session: SessionDep, request: Request
) -> PortalLetter:
    letter, client, tenant = await _load(session, token)
    await engagement_signing.apply_signature(
        session,
        letter,
        client,
        tenant,
        signer_name=payload.signer_name,
        signer_title=payload.signer_title,
        signature_data=payload.signature_data,
        agreed=payload.agreed,
        ip_address=client_ip(request),
    )
    return engagement_signing.serialise_portal_letter(letter, client, tenant)


@router.post("/{token}/decline", response_model=PortalLetter)
async def decline_letter(
    token: str, payload: PortalDeclineRequest, session: SessionDep, request: Request
) -> PortalLetter:
    letter, client, tenant = await _load(session, token)
    await engagement_signing.apply_decline(
        session,
        letter,
        client,
        tenant,
        reason=payload.reason,
        ip_address=client_ip(request),
    )
    return engagement_signing.serialise_portal_letter(letter, client, tenant)
