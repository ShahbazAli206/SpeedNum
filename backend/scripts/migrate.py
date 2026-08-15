#!/usr/bin/env python
"""Apply db/migrations/*.sql to Supabase Postgres, once each, in order.

The migrations were previously applied by pasting them into the Supabase SQL
editor. That works exactly once per file and leaves nothing behind to say which
ones were run, so the only record of the schema's state was a line in
DEPLOYMENT.md — and it was wrong: 0005 adds `profiles.must_change_password`,
which `deps.get_firm_linked_user` reads on every authenticated request, so a
deploy against a database still at 0004 fails every signed-in request with a
500 that names a missing column.

This records what it applies in `public.schema_migrations`, so the question
"what is deployed" has an answer that comes from the database rather than a
document.

    python scripts/migrate.py status              # what is applied, what is pending
    python scripts/migrate.py baseline 0004       # mark 0001-0004 applied WITHOUT running
    python scripts/migrate.py apply               # run everything pending
    python scripts/migrate.py apply --dry-run     # show what apply would do

On a database that already has 0001-0004 in it (which is the case for this
project's Supabase instance), run `baseline 0004` first. Re-running those files
would not be harmless: 0002 issues bare `create policy` statements, which error
on the second run.

Each file is applied inside its own transaction together with its
schema_migrations row, so a file that fails halfway leaves neither the change
nor a record claiming it succeeded.

MIGRATIONS_SKIP — comma-separated version prefixes to skip entirely, e.g.
    MIGRATIONS_SKIP=0002_rls
0002_rls.sql defines `language sql` helper functions that call `auth.uid()`
and creates policies `to authenticated` — both are Supabase-specific (that
role/function only exist when this database is a Supabase project's own
Postgres) and fail outright on a plain Postgres instance. Every other
migration guards its Supabase-only statements internally (see 0003, 0004,
0007) and runs safely either way; 0002 is nothing *but* Supabase-only
statements, so it is skipped by name instead. Set this on the VPS/portable
deployment target; leave it unset against Supabase, where 0002 keeps
providing defence-in-depth RLS as before.
"""

from __future__ import annotations

import asyncio
import hashlib
import os
import sys
from pathlib import Path

import asyncpg


def _migrations_dir() -> Path:
    """Where the .sql files are.

    Two layouts have to work. From a git checkout the files sit beside the
    backend at `<repo>/db/migrations`. Inside the container only `backend/` was
    copied — the Docker build context is `backend/`, so it cannot reach `../db`
    — and the compose `migrate` service bind-mounts them in instead, announcing
    the location through MIGRATIONS_DIR.
    """
    override = os.environ.get("MIGRATIONS_DIR")
    if override:
        return Path(override)
    return Path(__file__).resolve().parents[2] / "db" / "migrations"


TRACKING_TABLE = """
create table if not exists public.schema_migrations (
  version    text primary key,
  filename   text not null,
  checksum   text not null,
  applied_at timestamptz not null default now()
)
"""


class MigrationError(RuntimeError):
    pass


def _dsn() -> str:
    """The connection string, in the form asyncpg accepts.

    app.config normalises DATABASE_URL to SQLAlchemy's `postgresql+asyncpg://`
    form; asyncpg itself does not understand the driver suffix, so strip it.
    Read from the environment directly rather than importing app.config, so this
    script stays runnable when the app package cannot import for some other
    reason.
    """
    raw = (os.environ.get("DATABASE_URL") or "").strip()
    if not raw:
        raise MigrationError(
            "DATABASE_URL is not set. Use the Supabase transaction pooler string "
            "(port 6543), the same value the API runs with."
        )
    for prefix in ("postgresql+asyncpg://", "postgres://"):
        if raw.startswith(prefix):
            return "postgresql://" + raw[len(prefix) :]
    return raw


def _discover() -> list[tuple[str, Path]]:
    """Every migration, as (version, path), in application order.

    The version is the leading numeric prefix plus the rest of the stem, so the
    two files that both start with 0006 stay distinct and sort deterministically.
    They touch different tables (engagement_letters and tasks), so their relative
    order does not matter — only that it is stable.
    """
    directory = _migrations_dir()
    if not directory.is_dir():
        raise MigrationError(f"No migrations directory at {directory}")
    files = sorted(directory.glob("*.sql"), key=lambda p: p.name)
    if not files:
        raise MigrationError(f"No .sql files in {directory}")
    return [(path.stem, path) for path in files]


def _checksum(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def _skip_prefixes() -> set[str]:
    raw = os.environ.get("MIGRATIONS_SKIP", "")
    return {part.strip() for part in raw.split(",") if part.strip()}


def _is_skipped(version: str, skip: set[str]) -> bool:
    return any(version.startswith(prefix) for prefix in skip)


async def _connect() -> asyncpg.Connection:
    # statement_cache_size=0 for the same reason app/db.py sets it: the port-6543
    # transaction pooler multiplexes connections and cannot hold prepared statements.
    return await asyncpg.connect(_dsn(), statement_cache_size=0, timeout=30)


async def _load_applied(conn: asyncpg.Connection) -> dict[str, str]:
    await conn.execute(TRACKING_TABLE)
    rows = await conn.fetch("select version, checksum from public.schema_migrations")
    return {row["version"]: row["checksum"] for row in rows}


async def cmd_status() -> int:
    conn = await _connect()
    try:
        applied = await _load_applied(conn)
        skip = _skip_prefixes()
        pending: list[str] = []

        print(f"{'migration':<40} {'state':<10} note")
        print("-" * 78)
        for version, path in _discover():
            checksum = _checksum(path)
            if version in applied:
                if applied[version] != checksum:
                    # The file changed after it was applied. The database still has
                    # whatever the old text did, so this is a real divergence, not a
                    # formality — flag it rather than silently treating it as done.
                    print(f"{version:<40} {'APPLIED':<10} !! file changed since it was applied")
                else:
                    print(f"{version:<40} {'APPLIED':<10}")
            elif _is_skipped(version, skip):
                print(f"{version:<40} {'SKIPPED':<10} MIGRATIONS_SKIP")
            else:
                pending.append(version)
                print(f"{version:<40} {'PENDING':<10}")

        print()
        if pending:
            print(f"{len(pending)} pending: {', '.join(pending)}")
            print("Run: python scripts/migrate.py apply")
        else:
            print("Schema is up to date.")
        return 0
    finally:
        await conn.close()


async def cmd_apply(dry_run: bool) -> int:
    conn = await _connect()
    try:
        applied = await _load_applied(conn)
        skip = _skip_prefixes()
        skipped = [v for v, _ in _discover() if v not in applied and _is_skipped(v, skip)]
        pending = [(v, p) for v, p in _discover() if v not in applied and not _is_skipped(v, skip)]

        if skipped:
            print(f"Skipping (MIGRATIONS_SKIP): {', '.join(skipped)}")

        if not pending:
            print("Nothing to apply — schema is up to date.")
            return 0

        if dry_run:
            print(f"Would apply {len(pending)} migration(s):")
            for version, _ in pending:
                print(f"  {version}")
            return 0

        for version, path in pending:
            sql = path.read_text(encoding="utf-8")
            print(f"applying {version} ... ", end="", flush=True)
            try:
                # One transaction per file, with its bookkeeping row inside it:
                # a failure rolls back both, so the tracking table can never
                # claim a migration that did not fully land.
                async with conn.transaction():
                    await conn.execute(sql)
                    await conn.execute(
                        "insert into public.schema_migrations (version, filename, checksum) "
                        "values ($1, $2, $3)",
                        version,
                        path.name,
                        _checksum(path),
                    )
            except asyncpg.PostgresError as exc:
                print("FAILED")
                print(f"\n{version} failed and was rolled back:\n  {type(exc).__name__}: {exc}")
                print("\nNothing after it was attempted. Fix the file and re-run.")
                return 1
            print("ok")

        print(f"\nApplied {len(pending)} migration(s).")
        return 0
    finally:
        await conn.close()


async def cmd_baseline(upto: str) -> int:
    """Record migrations up to `upto` as applied without running them.

    For a database whose early migrations were applied by hand before this
    script existed. Deliberately refuses to touch anything already recorded.
    """
    migrations = _discover()

    # Find the cutoff first, and mark only what precedes it. Deciding as we
    # iterate is what makes this dangerous: with 0001-0004 already recorded,
    # a loop that skips them and stops at the first match for `upto` runs off
    # the end and baselines 0005 — the one migration that most needs to run.
    cutoff = next((i for i, (version, _) in enumerate(migrations) if version.startswith(upto)), None)
    if cutoff is None:
        print(f"error: no migration starts with '{upto}'. Known versions:", file=sys.stderr)
        for version, _ in migrations:
            print(f"  {version}", file=sys.stderr)
        return 2

    conn = await _connect()
    try:
        applied = await _load_applied(conn)
        marked = 0
        for version, path in migrations[: cutoff + 1]:
            if version in applied:
                continue
            await conn.execute(
                "insert into public.schema_migrations (version, filename, checksum) "
                "values ($1, $2, $3) on conflict (version) do nothing",
                version,
                path.name,
                _checksum(path),
            )
            marked += 1
            print(f"baselined {version}")

        if marked == 0:
            print(f"Nothing to baseline — everything up to {upto} was already recorded.")
            return 0

        remaining = [v for v, _ in migrations[cutoff + 1 :]]
        print(f"\nBaselined {marked} migration(s) up to {upto}. They were NOT executed.")
        if remaining:
            print(f"Still pending, and these WILL run on apply: {', '.join(remaining)}")
        return 0
    finally:
        await conn.close()


def main() -> int:
    args = sys.argv[1:]
    command = args[0] if args else "status"

    try:
        if command == "status":
            return asyncio.run(cmd_status())
        if command == "apply":
            return asyncio.run(cmd_apply(dry_run="--dry-run" in args))
        if command == "baseline":
            if len(args) < 2:
                print("usage: migrate.py baseline <version-prefix>   e.g. baseline 0004")
                return 2
            return asyncio.run(cmd_baseline(args[1]))
    except MigrationError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    except (OSError, asyncpg.PostgresError) as exc:
        print(f"error: could not reach the database — {type(exc).__name__}: {exc}", file=sys.stderr)
        return 2

    print(__doc__)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
