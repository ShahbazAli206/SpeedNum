"""SpeedNum API — FastAPI service designed to run as a Hugging Face Docker Space."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from . import __version__
from .config import settings
from .db import engine
from .routers import (
    admin,
    auth,
    client_documents,
    client_expenses,
    client_invoices,
    client_overview,
    client_payroll,
    client_services,
    client_taxes,
    clients,
    custom_fields,
    dashboard,
    deadlines,
    engagements,
    imports,
    notifications,
    portal,
    public,
    reminders,
    reporting,
    services,
    settings as settings_router,
    team,
    users,
    workflows,
)
from .services import scheduler

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)-8s %(name)s | %(message)s",
)
log = logging.getLogger("speednum")

API_PREFIX = "/api/v1"


def _warn_about_configuration() -> None:
    """Shout about the settings that are merely sloppy in development but are a
    real exposure in production. Warnings, not failures: a deploy that refuses
    to boot over CORS would be worse than one that works and says so, and the
    operator can only read these once the service is actually up."""
    if settings.is_production and settings.cors_is_wildcard:
        log.warning(
            "CORS_ORIGINS is '*' in production — any website can call this API with a "
            "user's token. Set it to the frontend's exact origin, e.g. "
            "CORS_ORIGINS=https://your-app.vercel.app"
        )
    if settings.is_production and not settings.supabase_service_role_key:
        log.warning(
            "SUPABASE_SERVICE_ROLE_KEY is unset — creating logins and signing document "
            "uploads/downloads will fail with HTTP 424."
        )
    if settings.is_production and not settings.resend_api_key:
        log.warning(
            "RESEND_API_KEY is unset — credential emails, portal welcomes and reminder "
            "digests will be logged instead of delivered."
        )
    if settings.is_production and settings.public_app_url.startswith("http://localhost"):
        log.warning(
            "PUBLIC_APP_URL still points at localhost — sign-in and e-signature links "
            "sent by email will not work."
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    _warn_about_configuration()

    try:
        async with engine.connect() as connection:
            await connection.execute(text("select 1"))
        log.info("Connected to Supabase Postgres")
    except Exception as exc:  # noqa: BLE001 - the Space should still boot and report why
        log.error("Database connection failed at startup: %s", exc)

    # Generates reminders (and their emails) on a daily timer. Without this the
    # "10 days left" warnings only ever appear when someone presses Check now.
    sweep_task = scheduler.start(app.state)

    yield

    if sweep_task is not None:
        sweep_task.cancel()
        # Let the task observe the cancellation so it can unwind its session
        # instead of being torn down mid-transaction.
        with suppress(asyncio.CancelledError):
            await sweep_task
    await engine.dispose()


app = FastAPI(
    title="SpeedNum API",
    version=__version__,
    description=(
        "Practice-management API for accounting firms: client CRM, workflows, "
        "compliance deadlines, engagement letters and the client signing portal."
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError) -> JSONResponse:
    log.warning("Integrity error on %s: %s", request.url.path, exc.orig)
    detail = "That record conflicts with one that already exists."
    origin = str(getattr(exc, "orig", "")).lower()
    if "foreign key" in origin:
        detail = "A referenced record no longer exists."
    elif "not null" in origin:
        detail = "A required field was missing."
    return JSONResponse(status_code=409, content={"detail": detail})


for router in (
    auth.router,
    dashboard.router,
    clients.router,
    services.router,
    workflows.router,
    deadlines.router,
    engagements.router,
    team.router,
    users.router,
    reporting.router,
    notifications.router,
    reminders.router,
    custom_fields.router,
    imports.router,
    settings_router.router,
    admin.router,
    portal.router,
    public.router,
    client_invoices.router,
    client_expenses.router,
    client_payroll.router,
    client_taxes.router,
    client_documents.router,
    client_overview.router,
    client_services.router,
):
    app.include_router(router, prefix=API_PREFIX)


@app.get("/health", tags=["meta"])
async def health() -> dict[str, object]:
    database = "unknown"
    try:
        async with engine.connect() as connection:
            await connection.execute(text("select 1"))
        database = "ok"
    except Exception as exc:  # noqa: BLE001
        database = f"error: {type(exc).__name__}"
    return {
        "status": "ok" if database == "ok" else "degraded",
        "version": __version__,
        "database": database,
        "environment": settings.environment,
    }


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
async def root() -> str:
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SpeedNum API</title>
    <style>
      body {{ font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
             background:#0f172a; color:#e2e8f0; display:grid; place-items:center;
             min-height:100vh; margin:0; }}
      .card {{ background:#1e293b; border:1px solid #334155; border-radius:16px;
               padding:40px; max-width:520px; }}
      h1 {{ margin:0 0 8px; font-size:24px; }}
      p {{ color:#94a3b8; line-height:1.6; }}
      a {{ color:#60a5fa; }}
      code {{ background:#0f172a; padding:2px 6px; border-radius:4px; font-size:13px; }}
    </style>
  </head>
  <body>
    <div class="card">
      <h1>SpeedNum API <small style="color:#64748b">v{__version__}</small></h1>
      <p>Practice-management backend for accounting firms. This Space serves the JSON API
         consumed by the SpeedNum web app.</p>
      <p>
        <a href="/docs">Interactive docs</a> &middot;
        <a href="/redoc">ReDoc</a> &middot;
        <a href="/health">Health</a>
      </p>
      <p>All endpoints live under <code>{API_PREFIX}</code> and expect a Supabase
         access token in the <code>Authorization: Bearer</code> header.</p>
    </div>
  </body>
</html>"""
