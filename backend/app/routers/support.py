"""Company-owner ↔ platform support messaging.

A threaded, two-way channel between a company Owner (a tenant's owner role) and
the SpeedNum platform provider (the is_superadmin operator). One thread per
company. Two routers in one file, mirroring plan_requests.py:

  * `router`       — firm side, `/support/*`, OwnerOrSuperadminDep. A company's
                     Owner talks to the platform. Everything is scoped to the
                     caller's own tenant.
  * `admin_router` — platform side, `/admin/support/*`, SuperadminDep. The
                     super-admin sees every company's thread from one inbox and
                     replies into any of them.

`from_platform` on each message says which side spoke; `read_at` is set when the
opposite side has seen it, which drives each side's unread badge. Firm messages
notify the platform workspace tenant; platform replies notify the firm's Owners
— the same cross-tenant reach plan_requests.py's _notify_platform established.

Attachments reuse the presigned `documents` bucket and the mint-path-then-PUT
pattern from task_attachments.py / client_documents.py — the server names every
object under `{tenant_id}/support/{thread_id}/`, never the browser.
"""

from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import func, select, update

from ..deps import OwnerOrSuperadminDep, SessionDep, SuperadminDep
from ..models import Profile, SupportAttachment, SupportMessage, SupportThread, Tenant
from ..schemas import (
    DocumentDownloadUrl,
    DocumentUploadUrl,
    DocumentUploadUrlRequest,
    SupportMessageCreate,
    SupportMessageRead,
    SupportThreadDetail,
    SupportThreadRead,
    SupportThreadSummary,
    SupportUnreadCount,
)
from ..services import audit, storage
from ..utils import ensure_found, now_utc

router = APIRouter(prefix="/support", tags=["support"])
admin_router = APIRouter(prefix="/admin/support", tags=["support"])

_UNSAFE_NAME = re.compile(r"[^\w.\-]+")
_PREVIEW_LEN = 160


# --- shared helpers -----------------------------------------------------------
async def _get_or_create_thread(session: SessionDep, tenant_id: uuid.UUID) -> SupportThread:
    thread = await session.scalar(select(SupportThread).where(SupportThread.tenant_id == tenant_id))
    if thread is None:
        thread = SupportThread(tenant_id=tenant_id)
        session.add(thread)
        await session.flush()
    return thread


async def _thread_messages(session: SessionDep, thread_id: uuid.UUID) -> list[SupportMessageRead]:
    rows = (
        await session.scalars(
            select(SupportMessage)
            .where(SupportMessage.thread_id == thread_id)
            .order_by(SupportMessage.created_at.asc())
        )
    ).all()
    return [SupportMessageRead.model_validate(row) for row in rows]


def _mint_path(tenant_id: uuid.UUID, thread_id: uuid.UUID, name: str) -> str:
    """The server names the object, never the browser; the prefix is what the
    create endpoints check so a caller can't register an attachment against an
    object outside this tenant's own support thread."""
    safe = _UNSAFE_NAME.sub("_", name).strip("._") or "file"
    return f"{tenant_id}/support/{thread_id}/{uuid.uuid4()}-{safe[:120]}"


def _owns_path(tenant_id: uuid.UUID, thread_id: uuid.UUID, storage_path: str) -> bool:
    return storage_path.startswith(f"{tenant_id}/support/{thread_id}/")


def _storage_unavailable(exc: storage.StorageError) -> HTTPException:
    return HTTPException(status.HTTP_424_FAILED_DEPENDENCY, str(exc))


def _preview(body: str) -> str:
    body = body.strip()
    return body if len(body) <= _PREVIEW_LEN else f"{body[: _PREVIEW_LEN - 3]}..."


async def _add_message(
    session: SessionDep,
    *,
    thread: SupportThread,
    sender: Profile,
    from_platform: bool,
    payload: SupportMessageCreate,
) -> SupportMessage:
    """Insert a message (and any attachments) and bump the thread's activity
    clock. Validates every attachment's storage_path falls under this thread's
    own minted prefix — the same guard task_attachments.register_attachment uses."""
    message = SupportMessage(
        thread_id=thread.id,
        tenant_id=thread.tenant_id,
        sender_id=sender.id,
        sender_name=sender.full_name or sender.email,
        from_platform=from_platform,
        body=payload.body,
    )
    for att in payload.attachments:
        if not _owns_path(thread.tenant_id, thread.id, att.storage_path):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "An attachment's storage_path must come from this thread's upload-url endpoint.",
            )
        message.attachments.append(
            SupportAttachment(
                tenant_id=thread.tenant_id,
                name=att.name,
                storage_path=att.storage_path,
                mime_type=att.mime_type,
                size_bytes=att.size_bytes,
            )
        )
    session.add(message)
    thread.last_message_at = now_utc()
    await session.flush()
    return message


async def _notify_platform(session: SessionDep, *, title: str, body: str, link: str) -> None:
    """Best-effort notification into the platform's own workspace tenant (the one
    flagged settings.is_platform). A no-op until one tenant is so flagged —
    identical reach to plan_requests._notify_platform."""
    rows = (await session.execute(select(Tenant.id, Tenant.settings))).all()
    platform_id = next((tid for tid, s in rows if bool((s or {}).get("is_platform"))), None)
    if platform_id is None:
        return
    await audit.notify(session, tenant_id=platform_id, title=title, body=body, link=link, type="support")


async def _notify_firm_owners(
    session: SessionDep, *, tenant_id: uuid.UUID, title: str, body: str, link: str
) -> None:
    """A platform reply targets the firm's Owner(s) specifically, not a
    tenant-wide broadcast — the channel is Owner-only, so Member/Viewer staff
    shouldn't get a bell they can't act on. Falls back to a firm-wide broadcast
    only if the firm somehow has no active owner."""
    owner_ids = (
        await session.scalars(
            select(Profile.id).where(
                Profile.tenant_id == tenant_id,
                Profile.role == "owner",
                Profile.client_id.is_(None),
                Profile.is_active.is_(True),
            )
        )
    ).all()
    targets: list[uuid.UUID | None] = list(owner_ids) or [None]
    for profile_id in targets:
        await audit.notify(
            session, tenant_id=tenant_id, profile_id=profile_id, title=title, body=body, link=link, type="support"
        )


# =============================================================================
# Firm side — /support (the company Owner)
# =============================================================================
@router.get("/thread", response_model=SupportThreadRead)
async def get_thread(session: SessionDep, user: OwnerOrSuperadminDep) -> SupportThreadRead:
    thread = await _get_or_create_thread(session, user.tenant_id)
    return SupportThreadRead(thread_id=thread.id, messages=await _thread_messages(session, thread.id))


@router.get("/unread-count", response_model=SupportUnreadCount)
async def firm_unread_count(session: SessionDep, user: OwnerOrSuperadminDep) -> SupportUnreadCount:
    total = await session.scalar(
        select(func.count(SupportMessage.id)).where(
            SupportMessage.tenant_id == user.tenant_id,
            SupportMessage.from_platform.is_(True),
            SupportMessage.read_at.is_(None),
        )
    )
    return SupportUnreadCount(unread=int(total or 0))


@router.post("/thread/read", response_model=SupportUnreadCount)
async def firm_mark_read(session: SessionDep, user: OwnerOrSuperadminDep) -> SupportUnreadCount:
    await session.execute(
        update(SupportMessage)
        .where(
            SupportMessage.tenant_id == user.tenant_id,
            SupportMessage.from_platform.is_(True),
            SupportMessage.read_at.is_(None),
        )
        .values(read_at=func.now())
    )
    return SupportUnreadCount(unread=0)


@router.post("/attachments/upload-url", response_model=DocumentUploadUrl)
async def firm_upload_url(
    payload: DocumentUploadUrlRequest, session: SessionDep, user: OwnerOrSuperadminDep
) -> DocumentUploadUrl:
    thread = await _get_or_create_thread(session, user.tenant_id)
    path = _mint_path(user.tenant_id, thread.id, payload.name)
    try:
        url, token = await storage.create_upload_url(path)
    except storage.StorageError as exc:
        raise _storage_unavailable(exc) from exc
    return DocumentUploadUrl(storage_path=path, token=token, url=url)


@router.post("/messages", response_model=SupportMessageRead, status_code=status.HTTP_201_CREATED)
async def firm_send_message(
    payload: SupportMessageCreate, session: SessionDep, user: OwnerOrSuperadminDep
) -> SupportMessageRead:
    thread = await _get_or_create_thread(session, user.tenant_id)
    message = await _add_message(
        session, thread=thread, sender=user.profile, from_platform=False, payload=payload
    )
    await _notify_platform(
        session,
        title=f"Support message from {user.tenant.name}",
        body=_preview(payload.body),
        link="/admin/support",
    )
    return SupportMessageRead.model_validate(message)


@router.get("/attachments/{attachment_id}/download-url", response_model=DocumentDownloadUrl)
async def firm_attachment_download_url(
    attachment_id: uuid.UUID, session: SessionDep, user: OwnerOrSuperadminDep
) -> DocumentDownloadUrl:
    att = await session.scalar(
        select(SupportAttachment).where(
            SupportAttachment.id == attachment_id, SupportAttachment.tenant_id == user.tenant_id
        )
    )
    ensure_found(att, "Attachment")
    try:
        url = await storage.create_download_url(att.storage_path)
    except storage.StorageError as exc:
        raise _storage_unavailable(exc) from exc
    return DocumentDownloadUrl(url=url, expires_in=storage.DOWNLOAD_TTL_SECONDS)


# =============================================================================
# Platform side — /admin/support (the super-admin)
# =============================================================================
async def _load_tenant(session: SessionDep, tenant_id: uuid.UUID) -> Tenant:
    tenant = await session.get(Tenant, tenant_id)
    return ensure_found(tenant, "Company")


@admin_router.get("/threads", response_model=list[SupportThreadSummary])
async def list_threads(session: SessionDep, _: SuperadminDep) -> list[SupportThreadSummary]:
    # Only companies with actual activity — an empty thread (created lazily by an
    # upload-url call that never sent) is noise in the inbox.
    threads = (
        await session.execute(
            select(SupportThread.tenant_id, Tenant.name, SupportThread.last_message_at)
            .join(Tenant, Tenant.id == SupportThread.tenant_id)
            .where(SupportThread.last_message_at.is_not(None))
            .order_by(SupportThread.last_message_at.desc())
        )
    ).all()

    # Per-tenant aggregates in three set-based queries rather than N per row.
    unread_rows = (
        await session.execute(
            select(SupportMessage.tenant_id, func.count(SupportMessage.id))
            .where(SupportMessage.from_platform.is_(False), SupportMessage.read_at.is_(None))
            .group_by(SupportMessage.tenant_id)
        )
    ).all()
    unread = {tid: int(n) for tid, n in unread_rows}
    total_rows = (
        await session.execute(
            select(SupportMessage.tenant_id, func.count(SupportMessage.id)).group_by(SupportMessage.tenant_id)
        )
    ).all()
    totals = {tid: int(n) for tid, n in total_rows}
    # Last message per tenant (Postgres DISTINCT ON).
    last_rows = (
        await session.execute(
            select(SupportMessage.tenant_id, SupportMessage.body, SupportMessage.from_platform)
            .distinct(SupportMessage.tenant_id)
            .order_by(SupportMessage.tenant_id, SupportMessage.created_at.desc())
        )
    ).all()
    last = {tid: (body, from_platform) for tid, body, from_platform in last_rows}

    summaries = []
    for tenant_id, tenant_name, last_message_at in threads:
        body_platform = last.get(tenant_id)
        summaries.append(
            SupportThreadSummary(
                tenant_id=tenant_id,
                tenant_name=tenant_name,
                last_message_at=last_message_at,
                last_message_preview=_preview(body_platform[0]) if body_platform else None,
                last_from_platform=body_platform[1] if body_platform else None,
                unread=unread.get(tenant_id, 0),
                total=totals.get(tenant_id, 0),
            )
        )
    return summaries


@admin_router.get("/unread-count", response_model=SupportUnreadCount)
async def platform_unread_count(session: SessionDep, _: SuperadminDep) -> SupportUnreadCount:
    total = await session.scalar(
        select(func.count(SupportMessage.id)).where(
            SupportMessage.from_platform.is_(False), SupportMessage.read_at.is_(None)
        )
    )
    return SupportUnreadCount(unread=int(total or 0))


@admin_router.get("/threads/{tenant_id}", response_model=SupportThreadDetail)
async def get_thread_detail(
    tenant_id: uuid.UUID, session: SessionDep, _: SuperadminDep
) -> SupportThreadDetail:
    tenant = await _load_tenant(session, tenant_id)
    thread = await _get_or_create_thread(session, tenant_id)
    return SupportThreadDetail(
        tenant_id=tenant_id,
        tenant_name=tenant.name,
        messages=await _thread_messages(session, thread.id),
    )


@admin_router.post("/threads/{tenant_id}/read", response_model=SupportUnreadCount)
async def platform_mark_read(
    tenant_id: uuid.UUID, session: SessionDep, _: SuperadminDep
) -> SupportUnreadCount:
    await session.execute(
        update(SupportMessage)
        .where(
            SupportMessage.tenant_id == tenant_id,
            SupportMessage.from_platform.is_(False),
            SupportMessage.read_at.is_(None),
        )
        .values(read_at=func.now())
    )
    return SupportUnreadCount(unread=0)


@admin_router.post("/threads/{tenant_id}/attachments/upload-url", response_model=DocumentUploadUrl)
async def platform_upload_url(
    tenant_id: uuid.UUID, payload: DocumentUploadUrlRequest, session: SessionDep, _: SuperadminDep
) -> DocumentUploadUrl:
    await _load_tenant(session, tenant_id)
    thread = await _get_or_create_thread(session, tenant_id)
    path = _mint_path(tenant_id, thread.id, payload.name)
    try:
        url, token = await storage.create_upload_url(path)
    except storage.StorageError as exc:
        raise _storage_unavailable(exc) from exc
    return DocumentUploadUrl(storage_path=path, token=token, url=url)


@admin_router.post(
    "/threads/{tenant_id}/messages", response_model=SupportMessageRead, status_code=status.HTTP_201_CREATED
)
async def platform_send_message(
    tenant_id: uuid.UUID, payload: SupportMessageCreate, session: SessionDep, user: SuperadminDep
) -> SupportMessageRead:
    tenant = await _load_tenant(session, tenant_id)
    thread = await _get_or_create_thread(session, tenant_id)
    message = await _add_message(
        session, thread=thread, sender=user.profile, from_platform=True, payload=payload
    )
    await _notify_firm_owners(
        session,
        tenant_id=tenant_id,
        title="New reply from SpeedNum support",
        body=_preview(payload.body),
        link="/support",
    )
    return SupportMessageRead.model_validate(message)


@admin_router.get("/attachments/{attachment_id}/download-url", response_model=DocumentDownloadUrl)
async def platform_attachment_download_url(
    attachment_id: uuid.UUID, session: SessionDep, _: SuperadminDep
) -> DocumentDownloadUrl:
    att = await session.scalar(select(SupportAttachment).where(SupportAttachment.id == attachment_id))
    ensure_found(att, "Attachment")
    try:
        url = await storage.create_download_url(att.storage_path)
    except storage.StorageError as exc:
        raise _storage_unavailable(exc) from exc
    return DocumentDownloadUrl(url=url, expires_in=storage.DOWNLOAD_TTL_SECONDS)
