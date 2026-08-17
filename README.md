# SpeedNum

Practice-management platform for accounting firms — multi-tenant client CRM, task workflows,
compliance deadline tracking, engagement letters, and a client portal.

```
Vercel (Next.js)  ──HTTPS──▶  Caddy  ──▶  FastAPI  ──asyncpg──▶  Postgres 16 (self-hosted VPS)
                                            │
                                            ├──▶ MinIO (documents + encrypted backup snapshots)
                                            └──▶ Hostinger SMTP (transactional email)
```

Authentication is self-hosted (Argon2id + Ed25519 JWTs + rotating refresh tokens — see
[SECURITY.md](SECURITY.md)), with optional "Continue with Google" social login. Supabase is not
part of the active request path; `AUTH_PROVIDER=supabase` / `STORAGE_PROVIDER=supabase` remain
only as documented, inactive-by-default rollback paths.

## Layout

| Path | What it is |
|---|---|
| [backend/](backend/) | FastAPI API, deployed on a self-hosted VPS via Docker Compose |
| [frontend/](frontend/) | Next.js 16 / React 19 app with Tailwind 4, deployed on Vercel |
| [desktop/](desktop/) | Admin desktop app (Electron) — encrypted backup sync and restore drills, see [DESKTOP.md](DESKTOP.md) |
| [db/migrations/](db/migrations/) | Postgres schema, functions, and (documented, inactive-by-default) RLS policies |
| [deploy/](deploy/) | Docker Compose stack, Caddy config, and operational scripts for the VPS |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Full system architecture |
| [SECURITY.md](SECURITY.md) | Authentication, authorization, and OAuth design |
| [BACKUP_ARCHITECTURE.md](BACKUP_ARCHITECTURE.md) | Backup snapshot format, encryption, sync, and disaster recovery |
| [PROGRESS.md](PROGRESS.md) | Running state of the repo and open items |

## Getting started

**Backend**

```bash
cd backend
python -m venv .venv && .venv/Scripts/activate   # Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                             # fill in DATABASE_URL and (optionally) SMTP/Google OAuth
uvicorn app.main:app --reload --port 8000
```

Interactive API docs at `/docs`, health probe at `/health`.

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

**Desktop** (disaster-recovery admin app)

```bash
cd desktop
npm install
npm start
```

**Database** — apply `db/migrations/*.sql` in filename order against a Postgres 16 instance you
control (`python backend/scripts/migrate.py apply`).

## Cloning

Large media (`*.mp4`, `*.zip`, `*.avi`) is stored with [Git LFS](https://git-lfs.com). Install
it first, or you will get pointer text files instead of real content:

```bash
git lfs install
git clone https://github.com/ShahbazAli206/SpeedNum.git
```

Already cloned without LFS? Run `git lfs pull`.

> `Untitled 141.avi` (792 MB) is **not** in the repo — it would exceed the free 1 GB LFS quota.
> See [PROGRESS.md](PROGRESS.md) for how to add it.
