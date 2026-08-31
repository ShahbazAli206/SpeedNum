# SpeedNum — Architecture

Current state as of the `migration/portable-production-architecture` branch. For
step-by-step deployment commands see [`DEPLOYMENT.md`](DEPLOYMENT.md); for the session-by-
session history of how this came to be, see [`PROGRESS.md`](PROGRESS.md).

## Diagram

```
                              Internet
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │   Vercel (Next.js)      │  https://syedi.spidnums.com
                    │   frontend, unchanged   │  (spidnums.com/www planned, not yet cut over)
                    └────────────┬───────────-┘
                                 │ bearer JWT (this app's own, EdDSA-signed) +
                                 │ first-party sn_refresh/sn_access cookies
                                 │ (see "Authentication" below — why two cookie
                                 │  domains are involved)
                                 ▼
                    ┌────────────────────────┐
                    │  Hostinger VPS          │  2.25.108.16
                    │  ┌──────────────────┐   │
                    │  │ Caddy :80/:443    │◄──── the ONLY public entry point on this host
                    │  │ (auto TLS)        │   │
                    │  └─────────┬────────-┘   │
                    │            │ web network │
                    │  ┌─────────▼────────-┐   │
                    │  │ FastAPI (api)     │   │  no host port published — owns auth too now
                    │  │ 4 uvicorn workers │   │  (services/local_auth.py)
                    │  └───┬──────────┬────┘   │
                    │      │ internal │ web    │  ("internal" = compose-project-private
                    │      │ network  │ network │   bridge; postgres never joins "web")
                    │  ┌───▼──────┐ ┌─▼──────-┐ │
                    │  │ Postgres │ │ MinIO   │  │  neither publishes a host port. Postgres
                    │  │   16     │ │ (S3 API)│  │  now also holds auth_credentials/
                    │  └──────────┘ └─────────┘ │  auth_refresh_tokens/auth_email_tokens
                    └────────────────────────┘
```

Supabase is no longer in this diagram at all: Postgres, Storage, and (as of this branch) Auth
are all self-hosted. `AUTH_PROVIDER=supabase` and `STORAGE_PROVIDER=supabase` remain as
documented, inactive-by-default rollback paths — see [`SECURITY.md`](SECURITY.md)'s
"Authentication decision" — not deleted, just not the default.

## Services and where they run

| Service | Where | Public? | Notes |
|---|---|---|---|
| Frontend (Next.js) | Vercel | Yes (`syedi.spidnums.com`) | Also hosts the auth BFF routes under `/api/auth/*` — see below |
| Reverse proxy (Caddy) | VPS, Docker | Yes (80/443, auto TLS) | Predates this app; shared `web` network |
| Backend API (FastAPI) | VPS, Docker (`speednum-api`) | No — reached only via Caddy | 4 workers (`WEB_CONCURRENCY=4`), no host port; owns authentication |
| Database (Postgres 16) | VPS, Docker (`speednum-postgres`) | No | `internal` network only, connects as a non-superuser app role |
| Object storage (MinIO) | VPS, Docker (`speednum-minio`) | No (S3 API only reachable via Caddy path route) | Private bucket, no anonymous policy |

## Authentication

Self-hosted (`backend/app/services/{password_hash,jwt_keys,local_auth}.py`): Argon2id
passwords, Ed25519 (EdDSA)-signed access tokens (15 min default), rotating hashed refresh
tokens with reuse detection. Full detail and what was verified: [`SECURITY.md`](SECURITY.md)'s
"Authentication decision" section.

**Why the frontend has its own `/api/auth/*` routes, not just calls to the backend directly:**
the refresh token lives in an HttpOnly cookie scoped to the API's own domain
(`test.spidnums.com`). A cookie is never readable across origins — not by JavaScript, and not by
a *different origin's server* — so Next.js Server Components running on Vercel could never see
it if the browser talked to the backend directly. `frontend/src/app/api/auth/{register,login,
logout,refresh,magic-login,session}/route.ts` run server-side on Vercel, call the FastAPI
backend themselves, and re-mint the tokens as first-party cookies on *this* domain — which both
Server Components (`lib/api-server.ts`, via `next/headers`) and the browser's next same-site
request can then read normally. Ordinary data calls (`lib/api.ts`) are unaffected by any of
this: an `Authorization: Bearer` header has no cross-origin cookie restriction, so they keep
talking to the backend directly, exactly as before Supabase was removed.

## Request paths

- **Data/API calls**: browser → Vercel-served JS → `https://api.spidnums.com` (target;
  currently `https://test.spidnums.com` — see [DNS status](#dns) below) → Caddy → FastAPI →
  Postgres.
- **Document upload/download**: browser gets a presigned URL from the API (which decides
  authorization first), then talks to MinIO **directly** — bytes never pass through FastAPI.
  Presigned URLs are signed for `https://<hostname>/documents/...` (path-style S3; matched by
  Caddy on the bucket name itself, not a distinguishing prefix — see the comment in
  `deploy/Caddyfile.example` for why a prefix-and-strip approach doesn't work with SigV4).
- **Login/signup/session**: browser → Vercel's own `/api/auth/*` routes (same-origin) → FastAPI
  backend → Postgres. See "Authentication" above for why this extra hop exists.

## Environment variables

Full templates with comments: [`deploy/.env.example`](deploy/.env.example) (compose-level
interpolation — Postgres/MinIO credentials), [`deploy/api.env.example`](deploy/api.env.example)
(container env — auth, storage provider, email, CORS), and
[`frontend/.env.example`](frontend/.env.example) (the two `NEXT_PUBLIC_*` vars). The short
version:

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | built by `docker-compose.yml` from `.env` | Points at VPS Postgres by default; a commented rollback string points at Supabase's pooler instead |
| `STORAGE_PROVIDER` | `api.env` | `s3` (MinIO, current) or `supabase` (rollback) |
| `S3_ENDPOINT_URL` / `S3_PUBLIC_ENDPOINT_URL` | `api.env` | Internal vs. browser-facing MinIO endpoint — see the comment in `storage_s3.py` for why they differ |
| `AUTH_PROVIDER` | `api.env` | `local` (current) or `supabase` (rollback) |
| `JWT_PRIVATE_KEY` | `api.env` | Base64-encoded Ed25519 private key — required for `AUTH_PROVIDER=local` in any real deployment |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | `api.env` | Only read when `AUTH_PROVIDER=supabase` or `STORAGE_PROVIDER=supabase` |
| `MIGRATIONS_SKIP` | `api.env` | `0002_rls` when targeting a Postgres with no colocated Supabase project |
| `CORS_ORIGINS` | `api.env` | The exact Vercel origin — never `*` in production |
| `NEXT_PUBLIC_API_URL` | Vercel dashboard | The API's public HTTPS hostname — **never** the VPS's bare IP |

## Ports

| Port | Service | Exposure |
|---|---|---|
| 22 | SSH | Public (UFW-allowed) |
| 80 | Caddy (HTTP→HTTPS redirect) | Public |
| 443 (tcp+udp) | Caddy (HTTPS/HTTP3) | Public |
| 8000 | FastAPI | Docker-internal only (`web` network), no host binding |
| 5432 | Postgres | Docker-internal only (`internal` network), no host binding, **never publish this** |
| 9000 | MinIO S3 API | Docker-internal only, reached by Caddy via the `web` network, no host binding |
| 9001 | MinIO console | Disabled entirely (`MINIO_BROWSER=off`) |
| 2019 | Caddy admin API | Not published at all |

## DNS

| Record | Points at | Status |
|---|---|---|
| `test.spidnums.com` A | `2.25.108.16` | Live, pre-existing, used for staging validation |
| `api.spidnums.com` A | `2.25.108.16` | **Not created** — needs Hostinger DNS access this environment doesn't have. Caddy's config already has a ready-to-uncomment block for it (`deploy/Caddyfile.example`) |
| `@`/`www` | Vercel / old site | Unchanged — production cutover is a separate, later, explicitly-approved step |
| MX / SPF / DKIM / DMARC | Hostinger / Resend | Unchanged, not touched by this migration |

## Portability

Nothing in application code references `2.25.108.16` or any Hostinger-specific API — every
host reference is a DNS name or a Docker Compose service name (`postgres`, `minio`,
`speednum-api`), configured entirely through environment variables. See
[`MIGRATION.md`](MIGRATION.md) for the procedure to move this whole stack to a different VPS
or provider.
