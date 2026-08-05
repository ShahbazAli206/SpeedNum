# SpeedNum

Practice-management platform for accounting firms — multi-tenant client CRM, task workflows,
compliance deadline tracking, and engagement letters.

```
Vercel (Next.js)  ──bearer token──▶  HF Space (FastAPI)  ──asyncpg──▶  Supabase Postgres
        │                                                                    ▲
        └────────────── Supabase Auth (sign-in, JWT) ────────────────────────┘
```

## Layout

| Path | What it is |
|---|---|
| [backend/](backend/) | FastAPI API, deployed as a Hugging Face Docker Space — see [backend/README.md](backend/README.md) |
| [frontend/](frontend/) | Next.js 16 / React 19 app with Tailwind 4 and Supabase SSR |
| [db/migrations/](db/migrations/) | Postgres schema, row-level security policies, and functions |
| [speednum_chatgpt_research.md](speednum_chatgpt_research.md) | Research notes on the SpidNums platform |
| [PROGRESS.md](PROGRESS.md) | Running state of the repo and open items |

## Getting started

**Backend**

```bash
cd backend
python -m venv .venv && .venv/Scripts/activate   # Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                             # fill in your Supabase values
uvicorn app.main:app --reload --port 8000
```

Interactive API docs at `/docs`, health probe at `/health`.

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

**Database** — apply `db/migrations/*.sql` in filename order against your Supabase project.

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
