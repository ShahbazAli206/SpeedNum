"""Staff-side client documents — a firm caller acting on a client's book, as
opposed to client_documents.py's `/client-portal/documents` router, which is
scoped to the client's own portal session (`ClientScopeDep`). A staff member
managing a client's file has no client-portal session of their own, so that
router simply cannot serve this case; these endpoints are the `TenantUserDep`
equivalent, mirroring the presigned-upload-then-register pattern client_
documents.py and task_attachments.py already established.

Objects share the same `{tenant_id}/{client_id}/...` storage prefix as the
portal's own uploads — it is the same client book, only reached from the
other side — so a client invited to the portal later sees whatever staff
already shared (`is_client_visible=True`) without any migration.
"""

from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from ..deps import SessionDep, TenantUserDep, client_ip
from ..models import Document, Profile
from ..schemas import (
    ClientDocumentCreate,
    ClientDocumentRead,
    DocumentDownloadUrl,
    DocumentUploadUrl,
    DocumentUploadUrlRequest,
    Ok,
)
from ..services import audit, storage
from ..utils import ensure_client_in_tenant, ensure_found

router = APIRouter(tags=["clients"])

_UNSAFE_NAME = re.compile(r"[^\w.\-]+")


def _prefix_for(tenant_id: uuid.UUID, client_id: uuid.UUID) -> str:
    """Same prefix scheme as client_documents.py's own `_prefix_for` — both
    routers write into the same client book, just from different callers."""
    return f"{tenant_id}/{client_id}/"


def _mint_path(tenant_id: uuid.UUID, client_id: uuid.UUID, name: str) -> str:
    """The server names the object, never the browser — see
    client_documents.py's `_mint_path` for the full reasoning."""
    safe = _UNSAFE_NAME.sub("_", name).strip("._") or "file"
    return f"{_prefix_for(tenant_id, client_id)}{uuid.uuid4()}-{safe[:120]}"


def _storage_unavailable(exc: storage.StorageError) -> HTTPException:
    return HTTPException(status.HTTP_424_FAILED_DEPENDENCY, str(exc))


@router.post("/clients/{client_id}/documents/upload-url", response_model=DocumentUploadUrl)
async def create_client_document_upload_url(
    client_id: uuid.UUID, payload: DocumentUploadUrlRequest, session: SessionDep, user: TenantUserDep
) -> DocumentUploadUrl:
    await ensure_client_in_tenant(session, user.tenant_id, client_id)

    path = _mint_path(user.tenant_id, client_id, payload.name)
    try:
        url, token = await storage.create_upload_url(path)
    except storage.StorageError as exc:
        raise _storage_unavailable(exc) from exc

    return DocumentUploadUrl(storage_path=path, token=token, url=url)


@router.get("/clients/{client_id}/documents", response_model=list[ClientDocumentRead])
async def list_client_documents(
    client_id: uuid.UUID, session: SessionDep, user: TenantUserDep
) -> list[ClientDocumentRead]:
    await ensure_client_in_tenant(session, user.tenant_id, client_id)

    rows = (
        await session.execute(
            select(Document, Profile.full_name, Profile.email)
            .outerjoin(Profile, Profile.id == Document.uploaded_by)
            .where(Document.tenant_id == user.tenant_id, Document.client_id == client_id)
            .order_by(Document.created_at.desc())
        )
    ).all()
    return [
        ClientDocumentRead(
            id=doc.id,
            client_id=client_id,
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


@router.post(
    "/clients/{client_id}/documents", response_model=ClientDocumentRead, status_code=status.HTTP_201_CREATED
)
async def register_client_document(
    client_id: uuid.UUID, payload: ClientDocumentCreate, session: SessionDep, user: TenantUserDep, request: Request
) -> ClientDocumentRead:
    client = await ensure_client_in_tenant(session, user.tenant_id, client_id)

    # The path must be one we minted for this very book — see
    # client_documents.py's register_document for why this matters: signing
    # uses the service-role key, which bypasses storage RLS.
    if not payload.storage_path.startswith(_prefix_for(user.tenant_id, client_id)):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "storage_path must come from POST /clients/{client_id}/documents/upload-url.",
        )

    doc = Document(
        tenant_id=user.tenant_id,
        client_id=client_id,
        uploaded_by=user.profile.id,
        **payload.model_dump(),
    )
    session.add(doc)
    await session.flush()

    await audit.record(
        session,
        tenant_id=user.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="uploaded",
        entity="client_document",
        entity_id=doc.id,
        summary=f"Uploaded {doc.name} to {client.legal_name}",
        ip_address=client_ip(request),
    )

    return ClientDocumentRead(
        id=doc.id,
        client_id=doc.client_id,
        name=doc.name,
        kind=doc.kind,
        mime_type=doc.mime_type,
        size_bytes=doc.size_bytes,
        is_client_visible=doc.is_client_visible,
        uploaded_by_name=user.profile.full_name or user.profile.email,
        created_at=doc.created_at,
    )


@router.get("/clients/{client_id}/documents/{document_id}/download-url", response_model=DocumentDownloadUrl)
async def client_document_download_url(
    client_id: uuid.UUID, document_id: uuid.UUID, session: SessionDep, user: TenantUserDep
) -> DocumentDownloadUrl:
    await ensure_client_in_tenant(session, user.tenant_id, client_id)

    doc = await session.scalar(
        select(Document).where(
            Document.id == document_id, Document.client_id == client_id, Document.tenant_id == user.tenant_id
        )
    )
    ensure_found(doc, "Document")

    try:
        url = await storage.create_download_url(doc.storage_path)
    except storage.StorageError as exc:
        raise _storage_unavailable(exc) from exc

    return DocumentDownloadUrl(url=url, expires_in=storage.DOWNLOAD_TTL_SECONDS)


@router.delete("/clients/{client_id}/documents/{document_id}", response_model=Ok)
async def delete_client_document(
    client_id: uuid.UUID, document_id: uuid.UUID, session: SessionDep, user: TenantUserDep, request: Request
) -> Ok:
    await ensure_client_in_tenant(session, user.tenant_id, client_id)

    doc = await session.scalar(
        select(Document).where(
            Document.id == document_id, Document.client_id == client_id, Document.tenant_id == user.tenant_id
        )
    )
    ensure_found(doc, "Document")

    await storage.delete_object(doc.storage_path)
    label = doc.name
    await session.delete(doc)
    await session.flush()

    await audit.record(
        session,
        tenant_id=user.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="deleted",
        entity="client_document",
        entity_id=document_id,
        summary=f"Removed document {label}",
        ip_address=client_ip(request),
    )
    return Ok(message=f"{label} removed.")
