"""Async SQLAlchemy engine — plain Postgres 16 on the VPS by default; the
port-6543/Supavisor branch below also lets the same image point at a
Supabase project's pooler as a rollback (see MIGRATION.md)."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from .config import settings

log = logging.getLogger(__name__)

# Query params libpq understands but asyncpg does not.
_LIBPQ_ONLY = {"sslmode", "channel_binding", "options", "target_session_attrs", "connect_timeout"}


def _split_url(url: str) -> tuple[str, dict[str, str]]:
    """Strip libpq-only params off the DSN and hand them back separately."""
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query))
    libpq = {k: v for k, v in query.items() if k in _LIBPQ_ONLY}
    remaining = {k: v for k, v in query.items() if k not in _LIBPQ_ONLY}
    clean = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(remaining), parts.fragment))
    return clean, libpq


def _build_engine():
    if not settings.database_url:
        raise RuntimeError(
            "DATABASE_URL is not set. Point it at the VPS Postgres service, e.g. "
            "postgresql+asyncpg://speednum_app:<password>@postgres:5432/speednum "
            "(or a Supabase pooler string as a rollback, e.g. "
            "postgresql://postgres.<ref>:<password>@aws-0-ca-central-1.pooler.supabase.com:6543/postgres)"
        )

    url, libpq = _split_url(settings.database_url)
    connect_args: dict[str, Any] = {"server_settings": {"application_name": "speednum-api"}}

    sslmode = libpq.get("sslmode", "require")
    if sslmode in {"disable", "allow"}:
        connect_args["ssl"] = False
    else:
        connect_args["ssl"] = True

    # Supavisor's transaction pooler (port 6543) multiplexes connections, so
    # server-side prepared statements have to be off and pooling has to be ours.
    transaction_pooler = ":6543" in url or settings.environment == "pgbouncer"
    if transaction_pooler:
        connect_args["statement_cache_size"] = 0
        return create_async_engine(url, poolclass=NullPool, connect_args=connect_args, future=True)

    return create_async_engine(
        url,
        pool_size=5,
        max_overflow=5,
        pool_pre_ping=True,
        pool_recycle=1800,
        connect_args=connect_args,
        future=True,
    )


engine = _build_engine()

SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
