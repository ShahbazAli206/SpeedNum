# SpeedNum — Deployment Runbook & Configuration

> **Purpose:** single source of truth for deploying and continuing this project from
> any machine or new session. Everything here is safe to commit. **Live secrets are NOT
> here** — they live in `DEPLOYMENT.secrets.local.md` (gitignored, local-only) and in each
> platform's own dashboard. Each secret below says where to retrieve it.

**Last updated:** 2026-08-15

> **Backend host note:** Hugging Face was the original plan and is ruled out — Docker Spaces
> now need a paid PRO plan **and** block every outbound port except 80/443/8080, which breaks
> the port-6543 Supabase connection. **Render** (free tier) works and is documented below as
> the PaaS option. The **current target is a Hostinger KVM 4 VPS** — see the runbook at the
> end of this file; everything it needs is in [`deploy/`](deploy/).

---
hi

## ⏸️ RESUME HERE (picking up on another machine)

**Done:** ✅ Frontend on Vercel · ✅ Supabase database + auth.
**Next:** deploy the backend to **Render** — this is **Step 3** below.

On a fresh PC:
1. `git lfs install` then `git clone https://github.com/ShahbazAli206/SpeedNum.git` (LFS media
   isn't needed for deployment; a plain clone is fine).
2. Follow **Step 3 (Render)** below — the port-agnostic `backend/Dockerfile` is already pushed.
3. You need **one secret that is not in git**: the Supabase **DB password** (for `DATABASE_URL`).
   Use the password saved when the project was created, or reset it at
   **Supabase → Settings → Database → Reset database password**.
4. Paste this into Render's Environment (swap `<db-password>` for the real one):
   ```
   DATABASE_URL=postgresql://postgres.xftnqkmakeaqaandxyei:<db-password>@aws-0-ca-central-1.pooler.supabase.com:6543/postgres
   SUPABASE_URL=https://xftnqkmakeaqaandxyei.supabase.co
   PUBLIC_APP_URL=https://speed-num.vercel.app
   CORS_ORIGINS=https://speed-num.vercel.app
   ENVIRONMENT=production
   ```
5. For the final Vercel wiring (Step 4) you'll also need the Supabase **anon** key (public-safe):
   Supabase → Settings → API Keys → `anon` `public`.

---

## Architecture

Target: this app's own Postgres, storage, and (as of this branch) authentication, all on the
VPS. Supabase is no longer required for normal operation — see [`SECURITY.md`](SECURITY.md)'s
"Authentication decision" for why an earlier pass recommended keeping Supabase Auth and why
that call was later reversed.

```
Vercel (Next.js 16 frontend)  ──bearer JWT──▶  Caddy :443 ──▶ Docker: FastAPI (uvicorn ×4)
   │ (own /api/auth/* BFF routes —                                    │        │
   │  see ARCHITECTURE.md for why)                                    ▼        ▼
   └──────────────────────────────────────────────────────────▶ Postgres    MinIO
                                                                  (both VPS-local,
                                                                   Docker-internal only,
                                                                   Postgres now also
                                                                   holds credentials/
                                                                   sessions/tokens)
```

Rollback path (unchanged code, config-only): `DATABASE_URL` back to the Supabase pooler string,
`STORAGE_PROVIDER=supabase`, `AUTH_PROVIDER=supabase` — see `deploy/api.env.example`.

- **Frontend** — `frontend/`, Next.js 16.3 / React 19, Tailwind 4. Talks to the backend for all
  data via bearer token, and to its own `/api/auth/*` routes for login/register/refresh/logout
  (see `ARCHITECTURE.md`'s "Authentication" section for why those routes exist). Runs in **demo
  mode** (sample data, auth off) when `NEXT_PUBLIC_API_URL` is absent — so it deploys and renders
  before the backend exists.
- **Backend** — `backend/`, FastAPI in Docker. Listens on `$PORT` (falls back to 7860) with
  `WEB_CONCURRENCY` uvicorn workers. Connects directly to Postgres via `asyncpg`.
  **Crashes on boot if `DATABASE_URL` is unset.**
- **Database** — the VPS's own Postgres container (see the VPS runbook below). Schema lives in
  `db/migrations/`; the Supabase-only statements in it (RLS policies, the `auth.users` signup
  trigger) are guarded to skip on a plain Postgres instance — see "Applying migrations" below.
  Supabase Postgres remains supported as a rollback target (same migrations, same code) via
  `DATABASE_URL` alone.
- **Storage** — the VPS's own MinIO, behind the same Caddy reverse-proxying the API (never a
  publicly exposed port) — see `STORAGE_PROVIDER` in `deploy/api.env.example` and
  `backend/app/services/storage_s3.py`. Supabase Storage remains supported as a rollback target
  via `STORAGE_PROVIDER=supabase`.
- **Auth** — self-hosted (`AUTH_PROVIDER=local`): Argon2id passwords, Ed25519-signed access
  tokens, rotating hashed refresh tokens with reuse detection — see
  `backend/app/services/{password_hash,jwt_keys,local_auth}.py` and `SECURITY.md`'s
  "Authentication decision" for the full design and what was verified against the live
  deployment. Supabase Auth remains supported as a rollback target via `AUTH_PROVIDER=supabase`.
- **Email** — SMTP or Resend, selected by `EMAIL_PROVIDER`. Carries every credential email
  *and* now also verification/reset/magic-link emails (previously Supabase's job) — see
  [Email delivery](#email-delivery).

---

## Status

| Layer | Status | URL / location |
|---|---|---|
| Frontend (Vercel) | ✅ **Deployed** (demo mode until env vars added) | https://speed-num.vercel.app |
| Database (VPS Postgres) | ⬜ pending first deploy — compose service ready in [`deploy/`](deploy/); migrations run clean from empty (see below) | Docker-internal only, via the `api`/`migrate` services |
| Database (Supabase, rollback target) | 🔴 **BLOCKER if used directly — migrations `0005`–`0007` not applied there.** `0005` adds `profiles.must_change_password`, which `deps.py` reads on *every authenticated request*: until it is applied, every signed-in request against this database 500s. Apply with the runner below. (`0001`–`0004` done: 22 tables, trigger + RLS; auth configured, ES256 signing) | `https://xftnqkmakeaqaandxyei.supabase.co` · Canada Central (`ca-central-1`) |
| Object storage (VPS MinIO) | ⬜ pending first deploy — compose service ready in [`deploy/`](deploy/) | Docker-internal + Caddy-proxied `/storage-api/*` only |
| Backend (Hostinger VPS) | ⬜ pending first deploy — image, compose, Caddy site config and deploy script ready in [`deploy/`](deploy/) | `https://test.spidnums.com` (staging; `api.spidnums.com` pending a DNS record) |
| Email | ⬜ pending — transport ready (SMTP or Resend); needs credentials + a real `EMAIL_FROM` | verify via `GET /api/v1/settings/email` |

---

## Platform configuration

### Vercel (frontend)

| Setting | Value |
|---|---|
| Team | `sasuperlinecer206-2232s-projects` (Hobby) |
| Project name | `speed-num` |
| Production URL | `https://speed-num.vercel.app` |
| **Root Directory** | **`frontend`** ← critical (monorepo; do NOT deploy the backend on Vercel) |
| Framework preset | Next.js |
| Build / Output | defaults (`next build`) |
| Source repo | `github.com/ShahbazAli206/SpeedNum`, branch `main` |

**Frontend env vars** — set under Project → Settings → Environment Variables (Production + Preview),
then redeploy. Template: [`frontend/.env.example`](frontend/.env.example). All are browser-exposed
(`NEXT_PUBLIC_`) and safe; the Supabase anon key is meant to be public.

| Var | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xftnqkmakeaqaandxyei.supabase.co` | from Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key (see secrets file) | from Supabase |
| `NEXT_PUBLIC_API_URL` | `https://<service>.onrender.com` | Render service root, **no** trailing `/api/v1` |
| `NEXT_PUBLIC_SITE_URL` | `https://speed-num.vercel.app` | this Vercel domain |

> ⚠️ If `NEXT_PUBLIC_API_URL` is left unset in production the app silently falls back to
> `http://localhost:8000` (dead in prod) and degrades to demo data — no error is shown.

### Supabase (database + auth)

| Setting | Value |
|---|---|
| Organization | `speednum` (Free) |
| Project name | `speednum` · ref `xftnqkmakeaqaandxyei` |
| Region | Canada Central (`ca-central-1`) |
| Data API | enabled · auto-expose new tables **off** · auto-RLS **off** |
| JWT signing | ES256 asymmetric (JWKS) — backend verifies via `SUPABASE_URL`, no JWT secret needed |
| Auth URLs | Site URL + redirect `https://speed-num.vercel.app/**` set; Confirm-email OFF for testing |
| Keys / DB password / connection string | → `DEPLOYMENT.secrets.local.md` |

Extensions (both default-on in Supabase, created by `0001`): `pgcrypto`, `citext`.

### Render (backend)

| Setting | Value |
|---|---|
| Service type | **Web Service**, runtime **Docker** |
| Repository | `github.com/ShahbazAli206/SpeedNum` (connect via GitHub; no token stored) |
| **Root Directory** | **`backend`** ← so Render uses `backend/Dockerfile` |
| Branch | `main` (auto-deploy on push) |
| Instance type | **Free** |
| Health check path | `/health` |
| Port | auto — container reads Render's `$PORT` (Dockerfile falls back to 7860 elsewhere) |
| Free-tier behavior | sleeps after 15 min idle, ~30–60s cold start; 750 instance-hrs/workspace/month |

**Backend env vars** — set under Render → service → **Environment**. Template:
[`backend/.env.example`](backend/.env.example). Values are in the secrets file.

| Var | Value | Required? |
|---|---|---|
| `DATABASE_URL` | transaction-pooler string, **port 6543** (format below) | ✅ **fatal if missing** |
| `SUPABASE_URL` | `https://xftnqkmakeaqaandxyei.supabase.co` | ✅ (JWT verification via JWKS) |
| `PUBLIC_APP_URL` | `https://speed-num.vercel.app` | ✅ (else email/sign links point at localhost) |
| `CORS_ORIGINS` | `https://speed-num.vercel.app` | ✅ **required** (see note) |
| `CORS_ORIGIN_REGEX` | blank, or `https://speed-num[a-z0-9-]*\.vercel\.app` | only if Vercel **preview** deploys must reach the API |
| `ENVIRONMENT` | `production` | recommended |
| `LOG_LEVEL` | `INFO` | optional |
| `SUPABASE_JWT_SECRET` | **blank** | project is ES256/asymmetric (JWKS has an ES256 key). Only set if backend 401/500s on valid logins. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` | ✅ **required to create any login.** See below. |
| `SUPABASE_ANON_KEY` | blank OK | not read by the backend |
| `RESEND_API_KEY` / `EMAIL_FROM` | blank OK, but see below | blank → emails are **logged, not sent** |
| `JWT_AUDIENCE` | (unset) | defaults to `authenticated`; only set if changed in Supabase |
| `REMINDER_SCHEDULER_ENABLED` | `true` | in-process daily reminder sweep. Set `false` only if an external cron drives `/admin/reminders/sweep`, or if you run >1 replica. |
| `REMINDER_SWEEP_HOUR` | `6` | hour (UTC) of the daily sweep |
| `REMINDER_SWEEP_ON_START` | `true` | also sweep ~30s after boot, so a fresh deploy populates the board immediately |

> **`SUPABASE_SERVICE_ROLE_KEY` is load-bearing.** It was previously documented as
> "declared but unused" — that is no longer true. `backend/app/services/supabase_admin.py`
> uses it to create Supabase Auth users, so **without it every one of these returns
> HTTP 424** and no account can be created at all:
> `POST /team` (add accountant) · `POST /users` (add user) · `POST /clients/{id}/portal-invite`
> · `POST /import/users/commit` (bulk user import) · every `resend-credentials` route.
>
> It also signs document storage: `POST /client-portal/documents/upload-url` and
> `GET /client-portal/documents/{id}/download-url` both return 424 without it, so **no file
> can be uploaded or opened**. See the storage note below.
> It is a **secret** — it bypasses row-level security. Never expose it to the frontend.

> **Document storage.** The `documents` bucket is created private by `0003_functions.sql`
> with no policies on `storage.objects`, and Supabase enables RLS there by default — so a
> browser holding only a user's anon-role session is denied every storage operation. The API
> therefore signs upload and download URLs itself with the service-role key, after checking
> the caller against the same tenant/portal rules the rest of the documents router uses;
> the bytes still travel browser↔Supabase directly and never through the API. **No storage
> policies need to be created.** If you add any later, they are defense-in-depth, not a
> prerequisite.

> **Email.** Without `RESEND_API_KEY` the API logs `[email:dry-run] to=… subject=…` and
> `send_email` returns `False`. Nothing breaks — account creation still succeeds and the
> UI shows the temporary password on screen so an admin can pass it on by hand — but no
> credential emails, portal welcomes or reminder digests are delivered. Set it before
> telling a real client to check their inbox.

`DATABASE_URL` format (Supabase → Settings → Database → Connection string → **Transaction pooler**):
```
postgresql://postgres.xftnqkmakeaqaandxyei:<db-password>@aws-0-ca-central-1.pooler.supabase.com:6543/postgres
```
> Use the **port-6543 pooler**, never the direct `db.<ref>.supabase.co` host (IPv6-only,
> unreachable from most hosts). The backend auto-detects `:6543` and disables prepared statements.
> Render allows outbound 6543 (only SMTP ports 25/465/587 are blocked).

> **CORS note:** the backend used to carry a standing `https://.*\.vercel\.app` regex, which
> made `CORS_ORIGINS` optional — at the cost of letting **anyone else's** Vercel project call
> this API from a browser. That regex is gone. Set `CORS_ORIGINS` to the frontend's exact
> origin. If preview deployments also need the API, set `CORS_ORIGIN_REGEX` scoped to your own
> project name rather than to all of `vercel.app`. Leaving `CORS_ORIGINS` at its `*` default in
> production still works but logs a warning at every boot.

---

## Deployment order (why)

There's a dependency cycle; this order breaks it:

1. **Vercel first** → produces `speed-num.vercel.app`, needed by Supabase (redirect URLs) and the backend (CORS). ✅ done
2. **Supabase** → produces project URL, anon key, DB connection string. Blocks the backend (can't
   boot without `DATABASE_URL`) and the frontend's auth. ✅ done
3. **Backend host** (Hostinger VPS — see the runbook below; or Render) → needs Supabase's
   `DATABASE_URL` + `SUPABASE_URL` and the Vercel URL for CORS. Produces the API base URL.
4. **Migrations** → `baseline 0004` then `apply`, from the deployed container. Must happen before
   anyone signs in: without `0005` every authenticated request 500s. See
   [Applying migrations](#applying-migrations).
5. **Email** → set `EMAIL_FROM` to a domain you control plus one transport (SMTP or Resend), then
   prove it with `POST /api/v1/settings/email/test`. See [Email delivery](#email-delivery).
6. **Back to Vercel** → paste the 4 `NEXT_PUBLIC_*` vars (Supabase + API URL + site URL),
   redeploy → real data. Env vars only take effect on a new build.
7. **First superadmin** → the manual SQL below, to unlock `/admin`.

---

## Step-by-step

### 1. Vercel — ✅ done
Imported repo, Root Directory = `frontend`, deployed. Live at `speed-num.vercel.app` (demo mode).

### 2. Supabase — ⚠️ partially done
Project created; migrations `0001`–`0004` applied via SQL (22 tables, RLS, `on_auth_user_created`
trigger, `documents` bucket); Email auth on, Site/redirect URLs set, Confirm-email off; anon +
service-role keys and the port-6543 `DATABASE_URL` captured in the secrets file.

**Still to apply — four migrations landed after that session and are not on the database yet.**
Run them in the SQL Editor, in this order:

| Migration | What breaks without it |
|---|---|
| `0005_client_portal_invite.sql` | 🔴 **Everything.** It adds `profiles.must_change_password` and the `clients.portal_invited_*` columns, which `app/models.py` already selects — so *any* request that loads a profile errors until this is applied, not just portal invites. |
| `0006_engagement_letter_signing.sql` | Engagement-letter e-signature — the whole dual-signature flow and its stored signature data |
| `0006_task_type.sql` | Task Master's task-type column (`internal` / `client` / `other`) |
| `0007_reminders.sql` | `/reminders` errors into an empty board, and the daily sweep logs a failure every day |

> Two files share the number `0006`. They touch different tables and alphabetical order is a
> valid order, so applying them as listed is correct.
>
> All four guard their DDL (`add column if not exists`, `create type` inside a
> `duplicate_object` handler), so re-running one is safe rather than an error if you lose
> track of which have been applied.
>
> One caveat: `0006_task_type.sql` ends with a **backfill**, not just DDL —
> `update public.tasks set task_type = 'client' where client_id is not null`. That is not a
> no-op on a second run: it would overwrite any task whose type a user had since changed by
> hand. Harmless on a fresh database (no rows yet); worth knowing before re-running it on a
> populated one.

### 3. Render — backend (current step)
Prereq: the port-agnostic `backend/Dockerfile` must be pushed to `main` on GitHub.
1. Sign in to **https://render.com** with **GitHub** (no card needed for the free tier).
2. **New → Web Service** → connect the `ShahbazAli206/SpeedNum` repo.
3. Configure:
   - **Root Directory:** `backend`
   - **Runtime/Language:** Docker (auto-detected from `backend/Dockerfile`)
   - **Branch:** `main`
   - **Instance Type:** **Free**
   - **Health Check Path:** `/health`
4. Add **Environment** variables (see table above; values from the secrets file): `DATABASE_URL`,
   `SUPABASE_URL`, **`SUPABASE_SERVICE_ROLE_KEY`**, `PUBLIC_APP_URL`, `CORS_ORIGINS`,
   `ENVIRONMENT=production`.
   > Do not skip the service-role key. Without it the service boots and `/health` is green,
   > but no login can be created and no document can be uploaded or opened — every one of
   > those routes returns 424. The startup log warns about this and about a missing
   > `RESEND_API_KEY`, a wildcard `CORS_ORIGINS`, and a localhost `PUBLIC_APP_URL`.
5. **Create Web Service** → wait for the Docker build + first boot.
6. Verify `https://<service>.onrender.com/health` returns `{"status":"ok","database":"ok",...}`.
   Interactive docs at `/docs`. (First request after idle takes ~30–60s to wake.)

### 4. Back to Vercel — connect it all
1. Project → Settings → Environment Variables → add the 4 `NEXT_PUBLIC_*` vars (values now known;
   `NEXT_PUBLIC_API_URL` = the Render URL).
2. **Redeploy** (Deployments → ⋯ → Redeploy). Env vars only take effect on a new build.
3. Sign up at `https://speed-num.vercel.app/signup` with a firm name → the trigger provisions your tenant.

### 5. First superadmin (manual — undocumented in repo)
No migration/seed grants superadmin. After signing up, find your user UUID in
Supabase → Authentication → Users, then run in SQL Editor:
```sql
update public.profiles set is_superadmin = true where id = '<your-auth-uid>';
```
This unlocks `/admin` (the cross-tenant platform console).

---

## Where every secret lives (for a fresh machine / new session)

Nothing secret is in git. To continue elsewhere, retrieve from the source of truth:

| Secret | Source of truth |
|---|---|
| Supabase DB password | resettable in Supabase dashboard; also inside Render's `DATABASE_URL` env var |
| Supabase URL / anon / service-role keys | Supabase → Settings → API Keys |
| `DATABASE_URL` | Supabase → Settings → Database → Transaction pooler; also stored in Render env vars |
| Vercel frontend env vars | Vercel → Project → Settings → Environment Variables |
| Render backend env vars | Render → service → Environment |
| Local convenience copy of all the above | `DEPLOYMENT.secrets.local.md` (this machine only) |

Render connects to GitHub via in-browser OAuth — no personal access token needs to be stored.

---

## Gotchas (from the code audit)

- Backend **crashes on boot** with no `DATABASE_URL` (raised at import time in `backend/app/db.py`).
- Frontend with no `NEXT_PUBLIC_API_URL` **silently** targets `localhost:8000` and shows demo data.
- Frontend with no Supabase vars runs fully **unauthenticated** ("demo mode") — `proxy.ts` lets every
  route through by design. Set the Supabase vars to switch auth on.
- `db/migrations/0004` applied cleanly on 2026-08-10 (was previously untested).
- Use the **port-6543 pooler** for `DATABASE_URL`, never the direct `db.<ref>` host (IPv6-only).
- `SUPABASE_SERVICE_ROLE_KEY` **is** required now — see the env table. (This line previously
  said it was unused; that was true only before the account-provisioning work landed.)
- Render free tier sleeps after 15 min idle (~30–60s cold start) — expected, the app tolerates it.
  **Note:** a sleeping instance also means the in-process reminder scheduler does not fire.
  On a VPS this stops being a concern; on a sleeping free tier, drive
  `POST /admin/reminders/sweep` from an external cron instead.
- **`EMAIL_FROM` must be changed.** The default `onboarding@resend.dev` is Resend's shared
  sandbox and only delivers to the Resend account owner — every client and staff credential
  email silently goes nowhere. `GET /api/v1/settings/email` flags it.
- Port **25 is blocked** on Hostinger VPS. Use SMTP 465/587, or Resend over HTTPS.
- With `WEB_CONCURRENCY > 1` each worker runs its own reminder scheduler; a Postgres advisory
  lock means only one sweeps. Leave `REMINDER_SCHEDULER_ENABLED=true`.
- Hugging Face was ruled out: Docker Spaces now need PRO and block outbound port 6543.
- **Migrations `0005`–`0007` must be applied before the app works at all** — `0005` adds
  `profiles.must_change_password`, read on every authenticated request. `0006` adds the
  engagement-letter signing columns and `tasks.task_type`; `0007` creates `reminders`,
  without which `/reminders` errors (the frontend swallows it into an empty board) and the
  scheduler logs a failed sweep daily. See [Applying migrations](#applying-migrations).

---
## Hostinger KVM 4 VPS — backend runbook

The Dockerfile is host-agnostic (non-root uid 1000, `CMD` expands `${PORT}`, `HEALTHCHECK`
on `/health`), so nothing in the image changes to move here. Everything a VPS needs that a
PaaS supplied for free lives in [`deploy/`](deploy/):

| File | What it is |
|---|---|
| [`deploy/docker-compose.yml`](deploy/docker-compose.yml) | `api`, `postgres`, `minio` (+ `minio-init`), `migrate` — see below |
| [`deploy/.env.example`](deploy/.env.example) | Shared secrets compose itself interpolates → copy to `deploy/.env` (gitignored) |
| [`deploy/api.env.example`](deploy/api.env.example) | Container-only env template → copy to `deploy/api.env` (gitignored) |
| [`deploy/Caddyfile.example`](deploy/Caddyfile.example) | The site block to add to the VPS's existing Caddy — **not** part of this compose project |
| [`deploy/deploy.sh`](deploy/deploy.sh) | Pull, rebuild, restart, **and verify `/health` came back** |

> **Why Caddy, not nginx+certbot.** An earlier version of this runbook stood up nginx+certbot
> for TLS. That was written before the VPS itself existed; the actual VPS (see the quick
> reference in the architecture doc) already runs Caddy in Docker at
> `/home/deploy/apps/caddy`, owning ports 80/443/443-udp, with a working cert for
> `test.spidnums.com`. Installing nginx alongside it would fight over those same ports for no
> benefit — Caddy already does everything nginx+certbot was there for (TLS termination, reverse
> proxy, auto-renewal), so this app's compose project joins Caddy's existing `web` Docker
> network instead of running its own reverse proxy.

### Why each piece is there

- **`postgres` and `minio` are not published on the host.** Only `api` (and, transitively,
  `minio` — see below) join the `web` network Caddy is on; postgres lives on a project-private
  `internal` network nothing outside this compose project can reach. Never add a `ports:`
  mapping to either.
- **`minio` joins `web` too, but still publishes no host port.** Caddy needs to reach it by
  container name to proxy presigned-URL traffic (`/storage-api/*`, see the Caddyfile) — that
  requires sharing a Docker network with Caddy, not a host port. Reaching it over that shared
  bridge still requires a valid signed S3 request; the bucket has no anonymous policy.
- **`WEB_CONCURRENCY=4`** uses the KVM 4's four vCPUs. Each worker is a separate process running
  its own copy of the reminder scheduler, so `services/scheduler.py` takes a Postgres advisory
  lock (`pg_try_advisory_xact_lock`) before sweeping — the losers skip the tick rather than
  queueing behind the winner and re-running it.
- **`restart: unless-stopped` + log rotation** on every service. Unrotated Docker logs grow
  until they fill the disk, which takes the database down with everything else.
- **The scheduler actually works here.** A VPS container does not sleep, so the daily sweep at
  `REMINDER_SWEEP_HOUR` fires reliably and no external cron is needed — unlike the Render free tier.
- **Two separate env files.** `api.env`'s `env_file:` entries are passed straight through with no
  interpolation, so a shared secret like the Postgres password cannot be written once there and
  reused — `.env` is compose's own top-level file, auto-loaded to interpolate `${VAR}` inside
  `docker-compose.yml` itself, which is how `DATABASE_URL` and the S3 credentials get built from
  one value instead of two pasted in two places. See the comments in both `.env.example` and
  `api.env.example`.

### Steps

Prerequisites: Docker already installed (it is — see the architecture doc's VPS quick
reference), and the existing Caddy container reachable on the `web` Docker network.

```bash
# 1. Get the code.
# GIT_LFS_SKIP_SMUDGE=1 because the repo carries ~619 MB of demo media in LFS
# (a screen recording and a zip) that the server has no use for. GitHub's free
# tier allows 1 GB of LFS bandwidth per month, so a plain clone spends most of
# it — and every later `git pull` would spend more. The fetchexclude makes that
# permanent for this checkout. CI skips LFS for the same reason.
sudo mkdir -p /opt/speednum && sudo chown "$USER" /opt/speednum
GIT_LFS_SKIP_SMUDGE=1 git clone https://github.com/ShahbazAli206/SpeedNum.git /opt/speednum
git -C /opt/speednum config lfs.fetchexclude "*"
cd /opt/speednum/deploy

# 2. Persistent data directories (bind mounts, so they survive
#    `docker compose down` and are reachable by the backup scripts).
mkdir -p /home/deploy/data/speednum/postgres /home/deploy/data/speednum/minio

# 3. Fill in secrets — two files, see the note above on why there are two.
cp .env.example .env && chmod 600 .env && nano .env
cp api.env.example api.env && chmod 600 api.env && nano api.env

# 4. Start it
docker compose up -d --build
# The api container publishes no host port (Caddy reaches it by container
# name over the `web` network instead), so check from inside the container:
docker compose exec -T api python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=5).read().decode())"

# 5. Create the least-privilege application role — ONE TIME per fresh
#    Postgres data directory, not on every deploy. See "Least-privilege
#    database role" below for why this step exists at all.
#    (Fill in POSTGRES_APP_USER/POSTGRES_APP_PASSWORD in .env first.)

# 6. Apply migrations against the fresh, empty VPS Postgres (see "Applying
#    migrations" below — this is a brand-new database, so it starts from
#    nothing rather than needing a `baseline` step).
docker compose run --rm migrate apply
docker compose run --rm migrate status  # expect "Schema is up to date."

# 7. Reverse proxy — add this app's site block to the VPS's existing Caddy
#    (a separate compose project; see deploy/Caddyfile.example for why).
scp Caddyfile.example deploy@2.25.108.16:/home/deploy/apps/caddy/Caddyfile
ssh deploy@2.25.108.16 'docker exec caddy caddy validate --config /etc/caddy/Caddyfile'
ssh deploy@2.25.108.16 'docker exec caddy caddy reload --config /etc/caddy/Caddyfile'
```

### Least-privilege database role

The official `postgres` Docker image makes `POSTGRES_USER` a full superuser at cluster init —
`rolsuper`/`rolcreatedb`/`rolcreaterole`/`rolreplication`/`rolbypassrls` all `true`, with no
image option to avoid it (confirmed by querying `pg_roles` on the live deploy). The
application must not run as this role — see [`SECURITY.md`](SECURITY.md). Instead, `api`/
`migrate` connect as a separate `POSTGRES_APP_USER` (`speednum_app` by default), created once
against a fresh data directory:

```bash
cd /home/deploy/apps/speednum/deploy
PG_PASS=$(grep POSTGRES_PASSWORD .env | cut -d= -f2)
APP_PASS=$(grep POSTGRES_APP_PASSWORD .env | cut -d= -f2)  # fill this in first

cat > /tmp/create_app_role.sql <<SQL
do \$\$
begin
  if not exists (select from pg_roles where rolname = 'speednum_app') then
    create role speednum_app with login password '${APP_PASS}';
  else
    alter role speednum_app with password '${APP_PASS}';
  end if;
end
\$\$;
alter database speednum owner to speednum_app;
grant all privileges on database speednum to speednum_app;
grant all on schema public to speednum_app;
grant all privileges on all tables in schema public to speednum_app;
grant all privileges on all sequences in schema public to speednum_app;
grant execute on all functions in schema public to speednum_app;
alter default privileges for role speednum_app in schema public grant all on tables to speednum_app;
alter default privileges for role speednum_app in schema public grant all on sequences to speednum_app;
alter default privileges for role speednum_app in schema public grant all on functions to speednum_app;
SQL
docker cp /tmp/create_app_role.sql speednum-postgres:/tmp/create_app_role.sql
docker exec -e PGPASSWORD="$PG_PASS" speednum-postgres psql -U speednum -d speednum -f /tmp/create_app_role.sql
rm -f /tmp/create_app_role.sql
docker compose up -d --build api migrate  # picks up POSTGRES_APP_USER/PASSWORD
```

`ALTER DATABASE ... OWNER TO` grants `speednum_app` implicit `CREATE` on the `public` schema
(via Postgres's `pg_database_owner` membership) so future migrations keep working without the
role ever being a superuser; the explicit `GRANT`s cover objects that already existed before
this role did. `REASSIGN OWNED BY` is deliberately **not** used here — it fails against objects
the `pgcrypto`/`citext` extensions created ("required by the database system"), and isn't
needed anyway once the grants above are in place.

Verify: `docker exec speednum-api python -c "..."` querying `select current_user` should report
`speednum_app`, and `pg_roles` should show all five privilege flags `f` for it (see
`SECURITY.md` for the exact commands run to confirm this on the live deploy).

Then point the frontend at it: set `NEXT_PUBLIC_API_URL=https://test.spidnums.com` on Vercel
(no trailing slash, no `/api/v1` — the client appends it; swap to `api.spidnums.com` once that
DNS record exists) and **redeploy**, since env vars only take effect on a new build. Add the
same origin to `CORS_ORIGINS` in `api.env` and `docker compose up -d` to pick it up.

Subsequent deploys: `cd /opt/speednum/deploy && ./deploy.sh`.

### Verify the deployment

```bash
curl https://test.spidnums.com/health        # {"status":"ok","database":"ok"}
```

Then, signed in as a firm admin (the token is in the browser's Supabase session):

```bash
curl -H "Authorization: Bearer $TOKEN" https://test.spidnums.com/api/v1/settings/email
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d '{}' https://test.spidnums.com/api/v1/settings/email/test
```

`GET /settings/email` reports the resolved transport and every misconfiguration it can detect
(no transport, sandbox sender, unauthenticated SMTP) without echoing any secret.
`POST /settings/email/test` sends a real message — default recipient is the caller — so
delivery is proven before a client is ever invited.

---

## Applying migrations

`db/migrations/*.sql` used to be pasted into the Supabase SQL editor by hand, which
works once per file and leaves no record of what ran. [`backend/scripts/migrate.py`](backend/scripts/migrate.py)
tracks them in `public.schema_migrations` instead, so "what schema is deployed" is a
question the database answers.

> **This project's Supabase instance has `0001`–`0004` applied and `0005`–`0007` not.**
> Baseline first — re-running the early files is *not* harmless, since `0002` issues bare
> `create policy` statements that error the second time. This only applies when running against
> that specific Supabase database — a fresh VPS Postgres (or a new Supabase project) starts
> empty and just needs `apply`, no baseline step.
>
> **`0001` and `0003` were edited after being applied to that Supabase instance** (removing the
> `profiles.id -> auth.users(id)` foreign key, and guarding the Supabase-only trigger/storage
> statements — see the architecture doc's "portable database requirements"). `migrate.py status`
> against that specific database will show `!! file changed since it was applied` for both —
> expected and harmless: it does not re-run anything or touch that database's actual schema,
> which is unaffected. Any new deployment (this VPS, or a fresh Supabase project) applies the
> current, portable file text from scratch.
>
> **`0002_rls.sql` is Supabase-only** (its `language sql` helper functions call `auth.uid()`,
> which does not exist on a plain Postgres instance, and its policies are `to authenticated`, a
> role that likewise only exists on a Supabase project). `0004`/`0007` also define RLS policies
> in the same style but guard them internally (skipped at runtime, not by file, when
> `to_regrole('authenticated')` is null) since each of those files has portable content too.
> `0002` has none, so it is skipped by name instead — set `MIGRATIONS_SKIP=0002_rls` in `api.env`
> when targeting Postgres with no colocated Supabase project (the VPS's own Postgres); leave it
> unset against Supabase, where `0002` keeps providing defence-in-depth RLS as before. See the
> comment at the top of `backend/scripts/migrate.py` for the reasoning: nothing but this
> application's own owner-role connection ever talks to Postgres on the VPS target, so those
> policies would have no consumer to protect even if they could be created.

From the VPS (reuses the API image, so the host needs no Python):

```bash
cd /opt/speednum/deploy
docker compose run --rm migrate status            # what is applied, what is pending
docker compose run --rm migrate baseline 0004     # ONE TIME: record 0001-0004 without running
docker compose run --rm migrate apply             # runs 0005, 0006 ×2, 0007
docker compose run --rm migrate status            # expect "Schema is up to date."
```

Locally, the same script with `DATABASE_URL` set: `python scripts/migrate.py status`.

- Each file runs in **its own transaction together with its tracking row**, so a failure
  leaves neither the change nor a record claiming success. Nothing after it is attempted.
- `status` flags a file whose **checksum changed after it was applied** — the database still
  has what the old text did.
- Both files numbered `0006` are kept as distinct versions and applied in a stable order.
  They touch different tables (`engagement_letters`, `tasks`), so the order between them
  does not matter.
- `deploy.sh` warns after a successful deploy if anything is still pending, because a missing
  column does not stop the API booting — it fails at the first request that touches it.

---

## Email delivery

Credential emails are already wired to every account-creating route: `POST /team`,
`POST /users`, `POST /clients/{id}/portal-invite`, `POST /import/users/commit` and both
`resend-credentials` routes all go through `services/accounts.py`, which creates the Supabase
Auth user and sends the matching template (`portal_welcome_html` for a client, the leaner
`staff_welcome_html` for an accountant). Both carry the email address, the one-time password
and a magic sign-in link.

**The only thing that stops them arriving is an unconfigured transport.** Pick one:

| | SMTP | Resend |
|---|---|---|
| Set | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD` | `RESEND_API_KEY` |
| On Hostinger | `smtp.hostinger.com:465` (hPanel → Emails) | — |
| Needs | a mailbox on your domain | a verified sending domain |
| From address | must usually match the authenticated mailbox | any address on the verified domain |

`EMAIL_FROM` must be an address on a domain you control. The shipped default
(`onboarding@resend.dev`) is Resend's shared sandbox and **only delivers to the Resend account
owner's own address** — leave it in place and no client or staff member ever receives their
credentials, with no error anywhere except the `email_sent: false` on the create response.

Port 25 is blocked on Hostinger VPS; 465 and 587 are open. Messages go out as
multipart/alternative with a generated text part, which matters because a credentials email
in a spam folder is the same as one never sent.

**With no transport configured nothing breaks.** `send_email` logs `[email:dry-run]` and
returns False, the account is still created, and the UI shows the temporary password on
screen for the admin to pass on by hand. That is the designed fallback, not a failure — but
it is not a way to run a firm.
