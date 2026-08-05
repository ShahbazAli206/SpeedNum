# SpeedNum — Progress Log

Running state of this repo so a fresh session can pick up without re-deriving anything.

**Last updated:** 2026-08-05

---

## Repository

| | |
|---|---|
| Remote | https://github.com/ShahbazAli206/SpeedNum |
| Visibility | **Private** |
| Default branch | `main` |
| Git user | Shahbaz Ali `<sa38299793@gmail.com>` |
| `gh` auth | Logged in as `ShahbazAli206` (scopes: `gist`, `read:org`, `repo`, `workflow`) |
| Git LFS | Installed (3.6.1), filters configured globally — no per-repo setup needed |

## Commit history

| Commit | Contents |
|---|---|
| `60f8695` | Initial commit — research doc, README, first `.gitignore` |
| `3072c5e` | Screen recording `2026-08-04 05-48-57-937.mp4` (197 MB) via Git LFS |
| *(pending)* | Application source: `backend/`, `frontend/`, `db/`, the 422 MB demo zip via LFS, hardened `.gitignore`, this file |

A local commit titled `sa` (`4dfe34c`) was created outside the assistant session. It committed
the 422 MB zip and 792 MB `.avi` as **regular git blobs**, which GitHub hard-rejects (100 MB
per-file limit), so it could never have pushed. It was never on the remote, so it was reset
(`git reset --mixed origin/main`) and re-committed properly. Nothing was lost.

---

## Application stack

```
Vercel (Next.js 16.3.0)  ──bearer token──▶  HF Space (FastAPI)  ──asyncpg──▶  Supabase Postgres
        │                                                                          ▲
        └──────────────── Supabase Auth (sign-in, JWT) ────────────────────────────┘
```

- **`backend/`** — FastAPI, deployed as a Hugging Face Docker Space on port 7860.
  Routers per feature area (clients, deadlines, engagements, portal, team, reporting,
  imports, admin…). Multi-tenant: every query filtered by the `tenant_id` pinned to the
  caller's `public.profiles` row. JWT verified via Supabase JWKS (asymmetric) or legacy HS256.
  The deadline engine is pure date arithmetic over fiscal year ends + CRA-style `due_rule`s,
  rolling forward past weekends and Canadian statutory holidays.
- **`frontend/`** — Next.js 16.3.0 / React 19.2.8, Tailwind 4, Supabase SSR client.
- **`db/migrations/`** — `0001_schema.sql`, `0002_rls.sql`, `0003_functions.sql`.
- **`speednum_chatgpt_research.md`** — competitor/platform research on SpidNums.

> **Next.js caveat:** `frontend/AGENTS.md` warns this Next.js version has breaking changes vs.
> training data. Read `node_modules/next/dist/docs/` before writing frontend code.

---

## Large media & LFS quota

GitHub's free tier allows **1 GiB LFS storage** and **1 GiB/month bandwidth**.

| File | Size | Status |
|---|---|---|
| `2026-08-04 05-48-57-937.mp4` | 197 MiB | ✅ Pushed via LFS |
| `Demo Accounting software for a client.zip` | 422 MiB | ⏳ In pending commit via LFS |
| `Untitled 141.avi` | **792 MiB** | ❌ **Excluded** — see below |

Committed total after the pending push is ~619 MiB of the 1 GiB quota. The `.avi` needs
792 MiB and does not fit; it is excluded via `*.avi` in `.gitignore`. The file remains on
disk, untouched and untracked.

**To include the `.avi` later:** buy a GitHub LFS data pack ($5/mo per 50 GB), remove the
`*.avi` line from `.gitignore`, then `git add "Untitled 141.avi" && git commit && git push`.
`.gitattributes` already routes `*.avi` through LFS, so no other change is needed.

**Cloning note:** run `git lfs install` before cloning, or `git lfs pull` afterwards, or you
get pointer text files instead of real media. Each full clone spends ~619 MiB of the 1 GiB
monthly bandwidth allowance — roughly one clone per month before throttling.

---

## Ignore rules

Root `.gitignore` covers Python (`__pycache__/`, `*.py[cod]`, `.venv/`), Node
(`node_modules/`, `.next/`, `out/`, `*.tsbuildinfo`), secrets (`.env`, `.env.*` with
`!.env.example`), `*.avi`, and OS/editor cruft. `frontend/.gitignore` (Next.js default) is
kept as-is. The `sa` commit had tracked ~29 `__pycache__/*.pyc` artifacts; those are now
excluded.

---

## Open items / known issues

1. **Plaintext credentials in research doc.** Line 24 of `speednum_chatgpt_research.md`
   contains `sa38299793@gmail.com` / password `test`. Harmless while the repo is private, but
   **scrub it before making the repo public** — removing it from history afterwards requires a
   history rewrite (`git filter-repo`), which is far more work than editing it now.
2. **No CI.** No workflow files yet, despite the token carrying `workflow` scope.
3. **No tests.** Neither `backend/` nor `frontend/` has a test suite.
4. **`.avi` not in the repo** — blocked on LFS quota (see above).
5. **Redundancy.** The 422 MB zip ("Demo Accounting software for a client") likely duplicates
   the extracted source now tracked in `backend/`/`frontend/`/`db/`. Dropping it would reclaim
   422 MiB of quota and leave room for the `.avi`.

---

## Verified state

- No `node_modules`, `.venv`, `.next`, or `__pycache__` in the index.
- No real `.env` tracked — only `backend/.env.example`.
- Empty `__init__.py` files confirmed as 0-byte plain blobs, not LFS pointers
  (`git lfs status` cosmetically shows the empty-blob hash `e3b0c44` for them).
