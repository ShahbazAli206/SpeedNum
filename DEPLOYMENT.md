# SpeedNum — Deployment Runbook & Configuration

> **Purpose:** single source of truth for deploying and continuing this project from
> any machine or new session. Everything here is safe to commit. **Live secrets are NOT
> here** — they live in `DEPLOYMENT.secrets.local.md` (gitignored, local-only) and in each
> platform's own dashboard. Each secret below says where to retrieve it.

**Last updated:** 2026-08-10

> **Backend host note:** the original plan was Hugging Face, but as of 2025/2026 HF Docker
> Spaces require a paid PRO plan **and** block all outbound ports except 80/443/8080 (which
> would break the port-6543 Supabase connection). Backend is therefore hosted on **Render**
> (free tier, Dockerfile as-is, allows outbound 6543, GitHub auto-deploy).

---

## Architecture

```
Vercel (Next.js 16 frontend)  ──bearer JWT──▶  Render Web Service (FastAPI, Docker)
        │                                                    │
        │                                                    ▼  asyncpg (transaction pooler :6543)
        └────────── Supabase Auth (sign-in, JWT) ──────▶  Supabase Postgres
```

- **Frontend** — `frontend/`, Next.js 16.3 / React 19, Tailwind 4, `@supabase/ssr` for auth only.
  Talks to the backend for all data via bearer token. Runs in **demo mode** (sample data, auth
  off) when its env vars are absent — so it deploys and renders before the backend exists.
- **Backend** — `backend/`, FastAPI, deployed as a **Render Web Service** from the `backend/`
  Dockerfile. Listens on `$PORT` (Render-injected; falls back to 7860). Connects directly to
  Postgres via `asyncpg`. **Crashes on boot if `DATABASE_URL` is unset.**
- **Database** — Supabase Postgres. Schema + RLS + the signup trigger live in `db/migrations/`.

---

## Status

| Layer | Status | URL / location |
|---|---|---|
| Frontend (Vercel) | ✅ **Deployed** (demo mode until env vars added) | https://speed-num.vercel.app |
| Database (Supabase) | ⚠️ **migrations `0005`–`0007` still to apply** (`0001`–`0004` done: 22 tables, trigger + RLS); auth configured (Site/redirect URLs, ES256 signing, anon key captured) | `https://xftnqkmakeaqaandxyei.supabase.co` · Canada Central (`ca-central-1`) |
| Backend (Render) | ⬜ pending — Dockerfile is port-agnostic and ready to deploy | `https://<service>.onrender.com` (TBD) |

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

1. **Vercel first** → produces `speed-num.vercel.app`, needed by Supabase (redirect URLs) and Render (CORS). ✅ done
2. **Supabase** → produces project URL, anon key, DB connection string. Blocks the backend (can't
   boot without `DATABASE_URL`) and the frontend's auth. ✅ done
3. **Render** → needs Supabase's `DATABASE_URL` + `SUPABASE_URL` and the Vercel URL for CORS.
   Produces the API base URL (`*.onrender.com`).
4. **Back to Vercel** → paste the 4 `NEXT_PUBLIC_*` vars (Supabase + Render + site URL), redeploy → real data.

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
> All four are written with `add column if not exists` / `create ... if not exists`, so
> re-running one is a no-op rather than an error — safe to apply again if you lose track of
> which have been run.

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
- Hugging Face was ruled out: Docker Spaces now need PRO and block outbound port 6543.
- `db/migrations/0007_reminders.sql` must be applied before the reminders board works.
  Until then `/reminders` returns an error the frontend swallows into an empty board, and
  the scheduler logs a failed sweep every day.

---

## Hostinger KVM VPS (current backend target)

The Dockerfile is host-agnostic — non-root uid 1000, `CMD` expands `${PORT:-7860}`, and a
`HEALTHCHECK` on `/health` — so it moves off Render unchanged. What differs on a VPS:

1. **You supply `PORT`** and keep the container restarting yourself. Compose is enough:

   ```yaml
   # /opt/speednum/docker-compose.yml
   services:
     api:
       build: ./backend            # or image: ghcr.io/<you>/speednum-api:latest
       restart: unless-stopped     # the container is now your job, not a PaaS's
       env_file: /opt/speednum/api.env
       environment:
         PORT: "8000"
       ports:
         - "127.0.0.1:8000:8000"   # bind to loopback; nginx terminates TLS
   ```

2. **Front it with nginx + certbot** for TLS. Vercel will not send a bearer token to an
   untrusted certificate, and browsers block mixed content from an https frontend:

   ```nginx
   server {
     server_name api.yourdomain.com;
     location / {
       proxy_pass http://127.0.0.1:8000;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
     }
   }
   ```
   Then `certbot --nginx -d api.yourdomain.com`.

3. **Set `NEXT_PUBLIC_API_URL`** on Vercel to `https://api.yourdomain.com` (no trailing
   slash, no `/api/v1` — the client appends it) and redeploy. Leaving it unset silently
   targets `localhost:8000` and the app shows demo data with no error.

4. **Add the VPS origin to `CORS_ORIGINS`** — or rely on the standing `*.vercel.app` regex
   if you only serve the Vercel domain.

5. **The scheduler now works properly here.** A VPS container does not sleep, so the daily
   sweep at `REMINDER_SWEEP_HOUR` fires reliably and no external cron is needed. If you
   later scale to more than one replica, set `REMINDER_SCHEDULER_ENABLED=false` on all but
   one — duplicate sweeps are harmless (the dedupe index absorbs them) but wasteful.

6. **Outbound 6543 must be open** for the Supabase pooler. Hostinger does not block it by
   default; if you add a firewall, allow it explicitly.
