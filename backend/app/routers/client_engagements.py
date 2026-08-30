"""Authenticated client-portal engagement letters.

The logged-in counterpart to routers/portal.py's public magic-link flow — a
client with a real portal login can view and sign/decline their firm's
letters from inside /dashboard, not only via an emailed token link. Same
underlying rules (services/engagement_signing.py); this router only replaces
"prove you hold the token" with "you're authenticated as this client".

Firm staff never reach this router: BookScopeDep admits them, but every
handler here rejects a non-portal caller outright — a staff member manages a
letter through /engagements instead, which carries their own signature
separately (firm_signature_data) rather than acting as the recipient.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from ..deps import BookScopeDep, SessionDep, client_ip
from ..models import Client, EngagementLetter, Tenant
from ..schemas import PortalLetter
from ..services import engagement_signing
from ..utils import ensure_found

router = APIRouter(prefix="/client-portal/engagements", tags=["client-portal"])


class ClientSignRequest(BaseModel):
    signer_name: str = Field(min_length=2, max_length=120)
    signer_title: str | None = None
    signature_data: str = Field(min_length=32, description="PNG data URL produced by the signature pad")
    agreed: bool = True


class ClientDeclineRequest(BaseModel):
    reason: str | None = None


def _require_portal(scope: BookScopeDep) -> None:
    if not scope.is_portal:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Only a client-portal login can use this endpoint."
        )


async def _load(
    session: SessionDep, scope: BookScopeDep, letter_id: uuid.UUID
) -> tuple[EngagementLetter, Client, Tenant]:
    _require_portal(scope)
    row = (
        await session.execute(
            select(EngagementLetter, Client, Tenant)
            .join(Client, Client.id == EngagementLetter.client_id)
            .join(Tenant, Tenant.id == EngagementLetter.tenant_id)
            .where(
                EngagementLetter.id == letter_id,
                EngagementLetter.tenant_id == scope.tenant_id,
                EngagementLetter.client_id == scope.client_id,
            )
        )
    ).first()
    ensure_found(row, "Engagement letter")
    letter, client, tenant = row
    if letter.status not in engagement_signing.VIEWABLE_STATUSES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This letter is not available.")
    return letter, client, tenant


@router.get("", response_model=list[PortalLetter])
async def list_my_engagements(session: SessionDep, scope: BookScopeDep) -> list[PortalLetter]:
    _require_portal(scope)
    rows = (
        await session.execute(
            select(EngagementLetter, Client, Tenant)
            .join(Client, Client.id == EngagementLetter.client_id)
            .join(Tenant, Tenant.id == EngagementLetter.tenant_id)
            .where(
                EngagementLetter.tenant_id == scope.tenant_id,
                EngagementLetter.client_id == scope.client_id,
                EngagementLetter.status.in_(engagement_signing.VIEWABLE_STATUSES),
            )
            .order_by(EngagementLetter.created_at.desc())
        )
    ).all()
    return [engagement_signing.serialise_portal_letter(letter, client, tenant) for letter, client, tenant in rows]


@router.get("/{letter_id}", response_model=PortalLetter)
async def get_my_engagement(letter_id: uuid.UUID, session: SessionDep, scope: BookScopeDep) -> PortalLetter:
    letter, client, tenant = await _load(session, scope, letter_id)
    await engagement_signing.mark_viewed(session, letter, client, tenant)
    return engagement_signing.serialise_portal_letter(letter, client, tenant)


@router.post("/{letter_id}/sign", response_model=PortalLetter)
async def sign_my_engagement(
    letter_id: uuid.UUID,
    payload: ClientSignRequest,
    session: SessionDep,
    scope: BookScopeDep,
    request: Request,
) -> PortalLetter:
    letter, client, tenant = await _load(session, scope, letter_id)
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
        actor_email=scope.user.profile.email,
    )
    return engagement_signing.serialise_portal_letter(letter, client, tenant)


@router.post("/{letter_id}/decline", response_model=PortalLetter)
async def decline_my_engagement(
    letter_id: uuid.UUID,
    payload: ClientDeclineRequest,
    session: SessionDep,
    scope: BookScopeDep,
    request: Request,
) -> PortalLetter:
    letter, client, tenant = await _load(session, scope, letter_id)
    await engagement_signing.apply_decline(
        session,
        letter,
        client,
        tenant,
        reason=payload.reason,
        ip_address=client_ip(request),
        actor_email=scope.user.profile.email,
    )
    return engagement_signing.serialise_portal_letter(letter, client, tenant)
