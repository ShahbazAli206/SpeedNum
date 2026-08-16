"""Unauthenticated endpoints used by the marketing site."""

from __future__ import annotations

from fastapi import APIRouter, Depends, status

from ..deps import SessionDep
from ..models import Lead
from ..schemas import LeadCreate, Ok
from ..services.rate_limit import rate_limit_by_ip

router = APIRouter(prefix="/public", tags=["public"])

# Unauthenticated and public by design, so IP is the only thing to key on.
# Generous enough that a visitor double-clicking submit never sees a 429,
# tight enough to blunt scripted spam of the marketing site's own form.
_leads_rate_limit = rate_limit_by_ip("public-leads", limit=5, window_seconds=300)


@router.post(
    "/leads",
    response_model=Ok,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_leads_rate_limit)],
)
async def capture_lead(payload: LeadCreate, session: SessionDep) -> Ok:
    session.add(Lead(**payload.model_dump()))
    return Ok(message="Thanks — we'll be in touch within one business day.")
