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
| Database (Supabase) | ✅ **done** — migrations applied (22 tables, trigger + RLS); auth configured (Site/redirect URLs, ES256 signing, anon key captured) | `https://xftnqkmakeaqaandxyei.supabase.co` · Canada Central (`ca-central-1`) |
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
| `CORS_ORIGINS` | `https://speed-num.vercel.app` | recommended (see note) |
| `ENVIRONMENT` | `production` | recommended |
| `LOG_LEVEL` | `INFO` | optional |
| `SUPABASE_JWT_SECRET` | **blank** | project is ES256/asymmetric (JWKS has an ES256 key). Only set if backend 401/500s on valid logins. |
| `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | blank OK | declared but unused by backend code |
| `RESEND_API_KEY` / `EMAIL_FROM` | blank OK | blank → emails are logged, not sent |
| `JWT_AUDIENCE` | (unset) | defaults to `authenticated`; only set if changed in Supabase |

`DATABASE_URL` format (Supabase → Settings → Database → Connection string → **Transaction pooler**):
```
postgresql://postgres.xftnqkmakeaqaandxyei:<db-password>@aws-0-ca-central-1.pooler.supabase.com:6543/postgres
```
> Use the **port-6543 pooler**, never the direct `db.<ref>.supabase.co` host (IPv6-only,
> unreachable from most hosts). The backend auto-detects `:6543` and disables prepared statements.
> Render allows outbound 6543 (only SMTP ports 25/465/587 are blocked).

> **CORS note:** the backend also allows any `*.vercel.app` origin via a standing regex, so the
> frontend works even if `CORS_ORIGINS` is unset. Setting it to your exact domain is tighter/safer.

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

### 2. Supabase — ✅ done
Project created; migrations `0001`–`0004` applied via SQL (22 tables, RLS, `on_auth_user_created`
trigger, `documents` bucket); Email auth on, Site/redirect URLs set, Confirm-email off; anon +
service-role keys and the port-6543 `DATABASE_URL` captured in the secrets file.

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
   `SUPABASE_URL`, `PUBLIC_APP_URL`, `CORS_ORIGINS`, `ENVIRONMENT=production`.
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
- Backend `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` are declared but unused — don't block on them.
- Render free tier sleeps after 15 min idle (~30–60s cold start) — expected, the app tolerates it.
- Hugging Face was ruled out: Docker Spaces now need PRO and block outbound port 6543.
