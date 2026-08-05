"""Client-portal book: document metadata. Shown on /dashboard/documents.

File bytes go straight from the browser to the `documents` Supabase Storage
bucket (see db/migrations/0003_functions.sql) via a signed upload URL —
routing them through this Space would burn its request timeout on large
files for no benefit. This router only registers/serves the resulting
metadata row, same division of labour as most Supabase-backed apps.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Query, status
from sqlalchemy import select

from ..deps import BookScopeDep, ClientScopeDep, SessionDep
from ..models import Document, Profile
from ..schemas import ClientDocumentCreate, ClientDocumentRead, DocumentTotals, Ok
from ..utils import ensure_client_in_tenant, ensure_found

router = APIRouter(prefix="/client-portal/documents", tags=["client-portal"])


def _visible_to_portal(stmt, uploaded_by: uuid.UUID):
    """A portal user sees what the firm shared, plus whatever it uploaded itself
    — hiding a client's own upload from that same client would make no sense."""
    return stmt.where((Document.is_client_visible.is_(True)) | (Document.uploaded_by == uploaded_by))


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


@router.post("", response_model=ClientDocumentRead, status_code=status.HTTP_201_CREATED)
async def register_document(
    payload: ClientDocumentCreate, session: SessionDep, scope: ClientScopeDep
) -> ClientDocumentRead:
    await ensure_client_in_tenant(session, scope.tenant_id, scope.client_id)

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
    await session.delete(row)
    return Ok(message=f"{row.name} removed")
