"""Small shared helpers used across the routers."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from typing import Any, Iterable, Sequence, TypeVar

import bleach
from fastapi import HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Client, Profile

T = TypeVar("T", bound=BaseModel)

# Matches the Tiptap/StarterKit rich-text editor's actual output (bold,
# italic, underline, lists, links, headings — see
# frontend/src/components/editor/rich-text-editor.tsx) and nothing else.
# `terms_html` was previously stored and rendered completely unsanitized —
# a real, live-confirmed stored-XSS hole: any tenant staff member could set
# it directly via the API (bypassing the rich-text editor entirely) and it
# was rendered with `dangerouslySetInnerHTML` on the *public, unauthenticated*
# client-signing page (frontend/src/app/engagement/[token]) with no escaping.
_RICH_TEXT_TAGS = [
    "p", "br", "strong", "b", "em", "i", "u", "s",
    "ul", "ol", "li", "a", "blockquote", "code", "pre",
    "h1", "h2", "h3",
]
_RICH_TEXT_ATTRS = {"a": ["href"]}


def sanitize_rich_text(html: str | None) -> str | None:
    """Strip anything outside the rich-text editor's own vocabulary —
    scripts, event handlers, iframes, `javascript:` URLs — before it is
    ever stored. Sanitizing on write (not on every render path) means every
    consumer (staff preview, PDF export, the public signing page) is
    protected, not just whichever one remembered to escape it."""
    if html is None:
        return None
    return bleach.clean(
        html, tags=_RICH_TEXT_TAGS, attributes=_RICH_TEXT_ATTRS, protocols=["http", "https", "mailto"], strip=True
    )


def today_utc() -> date:
    return datetime.now(timezone.utc).date()


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def read(model_cls: type[T], obj: Any, **extra: Any) -> T:
    """Validate an ORM row into a response model, then layer on computed fields."""
    base = model_cls.model_validate(obj)
    return base.model_copy(update=extra) if extra else base


def apply_updates(obj: Any, payload: BaseModel, *, allowed: Iterable[str] | None = None) -> list[str]:
    """Copy set fields from a partial-update schema onto an ORM row."""
    changed: list[str] = []
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        if allowed is not None and key not in allowed:
            continue
        if hasattr(obj, key) and getattr(obj, key) != value:
            setattr(obj, key, value)
            changed.append(key)
    return changed


async def profile_names(session: AsyncSession, tenant_id: uuid.UUID) -> dict[uuid.UUID, str]:
    rows = await session.execute(
        select(Profile.id, Profile.full_name, Profile.email).where(Profile.tenant_id == tenant_id)
    )
    return {row.id: (row.full_name or row.email) for row in rows}


def ensure_found(obj: Any, name: str = "Record") -> Any:
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{name} not found")
    return obj


async def ensure_client_in_tenant(session: AsyncSession, tenant_id: uuid.UUID, client_id: uuid.UUID) -> Client:
    """Used by the client-portal book routers to validate a `client_id` the
    caller supplied (staff scoping to a specific client) actually belongs to
    their tenant, before it is trusted as a foreign key."""
    client = await session.scalar(select(Client).where(Client.id == client_id, Client.tenant_id == tenant_id))
    return ensure_found(client, "Client")


def as_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def is_valid_signature_data_url(value: str) -> bool:
    """A signature pad (type/draw/upload) always normalises to a PNG data URL —
    reject anything else before it's persisted as a signature."""
    return value.startswith("data:image/")


def group_count(rows: Sequence[Any], key: str) -> list[dict[str, Any]]:
    counts: dict[Any, int] = {}
    for row in rows:
        counts[getattr(row, key)] = counts.get(getattr(row, key), 0) + 1
    return [{"key": k, "count": v} for k, v in sorted(counts.items(), key=lambda kv: -kv[1])]
