"""Test-suite bootstrap.

`app/db.py` builds the engine at import time and raises when `DATABASE_URL` is
absent, so importing any router — which every test does, directly or otherwise —
needs one to exist before the first `import app.*` runs.

Locally that requirement was satisfied by accident: `backend/.env` is present on
a developer machine and pydantic-settings reads it. It is gitignored, so a fresh
clone and CI have no such file, and the whole suite failed at collection there
with `RuntimeError: DATABASE_URL is not set`. That went unnoticed because CI had
never actually run.

Setting it here fixes it for every environment at once rather than for CI alone.
Environment variables outrank the dotenv file in pydantic-settings, so this also
keeps the suite off whatever database a developer's `.env` happens to point at.
Nothing dials out regardless — `create_async_engine` is lazy and every test in
this suite is pure logic.
"""

from __future__ import annotations

import os

os.environ.setdefault("ENVIRONMENT", "test")
# `.invalid` is reserved by RFC 6761 and guaranteed never to resolve, so a test
# that accidentally grows a real query fails loudly instead of finding a host.
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@db.invalid:5432/test")
