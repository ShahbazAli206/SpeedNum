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

Attachments reuse the presigned `documents` bucket and the mint-path pattern
from support.py / client_documents.py — the server names every object under
`{tenant_id}/client-messages/{client_id}/`, never the browser. The same
recipient/ownership rules above decide who can attach or download a file;
attachments introduce no new reach.
"""

from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select, update

from ..deps import BookScopeDep, ClientScopeDep, SessionDep
from ..models import Client, ClientMessage, ClientMessageAttachment, Profile
from ..permissions import client_owner_clause
from ..schemas import (
    ClientMessageCounts,
    ClientMessageCreate,
    ClientMessageRead,
    DocumentDownloadUrl,
    DocumentUploadUrl,
    DocumentUploadUrlRequest,
)
from ..services import audit, storage
from ..utils import ensure_client_in_tenant, ensure_found, now_utc, read

router = APIRouter(prefix="/client-portal/messages", tags=["client-portal"])

_PREVIEW_LEN = 160
_UNSAFE_NAME = re.compile(r"[^\w.\-]+")


def _preview(body: str, attachment_count: int = 0) -> str:
    body = body.strip()
    if body:
        return body if len(body) <= _PREVIEW_LEN else f"{body[: _PREVIEW_LEN - 3]}..."
    if attachment_count:
        return f"📎 {attachment_count} attachment{'s' if attachment_count != 1 else ''}"
    return ""


def _prefix_for(tenant_id: uuid.UUID, client_id: uuid.UUID) -> str:
    """Every object lives under `{tenant}/client-messages/{client}/`, which is
    what makes a storage path checkable rather than merely opaque — see
    _mint_path and client_documents.py's identical pattern."""
    return f"{tenant_id}/client-messages/{client_id}/"


def _mint_path(tenant_id: uuid.UUID, client_id: uuid.UUID, name: str) -> str:
    """The server names the object; the browser never gets to — same reasoning
    as client_documents.py's _mint_path."""
    safe = _UNSAFE_NAME.sub("_", name).strip("._") or "file"
    return f"{_prefix_for(tenant_id, client_id)}{uuid.uuid4()}-{safe[:120]}"


def _storage_unavailable(exc: storage.StorageError) -> HTTPException:
    return HTTPException(status.HTTP_424_FAILED_DEPENDENCY, str(exc))


def _assert_may_reach_client(scope: ClientScopeDep, client: Client) -> None:
    """The exact rule create_message already enforced before attachments
    existed: a restricted staff member (no clients.view_all) may only touch
    clients assigned to them. A portal login is always scoped to its own
    client by ClientScopeDep itself, so this is a no-op for that side."""
    if not scope.is_portal and client_owner_clause(scope.user) is not None:
        if client.owner_id != scope.user.profile.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only message clients assigned to you.")


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


@router.post("/attachments/upload-url", response_model=DocumentUploadUrl)
async def create_upload_url(
    payload: DocumentUploadUrlRequest, session: SessionDep, scope: ClientScopeDep
) -> DocumentUploadUrl:
    """Mint a signed slot for one attachment on the caller's own thread. Same
    reach as create_message below — minting a path doesn't yet write anything,
    but it's still gated so a restricted staff member can't stage an upload
    against a client they could never actually message."""
    client = await ensure_client_in_tenant(session, scope.tenant_id, scope.client_id)
    _assert_may_reach_client(scope, client)

    path = _mint_path(scope.tenant_id, scope.client_id, payload.name)
    try:
        url, token = await storage.create_upload_url(path)
    except storage.StorageError as exc:
        raise _storage_unavailable(exc) from exc
    return DocumentUploadUrl(storage_path=path, token=token, url=url)


@router.get("/attachments/{attachment_id}/download-url", response_model=DocumentDownloadUrl)
async def attachment_download_url(
    attachment_id: uuid.UUID, session: SessionDep, scope: BookScopeDep
) -> DocumentDownloadUrl:
    """Download is keyed by attachment id alone; the row's own client_id is
    checked against the caller's scope exactly like _own_message_for_read
    checks a message — a client only ever reaches its own client_id, staff
    only the clients they're allowed to see."""
    att = await session.scalar(
        select(ClientMessageAttachment).where(
            ClientMessageAttachment.id == attachment_id,
            ClientMessageAttachment.tenant_id == scope.tenant_id,
        )
    )
    ensure_found(att, "Attachment")
    if scope.is_portal:
        if att.client_id != scope.client_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    elif client_owner_clause(scope.user) is not None:
        owned = await session.scalar(
            select(Client.id).where(Client.id == att.client_id, Client.owner_id == scope.user.profile.id)
        )
        if owned is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    try:
        url = await storage.create_download_url(att.storage_path)
    except storage.StorageError as exc:
        raise _storage_unavailable(exc) from exc
    return DocumentDownloadUrl(url=url, expires_in=storage.DOWNLOAD_TTL_SECONDS)


@router.post("", response_model=ClientMessageRead, status_code=status.HTTP_201_CREATED)
async def create_message(
    payload: ClientMessageCreate, session: SessionDep, scope: ClientScopeDep
) -> ClientMessageRead:
    """Post to a client's thread. A portal login posts to its own client; firm
    staff post to a specific client via ?client_id= (only one they're allowed to
    reach). Each direction notifies the other side, and only the other side."""
    client = await ensure_client_in_tenant(session, scope.tenant_id, scope.client_id)
    _assert_may_reach_client(scope, client)

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

    prefix = _prefix_for(scope.tenant_id, scope.client_id)
    for att in payload.attachments:
        if not att.storage_path.startswith(prefix):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "An attachment's storage_path must come from this thread's upload-url endpoint.",
            )
        row.attachments.append(
            ClientMessageAttachment(
                tenant_id=scope.tenant_id,
                client_id=scope.client_id,
                name=att.name,
                storage_path=att.storage_path,
                mime_type=att.mime_type,
                size_bytes=att.size_bytes,
            )
        )

    session.add(row)
    await session.flush()

    preview = _preview(payload.body, len(row.attachments))
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
