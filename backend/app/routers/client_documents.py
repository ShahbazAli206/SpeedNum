"""Client-portal book: document metadata. Shown on /dashboard/documents.

File bytes go straight from the browser to object storage (MinIO on the
VPS by default; Supabase Storage as a rollback — see services/storage.py's
provider dispatch) via a presigned URL — routing them through this API
would burn its request timeout on large files for no benefit. This router
only registers/serves the resulting metadata row.
"""

from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from ..deps import BookScopeDep, ClientScopeDep, SessionDep
from ..models import Document, Profile
from ..schemas import (
    ClientDocumentCreate,
    ClientDocumentRead,
    DocumentDownloadUrl,
    DocumentTotals,
    DocumentUploadUrl,
    DocumentUploadUrlRequest,
    Ok,
)
from ..services import storage
from ..utils import ensure_client_in_tenant, ensure_found

router = APIRouter(prefix="/client-portal/documents", tags=["client-portal"])

_UNSAFE_NAME = re.compile(r"[^\w.\-]+")


def _visible_to_portal(stmt, uploaded_by: uuid.UUID):
    """A portal user sees what the firm shared, plus whatever it uploaded itself
    — hiding a client's own upload from that same client would make no sense."""
    return stmt.where((Document.is_client_visible.is_(True)) | (Document.uploaded_by == uploaded_by))


def _prefix_for(tenant_id: uuid.UUID, client_id: uuid.UUID) -> str:
    """Every object lives under `{tenant}/{client}/`, which is what makes a
    storage path checkable rather than merely opaque — see _mint_path."""
    return f"{tenant_id}/{client_id}/"


def _mint_path(tenant_id: uuid.UUID, client_id: uuid.UUID, name: str) -> str:
    """The server names the object; the browser never gets to.

    Signing happens with the service-role key (see services/storage.py), which
    bypasses storage RLS — so a caller-chosen path would be a read-anything
    primitive: register a row whose `storage_path` points at another client's
    object, then ask for a download URL for your own row. Minting here, plus the
    prefix check in `register_document`, keeps a document inside the book it
    belongs to.
    """
    safe = _UNSAFE_NAME.sub("_", name).strip("._") or "file"
    return f"{_prefix_for(tenant_id, client_id)}{uuid.uuid4()}-{safe[:120]}"


def _storage_unavailable(exc: storage.StorageError) -> HTTPException:
    """424, matching how an unconfigured service-role key is reported when
    provisioning logins (services/accounts.py) — the request was fine, a
    dependency this deployment needs is missing."""
    return HTTPException(status.HTTP_424_FAILED_DEPENDENCY, str(exc))


@router.get("", response_model=list[ClientDocumentRead])
async def list_documents(
    session: SessionDep,
    scope: BookScopeDep,
    kind: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
) -> list[ClientDocumentRead]:
    stmt = select(Document, Profile.full_name, Profile.email).outerjoin(
        Profile, Profile.id == Document.uploaded_by
    ).where(Document.tenant_id == scope.tenant_id)

    if scope.client_id:
        stmt = stmt.where(Document.client_id == scope.client_id)
    if scope.is_portal:
        stmt = _visible_to_portal(stmt, scope.user.profile.id)
    if kind:
        stmt = stmt.where(Document.kind == kind)

    rows = (await session.execute(stmt.order_by(Document.created_at.desc()).limit(limit))).all()
    return [
        ClientDocumentRead(
            id=doc.id,
            client_id=doc.client_id,
            name=doc.name,
            kind=doc.kind,
            mime_type=doc.mime_type,
            size_bytes=doc.size_bytes,
            is_client_visible=doc.is_client_visible,
            uploaded_by_name=full_name or email,
            created_at=doc.created_at,
        )
        for doc, full_name, email in rows
    ]


@router.get("/totals", response_model=DocumentTotals)
async def document_totals(session: SessionDep, scope: BookScopeDep) -> DocumentTotals:
    stmt = select(Document).where(Document.tenant_id == scope.tenant_id)
    if scope.client_id:
        stmt = stmt.where(Document.client_id == scope.client_id)
    if scope.is_portal:
        stmt = _visible_to_portal(stmt, scope.user.profile.id)

    rows = (await session.scalars(stmt)).all()
    return DocumentTotals(
        count=len(rows),
        bytes=sum(row.size_bytes or 0 for row in rows),
        shared=sum(1 for row in rows if row.is_client_visible),
    )


@router.post("/upload-url", response_model=DocumentUploadUrl)
async def create_upload_url(
    payload: DocumentUploadUrlRequest, session: SessionDep, scope: ClientScopeDep
) -> DocumentUploadUrl:
    """Step 1 of an upload: hand the browser a signed slot to PUT the bytes into.

    Step 2 is POST "" with the returned `storage_path`, once the bytes are in.
    Splitting it this way keeps the file itself off this API — the browser talks
    to object storage directly — while still letting us decide *here* whether
    this caller may write into this client's book at all.
    """
    await ensure_client_in_tenant(session, scope.tenant_id, scope.client_id)
    assert scope.client_id is not None  # ClientScopeDep guarantees it

    path = _mint_path(scope.tenant_id, scope.client_id, payload.name)
    try:
        url, token = await storage.create_upload_url(path)
    except storage.StorageError as exc:
        raise _storage_unavailable(exc) from exc

    return DocumentUploadUrl(storage_path=path, token=token, url=url)


@router.get("/{document_id}/download-url", response_model=DocumentDownloadUrl)
async def create_download_url(
    document_id: uuid.UUID, session: SessionDep, scope: BookScopeDep
) -> DocumentDownloadUrl:
    """A short-lived signed URL for a document the caller is allowed to see.

    The visibility rules are the same ones `list_documents` applies — a portal
    account cannot sign a URL for a firm-internal file it was never shown.
    Deliberately not derived from the row alone: signing uses the service-role
    key, so the row has to be re-fetched *through* the caller's scope rather
    than looked up by id.
    """
    stmt = select(Document).where(
        Document.id == document_id, Document.tenant_id == scope.tenant_id
    )
    if scope.client_id:
        stmt = stmt.where(Document.client_id == scope.client_id)
    if scope.is_portal:
        stmt = _visible_to_portal(stmt, scope.user.profile.id)

    row = await session.scalar(stmt)
    ensure_found(row, "Document")

    try:
        url = await storage.create_download_url(row.storage_path)
    except storage.StorageError as exc:
        raise _storage_unavailable(exc) from exc

    return DocumentDownloadUrl(url=url, expires_in=storage.DOWNLOAD_TTL_SECONDS)


@router.post("", response_model=ClientDocumentRead, status_code=status.HTTP_201_CREATED)
async def register_document(
    payload: ClientDocumentCreate, session: SessionDep, scope: ClientScopeDep
) -> ClientDocumentRead:
    await ensure_client_in_tenant(session, scope.tenant_id, scope.client_id)
    assert scope.client_id is not None  # ClientScopeDep guarantees it

    # The path must be one we minted for this very book. Without this a caller
    # could register a row pointing at any object in the bucket and then read it
    # back through /download-url, since signing bypasses storage RLS.
    if not payload.storage_path.startswith(_prefix_for(scope.tenant_id, scope.client_id)):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "storage_path must come from POST /client-portal/documents/upload-url.",
        )

    data = payload.model_dump()
    # A portal user uploading its own file always sees it — see _visible_to_portal.
    # Only firm staff can *withhold* a document by leaving is_client_visible false.
    if scope.is_portal:
        data["is_client_visible"] = True

    row = Document(
        tenant_id=scope.tenant_id,
        client_id=scope.client_id,
        uploaded_by=scope.user.profile.id,
        **data,
    )
    session.add(row)
    await session.flush()
    return ClientDocumentRead(
        id=row.id,
        client_id=row.client_id,
        name=row.name,
        kind=row.kind,
        mime_type=row.mime_type,
        size_bytes=row.size_bytes,
        is_client_visible=row.is_client_visible,
        uploaded_by_name=scope.user.profile.full_name or scope.user.profile.email,
        created_at=row.created_at,
    )


@router.delete("/{document_id}", response_model=Ok)
async def delete_document(document_id: uuid.UUID, session: SessionDep, scope: BookScopeDep) -> Ok:
    stmt = select(Document).where(Document.id == document_id, Document.tenant_id == scope.tenant_id)
    if scope.client_id:
        stmt = stmt.where(Document.client_id == scope.client_id)
    if scope.is_portal:
        # A portal account may only delete what it uploaded itself, never a
        # firm-shared file.
        stmt = stmt.where(Document.uploaded_by == scope.user.profile.id)
    row = await session.scalar(stmt)
    ensure_found(row, "Document")

    name, path = row.name, row.storage_path
    await session.delete(row)
    await session.flush()

    # Best-effort, and after the row is gone: leaving bytes behind is a storage
    # bill, whereas refusing the delete because storage is unreachable leaves a
    # row the user cannot clear. If the outer commit were to fail after this,
    # the row survives without its object — /download-url reports that cleanly
    # rather than handing out a URL that 404s.
    await storage.delete_object(path)
    return Ok(message=f"{name} removed")
