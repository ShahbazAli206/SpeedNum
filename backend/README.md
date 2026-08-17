# SpeedNum API

FastAPI backend for the SpeedNum practice-management platform. Runs as a Docker container on
a self-hosted VPS behind Caddy, talks to a self-hosted Postgres 16 + MinIO, and is consumed by
the Next.js frontend on Vercel and the admin desktop app.

```
Vercel (Next.js)  ──HTTPS──▶  Caddy  ──▶  FastAPI  ──asyncpg──▶  Postgres 16
        │                                    │
        └── SpeedNum Desktop (Electron) ─────┼──▶ MinIO (documents + backup snapshots)
                                              └──▶ Hostinger SMTP
```

## What it does

| Area | Endpoints |
| --- | --- |
| Session | `GET/PATCH /api/v1/auth/me`, `POST /api/v1/auth/register`, `/login`, `/refresh`, `/logout`, `/bootstrap` |
| Social login | `GET /api/v1/auth/oauth/providers`, `/oauth/{provider}/start`, `POST /oauth/{provider}/callback` (Google only today) |
| Dashboard | `GET /api/v1/dashboard` |
| Client CRM | `/api/v1/clients`, `/api/v1/contacts` |
| Catalogue | `/api/v1/services`, `/api/v1/client-services` |
| Task Master | `/api/v1/projects`, `/api/v1/tasks`, `POST /api/v1/tasks/{id}/move` |
| Deadlines | `/api/v1/deadlines`, `POST /api/v1/deadlines/generate` |
| Engagements | `/api/v1/engagements`, `POST /api/v1/engagements/{id}/send` |
| Client portal | `GET /api/v1/portal/{token}`, `POST /api/v1/portal/{token}/sign` |
| Team / users | `/api/v1/team`, `/api/v1/team/invitations`, `/api/v1/users` |
| Import | `POST /api/v1/import/{clients,users}/preview` and `/commit` |
| Reporting | `GET /api/v1/reporting`, `GET /api/v1/settings/audit-log` |
| Disaster recovery | `/api/v1/admin/backups` (superadmin-only — list/run/download-url/ack-download/restore-drill) |
| Superadmin | `/api/v1/admin/tenants`, `/api/v1/admin/stats` |
| Client-portal books | `/api/v1/client-portal/{invoices,expenses,payroll,taxes,documents,overview}` |

Interactive docs: `/docs`. Health probe: `/health`.

## Authentication

Self-hosted, not Supabase. See [`../SECURITY.md`](../SECURITY.md) for the full design; in short:

* Passwords: Argon2id (`services/password_hash.py`).
* Access tokens: self-signed Ed25519 (EdDSA) JWTs with `kid`-based key rotation
  (`services/jwt_keys.py`) — `Authorization: Bearer <token>`.
* Refresh tokens: opaque, rotated on every use, with reuse detection (replaying an
  already-rotated token revokes every session for that account).
* Social login: "Continue with Google" (`services/oauth_google.py`) — standard
  authorization-code + PKCE, ID-token signature/issuer/audience/expiration verification
  against Google's live JWKS. Account linking only happens on a verified email claim.
  `AUTH_PROVIDER=supabase` remains as a documented, inactive-by-default rollback.

The token's `sub` claim is looked up in `public.profiles`, which pins the user to exactly one
tenant (or one client, for a portal account via `client_id`). Every query is filtered by
`tenant_id`, so a token from firm A can never read firm B's rows.

## Configuration

See `.env.example`. The ones that matter most:

* `DATABASE_URL` — a plain Postgres 16 connection string, e.g.
  `postgresql+asyncpg://speednum_app:<password>@postgres:5432/speednum`.
* `JWT_PRIVATE_KEY` — Ed25519 PEM used to sign access tokens. Unset, a fresh key is generated
  at boot and every session is invalidated on the next restart — set this for any real deploy.
* `SMTP_HOST` / `SMTP_USERNAME` / `SMTP_PASSWORD` — Hostinger (or any) SMTP for transactional
  email, or `RESEND_API_KEY` as an alternative transport.
* `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — optional; "Continue with Google" only appears
  once both are set (`GET /auth/oauth/providers` reports which providers are live).
* `BACKUP_S3_BUCKET` / `BACKUP_SCHEDULER_HOUR` / etc. — disaster-recovery snapshots, see
  [`../BACKUP_ARCHITECTURE.md`](../BACKUP_ARCHITECTURE.md).

## Deploy

Deployed via Docker Compose on a self-hosted VPS — see [`../DEPLOYMENT.md`](../DEPLOYMENT.md)
for the full runbook (build, migrate, health checks, Caddy/TLS).

```bash
cd deploy
docker compose build api
docker compose run --rm migrate apply
docker compose up -d api
```

## Run locally

```bash
cd backend
python -m venv .venv && .venv/Scripts/activate    # Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                              # fill in DATABASE_URL at minimum
uvicorn app.main:app --reload --port 8000
```

```bash
pytest              # 230+ tests, pure logic — no live DB required
python -m compileall .
```

## Layout

```
app/
  main.py                 FastAPI app, CORS, error handling, router mounting, schedulers
  config.py                env-driven settings
  db.py                   async engine
  security.py             JWT verification (local EdDSA + optional Supabase rollback)
  deps.py                 auth/tenant/role/superadmin dependencies
  models.py               SQLAlchemy models mirroring db/migrations
  schemas.py              Pydantic request/response models
  utils.py                shared helpers
  services/
    local_auth.py          password auth, sessions, refresh rotation, OAuth orchestration
    oauth_google.py        Google-specific OAuth (authorize URL, token exchange, ID-token verify)
    password_hash.py       Argon2id
    jwt_keys.py            Ed25519 signing keys + rotation
    accounts.py             admin-driven account provisioning (staff/client-portal)
    email.py                SMTP/Resend delivery with a logging fallback
    backup_snapshots.py     pg_dump + MinIO object archive + checksummed manifest
    backup_scheduler.py     daily snapshot scheduling (advisory-lock guarded)
    deadlines.py            compliance-calendar engine (CRA-style due-date rules)
    audit.py                audit trail + notifications
  routers/                 one module per feature area
```
