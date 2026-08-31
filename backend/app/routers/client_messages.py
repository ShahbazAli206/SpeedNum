"""Client-portal messaging: a two-way, per-client thread between a client and
the firm side that serves them.

Each client has one flat thread (no separate subject threads). `is_from_client`
says which way a message went:

  * True  — the client wrote it (from /dashboard/messages). It notifies the
            client's *assigned staff* (Client.owner_id) and every company Owner,
            and nobody else — a colleague who isn't on this client never sees it.
  * False — firm staff wrote it (an Owner, or the assigned staff member, from
            /messages). It notifies the client's portal login(s).

`is_read` is the *recipient* side's read flag: for an inbound (client) message
the firm marks it read; for an outbound (staff) message the client does. That
single column drives each side's unread badge without a second table.

Guardrail: this channel is client ↔ firm only. The firm never reaches the
platform provider here, and clients/staff never reach it either — that separate
company-Owner ↔ provider channel is app/routers/support.py, Owner-gated.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select, update

from ..deps import BookScopeDep, ClientScopeDep, SessionDep
from ..models import Client, ClientMessage, Profile
from ..permissions import client_owner_clause
from ..schemas import ClientMessageCounts, ClientMessageCreate, ClientMessageRead
from ..services import audit
from ..utils import ensure_client_in_tenant, ensure_found, now_utc, read

router = APIRouter(prefix="/client-portal/messages", tags=["client-portal"])

_PREVIEW_LEN = 160


def _preview(body: str) -> str:
    return body if len(body) <= _PREVIEW_LEN else f"{body[: _PREVIEW_LEN - 3]}..."


def _owned_client_ids(scope: BookScopeDep):
    """Sub-select of the client ids this staff member is allowed to touch —
    only used when their role lacks clients.view_all. Mirrors the exact rule the
    Clients page applies (permissions.client_owner_clause)."""
    return select(Client.id).where(
        Client.tenant_id == scope.tenant_id, Client.owner_id == scope.user.profile.id
    )


async def _staff_recipients(session: SessionDep, tenant_id: uuid.UUID, client: Client) -> set[uuid.UUID]:
    """Who hears about a client's inbound message: the client's assigned staff
    (owner_id) plus every company Owner — and no other staff."""
    owners = (
        await session.scalars(
            select(Profile.id).where(
                Profile.tenant_id == tenant_id,
                Profile.role == "owner",
                Profile.client_id.is_(None),
            )
        )
    ).all()
    recipients: set[uuid.UUID] = set(owners)
    if client.owner_id is not None:
        recipients.add(client.owner_id)
    return recipients


async def _client_recipients(session: SessionDep, client_id: uuid.UUID) -> list[uuid.UUID]:
    """Portal login(s) pinned to this client — who hears about a staff reply."""
    return list(
        (await session.scalars(select(Profile.id).where(Profile.client_id == client_id))).all()
    )


@router.get("", response_model=list[ClientMessageRead])
async def list_messages(
    session: SessionDep,
    scope: BookScopeDep,
    limit: int = Query(default=200, ge=1, le=500),
) -> list[ClientMessageRead]:
    """The thread(s) the caller may see. A portal login is pinned to its own
    client; firm staff see their assigned clients' threads (all of them for an
    Owner or a clients.view_all role), narrowable with ?client_id=."""
    stmt = (
        select(ClientMessage, Client.legal_name)
        .join(Client, Client.id == ClientMessage.client_id)
        .where(ClientMessage.tenant_id == scope.tenant_id)
    )
    if scope.client_id:
        stmt = stmt.where(ClientMessage.client_id == scope.client_id)
    if not scope.is_portal:
        # Even a ?client_id= for a client this staff member doesn't own is
        # filtered out here — the query param can never widen access.
        clause = client_owner_clause(scope.user)
        if clause is not None:
            stmt = stmt.where(clause)
    rows = (await session.execute(stmt.order_by(ClientMessage.created_at.desc()).limit(limit))).all()
    return [read(ClientMessageRead, row, client_name=name) for row, name in rows]


@router.get("/unread-count", response_model=ClientMessageCounts)
async def unread_count(session: SessionDep, scope: BookScopeDep) -> ClientMessageCounts:
    """Each side counts the messages addressed to it: a client counts unread
    staff replies, firm staff count unread client messages on their clients."""
    stmt = select(func.count(ClientMessage.id)).where(
        ClientMessage.tenant_id == scope.tenant_id,
        ClientMessage.is_read.is_(False),
    )
    if scope.is_portal:
        stmt = stmt.where(
            ClientMessage.client_id == scope.client_id,
            ClientMessage.is_from_client.is_(False),
        )
    else:
        stmt = stmt.where(ClientMessage.is_from_client.is_(True))
        if client_owner_clause(scope.user) is not None:
            stmt = stmt.where(ClientMessage.client_id.in_(_owned_client_ids(scope)))
    total = await session.scalar(stmt)
    return ClientMessageCounts(unread=int(total or 0))


@router.post("", response_model=ClientMessageRead, status_code=status.HTTP_201_CREATED)
async def create_message(
    payload: ClientMessageCreate, session: SessionDep, scope: ClientScopeDep
) -> ClientMessageRead:
    """Post to a client's thread. A portal login posts to its own client; firm
    staff post to a specific client via ?client_id= (only one they're allowed to
    reach). Each direction notifies the other side, and only the other side."""
    client = await ensure_client_in_tenant(session, scope.tenant_id, scope.client_id)

    if not scope.is_portal and client_owner_clause(scope.user) is not None:
        # A restricted staff member may only message clients assigned to them.
        if client.owner_id != scope.user.profile.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only message clients assigned to you.")

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

    preview = _preview(payload.body)
    client_name = client.business_name or client.legal_name
    if scope.is_portal:
        # Inbound — only the assigned staff and the company Owner(s).
        for pid in await _staff_recipients(session, scope.tenant_id, client):
            await audit.notify(
                session,
                tenant_id=scope.tenant_id,
                profile_id=pid,
                type="client_message",
                title=payload.subject or f"New message from {client_name}",
                body=preview,
                link=f"/messages?client={scope.client_id}",
            )
    else:
        # Outbound — only the client's own portal login(s).
        for pid in await _client_recipients(session, scope.client_id):
            await audit.notify(
                session,
                tenant_id=scope.tenant_id,
                profile_id=pid,
                type="client_message",
                title=payload.subject or f"New message from {sender_name}",
                body=preview,
                link="/dashboard/messages",
            )

    return read(ClientMessageRead, row, client_name=client.legal_name)


async def _own_message_for_read(session: SessionDep, scope: BookScopeDep, message_id: uuid.UUID) -> ClientMessage:
    """Fetch a message the caller is the *recipient* of, or 404. A caller can
    only mark the other side's messages read — never their own — and only within
    their scope, so knowing an id is never enough to touch another thread."""
    row = await session.scalar(
        select(ClientMessage).where(
            ClientMessage.id == message_id, ClientMessage.tenant_id == scope.tenant_id
        )
    )
    ensure_found(row, "Message")
    if scope.is_portal:
        if row.client_id != scope.client_id or row.is_from_client:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
    else:
        if not row.is_from_client:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
        if client_owner_clause(scope.user) is not None:
            owned = await session.scalar(
                select(Client.id).where(
                    Client.id == row.client_id, Client.owner_id == scope.user.profile.id
                )
            )
            if owned is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
    return row


@router.post("/{message_id}/read", response_model=ClientMessageRead)
async def mark_read(message_id: uuid.UUID, session: SessionDep, scope: BookScopeDep) -> ClientMessageRead:
    row = await _own_message_for_read(session, scope, message_id)
    row.is_read = True
    row.read_at = now_utc()
    row.read_by = scope.user.profile.id
    await session.flush()
    client_name = await session.scalar(select(Client.legal_name).where(Client.id == row.client_id))
    return read(ClientMessageRead, row, client_name=client_name)


@router.post("/read-all", response_model=ClientMessageCounts)
async def mark_all_read(session: SessionDep, scope: BookScopeDep) -> ClientMessageCounts:
    """Mark every message addressed to the caller read — a client's unread staff
    replies, or a staff member's unread client messages across their clients."""
    stmt = update(ClientMessage).where(
        ClientMessage.tenant_id == scope.tenant_id, ClientMessage.is_read.is_(False)
    )
    if scope.is_portal:
        stmt = stmt.where(
            ClientMessage.client_id == scope.client_id,
            ClientMessage.is_from_client.is_(False),
        )
    else:
        stmt = stmt.where(ClientMessage.is_from_client.is_(True))
        if client_owner_clause(scope.user) is not None:
            stmt = stmt.where(ClientMessage.client_id.in_(_owned_client_ids(scope)))
    await session.execute(
        stmt.values(is_read=True, read_at=func.now(), read_by=scope.user.profile.id)
    )
    return ClientMessageCounts(unread=0)
