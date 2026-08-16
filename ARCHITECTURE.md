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
                    │   Vercel (Next.js)      │  https://speed-num.vercel.app
                    │   frontend, unchanged   │  (spidnums.com/www planned, not yet cut over)
                    └────────────┬───────────-┘
                                 │ bearer JWT (Supabase-issued)
                                 ▼
                    ┌────────────────────────┐
                    │  Hostinger VPS          │  2.25.108.16
                    │  ┌──────────────────┐   │
                    │  │ Caddy :80/:443    │◄──── the ONLY public entry point on this host
                    │  │ (auto TLS)        │   │
                    │  └─────────┬────────-┘   │
                    │            │ web network │
                    │  ┌─────────▼────────-┐   │
                    │  │ FastAPI (api)     │   │  no host port published
                    │  │ 4 uvicorn workers │   │
                    │  └───┬──────────┬────┘   │
                    │      │ internal │ web    │  ("internal" = compose-project-private
                    │      │ network  │ network │   bridge; postgres never joins "web")
                    │  ┌───▼──────┐ ┌─▼──────-┐ │
                    │  │ Postgres │ │ MinIO   │  │  neither publishes a host port
                    │  │   16     │ │ (S3 API)│  │  MinIO joins `web` too, ONLY so Caddy
                    │  └──────────┘ └─────────┘ │  can proxy /documents/* to it
                    └────────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │  Supabase (external)    │  Auth ONLY — https://<ref>.supabase.co
                    │  Auth (GoTrue)          │  Postgres/Storage NOT used for normal
                    └────────────────────────┘  operation; kept intact as rollback target
```

## Services and where they run

| Service | Where | Public? | Notes |
|---|---|---|---|
| Frontend (Next.js) | Vercel | Yes (`speed-num.vercel.app`) | Unchanged by this migration |
| Reverse proxy (Caddy) | VPS, Docker | Yes (80/443, auto TLS) | Predates this app; shared `web` network |
| Backend API (FastAPI) | VPS, Docker (`speednum-api`) | No — reached only via Caddy | 4 workers (`WEB_CONCURRENCY=4`), no host port |
| Database (Postgres 16) | VPS, Docker (`speednum-postgres`) | No | `internal` network only, connects as a non-superuser app role |
| Object storage (MinIO) | VPS, Docker (`speednum-minio`) | No (S3 API only reachable via Caddy path route) | Private bucket, no anonymous policy |
| Identity (Supabase Auth) | Supabase (external) | N/A | JWT issuer; verified via JWKS, no shared database |

## Request paths

- **Data/API calls**: browser → Vercel-served JS → `https://api.spidnums.com` (target;
  currently `https://test.spidnums.com` — see [DNS status](#dns) below) → Caddy → FastAPI →
  Postgres.
- **Document upload/download**: browser gets a presigned URL from the API (which decides
  authorization first), then talks to MinIO **directly** — bytes never pass through FastAPI.
  Presigned URLs are signed for `https://<hostname>/documents/...` (path-style S3; matched by
  Caddy on the bucket name itself, not a distinguishing prefix — see the comment in
  `deploy/Caddyfile.example` for why a prefix-and-strip approach doesn't work with SigV4).
- **Login/signup/session**: browser ↔ Supabase Auth directly (via `@supabase/ssr`), never
  through the VPS at all. The VPS-side API only *verifies* the resulting JWT (JWKS) and calls
  Supabase's admin API to provision/reset/delete logins server-side.

## Environment variables

Full templates with comments: [`deploy/.env.example`](deploy/.env.example) (compose-level
interpolation — Postgres/MinIO credentials), [`deploy/api.env.example`](deploy/api.env.example)
(container env — Supabase, storage provider, email, CORS), and
[`frontend/.env.example`](frontend/.env.example) (the four `NEXT_PUBLIC_*` vars). The short
version:

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | built by `docker-compose.yml` from `.env` | Points at VPS Postgres by default; a commented rollback string points at Supabase's pooler instead |
| `STORAGE_PROVIDER` | `api.env` | `s3` (MinIO, current) or `supabase` (rollback) |
| `S3_ENDPOINT_URL` / `S3_PUBLIC_ENDPOINT_URL` | `api.env` | Internal vs. browser-facing MinIO endpoint — see the comment in `storage_s3.py` for why they differ |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | `api.env` | Auth stays Supabase regardless of the two above |
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
