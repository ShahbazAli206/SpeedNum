"""Unauthenticated endpoints used by the marketing site."""

from __future__ import annotations

from fastapi import APIRouter, status

from ..deps import SessionDep
from ..models import Lead
from ..schemas import LeadCreate, Ok

router = APIRouter(prefix="/public", tags=["public"])


@router.post("/leads", response_model=Ok, status_code=status.HTTP_201_CREATED)
async def capture_lead(payload: LeadCreate, session: SessionDep) -> Ok:
    session.add(Lead(**payload.model_dump()))
    return Ok(message="Thanks — we'll be in touch within one business day.")
