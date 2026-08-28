"""Firm profile, white-label branding, email delivery checks and the audit trail."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy import desc, select

from ..config import settings
from ..deps import AdminUserDep, SessionDep, TenantUserDep, client_ip
from ..models import AuditLog
from ..schemas import AuditLogRead, TenantRead, TenantUpdate
from ..seats import seat_usage
from ..services import audit
from ..services.email import deliver, email_status, sender_name, test_message_html
from ..utils import apply_updates

router = APIRouter(prefix="/settings", tags=["settings"])


class SeatUsage(BaseModel):
    staff_used: int
    staff_seats: int | None
    client_used: int
    client_seats: int | None


@router.get("/tenant", response_model=TenantRead)
async def get_tenant(user: TenantUserDep) -> TenantRead:
    return TenantRead.model_validate(user.tenant)


@router.get("/seats", response_model=SeatUsage)
async def get_seat_usage(session: SessionDep, user: TenantUserDep) -> SeatUsage:
    """"14/20 staff seats, 340/500 client seats" — any firm staff can see it
    (matches the visibility of the Team/Clients pages that would surface a
    seat-limit error), not just the Owner. See app/seats.py."""
    return SeatUsage(**await seat_usage(session, user.tenant))


@router.patch("/tenant", response_model=TenantRead)
async def update_tenant(
    payload: TenantUpdate, session: SessionDep, user: AdminUserDep, request: Request
) -> TenantRead:
    changed = apply_updates(user.tenant, payload)
    await session.flush()
    if changed:
        await audit.record(
            session,
            tenant_id=user.tenant_id,
            actor_id=user.profile.id,
            actor_email=user.profile.email,
            action="updated",
            entity="tenant",
            entity_id=user.tenant_id,
            summary=f"Updated firm settings ({', '.join(changed)})",
            ip_address=client_ip(request),
        )
    return TenantRead.model_validate(user.tenant)


# --- email delivery -----------------------------------------------------------
class EmailTestRequest(BaseModel):
    to: EmailStr | None = None


class EmailTestResult(BaseModel):
    ok: bool
    provider: str
    to: str
    error: str | None = None
    message: str


@router.get("/email")
async def email_delivery_status(user: AdminUserDep) -> dict[str, Any]:
    """Whether credential emails can actually be delivered, and what is wrong if
    they cannot.

    Exists because the failure is otherwise silent by design: with no transport
    configured, creating an account still succeeds and only reports
    `email_sent: false` on that one response. After a deploy an admin needs to
    ask the question directly rather than infer it from a create they may not
    want to perform yet.

    Returns no key, password or connection string — a firm admin can read this.
    """
    return email_status()


@router.post("/email/test", response_model=EmailTestResult)
async def send_test_email(payload: EmailTestRequest, user: AdminUserDep) -> EmailTestResult:
    """Send a real message through the configured transport.

    Defaults to the caller's own address: the point is to confirm a message
    leaves the server and arrives, and the person who can check the inbox is
    whoever pressed the button. An arbitrary recipient is still allowed, so a
    firm can prove delivery to a client's domain — this is admin-only and sends
    a fixed, contentless template, so it is not a usable spam relay.
    """
    recipient = str(payload.to) if payload.to else user.profile.email
    result = await deliver(
        to=recipient,
        subject=f"{user.tenant.name}: SpeedNum email delivery test",
        html=test_message_html(
            firm_name=user.tenant.name,
            requested_by=user.profile.full_name or user.profile.email,
            provider=settings.resolved_email_provider,
            brand_color=user.tenant.brand_color,
        ),
        reply_to=user.profile.email,
        from_name=sender_name(user.tenant.name, user.tenant.email_from_name),
    )

    if result.ok:
        message = f"Test email sent to {recipient}. Check the inbox, and the spam folder."
    else:
        message = result.error or "The message could not be sent."

    return EmailTestResult(
        ok=result.ok,
        provider=result.provider,
        to=recipient,
        error=result.error,
        message=message,
    )


@router.get("/audit-log", response_model=list[AuditLogRead])
async def audit_log(
    session: SessionDep,
    user: AdminUserDep,
    limit: int = Query(default=100, ge=1, le=500),
    entity: str | None = None,
) -> list[AuditLogRead]:
    stmt = select(AuditLog).where(AuditLog.tenant_id == user.tenant_id)
    if entity:
        stmt = stmt.where(AuditLog.entity == entity)
    stmt = stmt.order_by(desc(AuditLog.created_at)).limit(limit)
    rows = (await session.scalars(stmt)).all()
    return [
        AuditLogRead(
            id=row.id,
            actor_email=row.actor_email,
            action=row.action,
            entity=row.entity,
            entity_id=row.entity_id,
            summary=row.summary,
            created_at=row.created_at,
        )
        for row in rows
    ]
