---
title: SpeedNum API
emoji: 📊
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
license: mit
short_description: Practice-management API for accounting firms
---

# SpeedNum API

FastAPI backend for the SpeedNum practice-management platform. Runs as a Hugging Face
Docker Space, talks to Supabase Postgres, and is consumed by the Next.js frontend on Vercel.

```
Vercel (Next.js)  ──bearer token──▶  HF Space (FastAPI)  ──asyncpg──▶  Supabase Postgres
        │                                                                    ▲
        └────────────── Supabase Auth (sign-in, JWT) ────────────────────────┘
```

## What it does

| Area | Endpoints |
| --- | --- |
| Session | `GET/PATCH /api/v1/auth/me`, `POST /api/v1/auth/bootstrap` |
| Dashboard | `GET /api/v1/dashboard` |
| Client CRM | `/api/v1/clients`, `/api/v1/contacts` |
| Catalogue | `/api/v1/services`, `/api/v1/client-services` |
| Task Master | `/api/v1/projects`, `/api/v1/tasks`, `POST /api/v1/tasks/{id}/move` |
| Deadlines | `/api/v1/deadlines`, `POST /api/v1/deadlines/generate` |
| Engagements | `/api/v1/engagements`, `POST /api/v1/engagements/{id}/send` |
| Client portal | `GET /api/v1/portal/{token}`, `POST /api/v1/portal/{token}/sign` |
| Team | `/api/v1/team`, `/api/v1/team/invitations` |
| Reporting | `GET /api/v1/reporting`, `GET /api/v1/settings/audit-log` |
| Import | `POST /api/v1/import/clients/preview` and `/commit` |
| Superadmin | `/api/v1/admin/tenants`, `/api/v1/admin/stats` |

Interactive docs: `/docs`. Health probe: `/health`.

## Authentication

Every authenticated request carries a Supabase access token:

```
Authorization: Bearer <supabase access_token>
```

Both token formats are handled automatically:

* **Asymmetric (default for new projects)** — verified against
  `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`, keys cached in-process.
* **Legacy HS256** — verified with `SUPABASE_JWT_SECRET`.

The token's `sub` claim is looked up in `public.profiles`, which pins the user to exactly one
tenant. Every query is filtered by that `tenant_id`, so a token from firm A can never read
firm B's rows. If the profile row is missing (for example the SQL trigger was never
installed), the API provisions it from the token's user metadata on first request.

## Configuration

See `.env.example`. The two that matter:

* `DATABASE_URL` — Supabase **transaction pooler** string (port `6543`). The direct
  `db.<ref>.supabase.co` host is IPv6-only and unreachable from a Space. Prepared
  statements are disabled automatically when port 6543 is detected.
* `SUPABASE_URL` — used for JWKS verification.

## Deploy to Hugging Face

```bash
# 1. Create a Docker Space (Spaces -> New -> Docker -> Blank)
git clone https://huggingface.co/spaces/<user>/<space> hf-space
cp -r backend/* hf-space/          # this README carries the Space metadata header
cd hf-space && git add . && git commit -m "SpeedNum API" && git push
```

Then add the secrets from `.env.example` under **Settings → Variables and secrets** and set
`CORS_ORIGINS` / `PUBLIC_APP_URL` to your Vercel URL. The Space rebuilds and boots on 7860.

> Free Spaces sleep after inactivity; the first request after a sleep takes a few seconds
> while the container wakes.

## Run locally

```bash
cd backend
python -m venv .venv && .venv/Scripts/activate    # Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                              # fill in your Supabase values
uvicorn app.main:app --reload --port 8000
```

## Layout

```
app/
  main.py                 FastAPI app, CORS, error handling, router mounting
  config.py               env-driven settings
  db.py                   async engine (handles the Supavisor pooler quirks)
  security.py             Supabase JWT verification (JWKS + HS256)
  deps.py                 auth/tenant/role dependencies
  models.py               SQLAlchemy models mirroring db/migrations
  schemas.py              Pydantic request/response models
  utils.py                shared helpers
  services/
    deadlines.py          compliance-calendar engine (CRA-style due-date rules)
    audit.py              audit trail + notifications
    email.py              Resend delivery with a logging fallback
  routers/                one module per feature area
```

The deadline engine is pure date arithmetic — periods are derived from each client's fiscal
year end, due dates from the service's `due_rule`, and results roll forward to the next
business day past weekends and Canadian statutory holidays.
