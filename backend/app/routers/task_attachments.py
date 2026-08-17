"""Task attachments and comments — firm-side only (TenantUserDep), same as the
rest of Task Master (workflows.py). Attachments reuse the `documents` table
(a task attachment is just a Document with task_id set instead of client_id/
letter_id) and the same presigned-upload-then-register pattern
client_documents.py already established; comments are a new, small table.

Client-portal visibility of tasks doesn't exist yet at all (confirmed via a
repo search — no /client-portal/tasks endpoint), so `is_client_visible` on a
comment is forward-looking schema, not yet consumed by anything client-facing.
"""

from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from ..deps import SessionDep, TenantUserDep, client_ip
from ..models import Document, Profile, Task, TaskComment
from ..schemas import (
    DocumentDownloadUrl,
    DocumentUploadUrl,
    DocumentUploadUrlRequest,
    Ok,
    TaskAttachmentCreate,
    TaskAttachmentRead,
    TaskCommentCreate,
    TaskCommentRead,
    TaskCommentUpdate,
)
from ..services import audit, storage
from ..utils import ensure_found, profile_names

router = APIRouter(tags=["workflows"])

_UNSAFE_NAME = re.compile(r"[^\w.\-]+")


async def _load_task(session: SessionDep, user: TenantUserDep, task_id: uuid.UUID) -> Task:
    task = await session.scalar(select(Task).where(Task.id == task_id, Task.tenant_id == user.tenant_id))
    return ensure_found(task, "Task")


def _mint_path(tenant_id: uuid.UUID, task_id: uuid.UUID, name: str) -> str:
    """Same reasoning as client_documents.py's _mint_path: the server names
    the object, never the browser, and the prefix here is what
    register_attachment checks — a caller can't point a registered row at
    an object outside this task's own prefix."""
    safe = _UNSAFE_NAME.sub("_", name).strip("._") or "file"
    return f"{tenant_id}/tasks/{task_id}/{uuid.uuid4()}-{safe[:120]}"


def _owns_storage_path(tenant_id: uuid.UUID, task_id: uuid.UUID, storage_path: str) -> bool:
    """A registered attachment's storage_path must fall under this exact
    tenant+task prefix minted by `_mint_path` above — otherwise a caller could
    register a row pointing at an object outside this task (or another
    tenant's) without ever calling upload-url for it."""
    return storage_path.startswith(f"{tenant_id}/tasks/{task_id}/")


def _storage_unavailable(exc: storage.StorageError) -> HTTPException:
    return HTTPException(status.HTTP_424_FAILED_DEPENDENCY, str(exc))


@router.post("/tasks/{task_id}/attachments/upload-url", response_model=DocumentUploadUrl)
async def create_attachment_upload_url(
    task_id: uuid.UUID, payload: DocumentUploadUrlRequest, session: SessionDep, user: TenantUserDep
) -> DocumentUploadUrl:
    await _load_task(session, user, task_id)
    path = _mint_path(user.tenant_id, task_id, payload.name)
    try:
        url, token = await storage.create_upload_url(path)
    except storage.StorageError as exc:
        raise _storage_unavailable(exc) from exc
    return DocumentUploadUrl(storage_path=path, token=token, url=url)


@router.get("/tasks/{task_id}/attachments", response_model=list[TaskAttachmentRead])
async def list_attachments(task_id: uuid.UUID, session: SessionDep, user: TenantUserDep) -> list[TaskAttachmentRead]:
    await _load_task(session, user, task_id)
    rows = (
        await session.execute(
            select(Document, Profile.full_name, Profile.email)
            .outerjoin(Profile, Profile.id == Document.uploaded_by)
            .where(Document.tenant_id == user.tenant_id, Document.task_id == task_id)
            .order_by(Document.created_at.desc())
        )
    ).all()
    return [
        TaskAttachmentRead(
            id=doc.id,
            task_id=task_id,
            name=doc.name,
            kind=doc.kind,
            mime_type=doc.mime_type,
            size_bytes=doc.size_bytes,
            uploaded_by_name=full_name or email,
            created_at=doc.created_at,
        )
        for doc, full_name, email in rows
    ]


@router.post(
    "/tasks/{task_id}/attachments", response_model=TaskAttachmentRead, status_code=status.HTTP_201_CREATED
)
async def register_attachment(
    task_id: uuid.UUID, payload: TaskAttachmentCreate, session: SessionDep, user: TenantUserDep, request: Request
) -> TaskAttachmentRead:
    task = await _load_task(session, user, task_id)

    if not _owns_storage_path(user.tenant_id, task_id, payload.storage_path):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "storage_path must come from POST /tasks/{task_id}/attachments/upload-url.",
        )

    doc = Document(
        tenant_id=user.tenant_id,
        client_id=task.client_id,
        task_id=task_id,
        name=payload.name,
        storage_path=payload.storage_path,
        mime_type=payload.mime_type,
        size_bytes=payload.size_bytes,
        kind=payload.kind,
        is_client_visible=False,
        uploaded_by=user.profile.id,
    )
    session.add(doc)
    await session.flush()

    await audit.record(
        session,
        tenant_id=user.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="uploaded",
        entity="task_attachment",
        entity_id=doc.id,
        summary=f"Attached {doc.name} to task {task.title!r}",
        ip_address=client_ip(request),
    )

    return TaskAttachmentRead(
        id=doc.id,
        task_id=task_id,
        name=doc.name,
        kind=doc.kind,
        mime_type=doc.mime_type,
        size_bytes=doc.size_bytes,
        uploaded_by_name=user.profile.full_name or user.profile.email,
        created_at=doc.created_at,
    )


@router.get("/tasks/{task_id}/attachments/{document_id}/download-url", response_model=DocumentDownloadUrl)
async def attachment_download_url(
    task_id: uuid.UUID, document_id: uuid.UUID, session: SessionDep, user: TenantUserDep
) -> DocumentDownloadUrl:
    await _load_task(session, user, task_id)
    doc = await session.scalar(
        select(Document).where(
            Document.id == document_id, Document.task_id == task_id, Document.tenant_id == user.tenant_id
        )
    )
    ensure_found(doc, "Attachment")
    try:
        url = await storage.create_download_url(doc.storage_path)
    except storage.StorageError as exc:
        raise _storage_unavailable(exc) from exc
    return DocumentDownloadUrl(url=url, expires_in=storage.DOWNLOAD_TTL_SECONDS)


@router.delete("/tasks/{task_id}/attachments/{document_id}", response_model=Ok)
async def delete_attachment(
    task_id: uuid.UUID, document_id: uuid.UUID, session: SessionDep, user: TenantUserDep, request: Request
) -> Ok:
    await _load_task(session, user, task_id)
    doc = await session.scalar(
        select(Document).where(
            Document.id == document_id, Document.task_id == task_id, Document.tenant_id == user.tenant_id
        )
    )
    ensure_found(doc, "Attachment")

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
        entity="task_attachment",
        entity_id=document_id,
        summary=f"Removed attachment {label}",
        ip_address=client_ip(request),
    )
    return Ok(message=f"{label} removed.")


# --- Comments -----------------------------------------------------------------


@router.get("/tasks/{task_id}/comments", response_model=list[TaskCommentRead])
async def list_comments(task_id: uuid.UUID, session: SessionDep, user: TenantUserDep) -> list[TaskCommentRead]:
    await _load_task(session, user, task_id)
    rows = (
        await session.scalars(
            select(TaskComment)
            .where(TaskComment.tenant_id == user.tenant_id, TaskComment.task_id == task_id)
            .order_by(TaskComment.created_at.asc())
        )
    ).all()
    names = await profile_names(session, user.tenant_id)
    return [
        TaskCommentRead(
            id=c.id,
            task_id=c.task_id,
            author_id=c.author_id,
            author_name=names.get(c.author_id),
            body=c.body,
            is_client_visible=c.is_client_visible,
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
        for c in rows
    ]


@router.post("/tasks/{task_id}/comments", response_model=TaskCommentRead, status_code=status.HTTP_201_CREATED)
async def create_comment(
    task_id: uuid.UUID, payload: TaskCommentCreate, session: SessionDep, user: TenantUserDep, request: Request
) -> TaskCommentRead:
    task = await _load_task(session, user, task_id)

    comment = TaskComment(
        tenant_id=user.tenant_id,
        task_id=task_id,
        author_id=user.profile.id,
        body=payload.body,
        is_client_visible=payload.is_client_visible,
    )
    session.add(comment)
    await session.flush()

    await audit.record(
        session,
        tenant_id=user.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="commented",
        entity="task",
        entity_id=task.id,
        summary=f"Commented on task {task.title!r}",
        ip_address=client_ip(request),
    )

    return TaskCommentRead(
        id=comment.id,
        task_id=task_id,
        author_id=comment.author_id,
        author_name=user.profile.full_name or user.profile.email,
        body=comment.body,
        is_client_visible=comment.is_client_visible,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )


@router.patch("/tasks/{task_id}/comments/{comment_id}", response_model=TaskCommentRead)
async def update_comment(
    task_id: uuid.UUID,
    comment_id: uuid.UUID,
    payload: TaskCommentUpdate,
    session: SessionDep,
    user: TenantUserDep,
) -> TaskCommentRead:
    await _load_task(session, user, task_id)
    comment = await session.scalar(
        select(TaskComment).where(
            TaskComment.id == comment_id, TaskComment.task_id == task_id, TaskComment.tenant_id == user.tenant_id
        )
    )
    ensure_found(comment, "Comment")
    # Only the author may edit their own comment — anyone else on the team
    # (even an admin) can still delete it below, but silently rewriting
    # someone else's words is a different, worse thing than removing them.
    if comment.author_id != user.profile.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only edit your own comments.")

    comment.body = payload.body
    await session.flush()

    names = await profile_names(session, user.tenant_id)
    return TaskCommentRead(
        id=comment.id,
        task_id=task_id,
        author_id=comment.author_id,
        author_name=names.get(comment.author_id),
        body=comment.body,
        is_client_visible=comment.is_client_visible,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )


@router.delete("/tasks/{task_id}/comments/{comment_id}", response_model=Ok)
async def delete_comment(
    task_id: uuid.UUID, comment_id: uuid.UUID, session: SessionDep, user: TenantUserDep
) -> Ok:
    await _load_task(session, user, task_id)
    comment = await session.scalar(
        select(TaskComment).where(
            TaskComment.id == comment_id, TaskComment.task_id == task_id, TaskComment.tenant_id == user.tenant_id
        )
    )
    ensure_found(comment, "Comment")
    if comment.author_id != user.profile.id and user.profile.role not in ("owner", "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the author or an admin can delete this comment.")

    await session.delete(comment)
    await session.flush()
    return Ok(message="Comment removed.")
