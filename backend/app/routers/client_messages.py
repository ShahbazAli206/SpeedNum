"""Client-portal book: free-text messages from a client to the firm.

Distinct from the structured books (expenses, taxes, payroll, documents):
this is the "let the firm know something" channel — a question, a complaint,
anything that doesn't fit a form. Flat and one-way, no threads or replies.
Every client-authored message is mirrored into the notification feed so it
shows up in the bell the same way a signed letter or a crossed deadline does.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Query, status
from sqlalchemy import func, select, update

from ..deps import BookScopeDep, ClientScopeDep, SessionDep, StaffUserDep
from ..models import Client, ClientMessage
from ..schemas import ClientMessageCounts, ClientMessageCreate, ClientMessageRead
from ..services import audit
from ..utils import ensure_client_in_tenant, ensure_found, now_utc, read

router = APIRouter(prefix="/client-portal/messages", tags=["client-portal"])


def _scope_stmt(stmt, scope: BookScopeDep):
    return stmt.where(ClientMessage.client_id == scope.client_id) if scope.client_id else stmt


@router.get("", response_model=list[ClientMessageRead])
async def list_messages(
    session: SessionDep,
    scope: BookScopeDep,
    limit: int = Query(default=100, ge=1, le=500),
) -> list[ClientMessageRead]:
    stmt = (
        select(ClientMessage, Client.legal_name)
        .join(Client, Client.id == ClientMessage.client_id)
        .where(ClientMessage.tenant_id == scope.tenant_id)
    )
    rows = (
        await session.execute(_scope_stmt(stmt, scope).order_by(ClientMessage.created_at.desc()).limit(limit))
    ).all()
    return [read(ClientMessageRead, row, client_name=name) for row, name in rows]


@router.get("/unread-count", response_model=ClientMessageCounts)
async def unread_count(session: SessionDep, user: StaffUserDep) -> ClientMessageCounts:
    total = await session.scalar(
        select(func.count(ClientMessage.id)).where(
            ClientMessage.tenant_id == user.tenant_id,
            ClientMessage.is_read.is_(False),
            ClientMessage.is_from_client.is_(True),
        )
    )
    return ClientMessageCounts(unread=int(total or 0))


@router.post("", response_model=ClientMessageRead, status_code=status.HTTP_201_CREATED)
async def create_message(
    payload: ClientMessageCreate, session: SessionDep, scope: ClientScopeDep
) -> ClientMessageRead:
    client = await ensure_client_in_tenant(session, scope.tenant_id, scope.client_id)
    sender_name = scope.user.profile.full_name or scope.user.profile.email
    row = ClientMessage(
        tenant_id=scope.tenant_id,
        client_id=scope.client_id,
        sender_id=scope.user.profile.id,
        sender_name=sender_name,
        is_from_client=scope.is_portal,
        subject=payload.subject,
        body=payload.body,
    )
    session.add(row)
    await session.flush()

    # Staff logging a call on a client's behalf shouldn't notify itself —
    # only a message that actually came from the portal is news to the firm.
    if scope.is_portal:
        client_name = client.business_name or client.legal_name
        preview = payload.body if len(payload.body) <= 160 else f"{payload.body[:157]}..."
        await audit.notify(
            session,
            tenant_id=scope.tenant_id,
            type="client_message",
            title=payload.subject or f"New message from {client_name}",
            body=preview,
            link=f"/clients/{scope.client_id}",
        )

    return read(ClientMessageRead, row, client_name=client.legal_name)


@router.post("/{message_id}/read", response_model=ClientMessageRead)
async def mark_read(message_id: uuid.UUID, session: SessionDep, user: StaffUserDep) -> ClientMessageRead:
    row = await session.scalar(
        select(ClientMessage).where(
            ClientMessage.id == message_id, ClientMessage.tenant_id == user.tenant_id
        )
    )
    ensure_found(row, "Message")
    row.is_read = True
    row.read_at = now_utc()
    row.read_by = user.profile.id
    await session.flush()
    client_name = await session.scalar(select(Client.legal_name).where(Client.id == row.client_id))
    return read(ClientMessageRead, row, client_name=client_name)


@router.post("/read-all", response_model=ClientMessageCounts)
async def mark_all_read(session: SessionDep, user: StaffUserDep) -> ClientMessageCounts:
    await session.execute(
        update(ClientMessage)
        .where(ClientMessage.tenant_id == user.tenant_id, ClientMessage.is_read.is_(False))
        .values(is_read=True, read_at=func.now(), read_by=user.profile.id)
    )
    return ClientMessageCounts(unread=0)
