# SpeedNum — Progress Log

Running state of this repo so a fresh session can pick up without re-deriving anything.

**Last updated:** 2026-08-06

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
| `82c9f43` | Application source: `backend/`, `frontend/`, `db/`, the demo zip via LFS, hardened `.gitignore` |
| `0c36d59` | Fix missing `email-validator` dependency and `useApi` hook lint errors |
| `4cce1c9` | Full frontend build — public site, client portal and firm-side app |
| *(uncommitted)* | **Client-portal backend** (models, schemas, routers, migration 0004) **+ `/request-demo` wired live** (this entry) |

---

## Application stack

```
Vercel (Next.js 16.3.0)  ──bearer token──▶  HF Space (FastAPI)  ──asyncpg──▶  Supabase Postgres
        │                                                                          ▲
        └──────────────── Supabase Auth (sign-in, JWT) ────────────────────────────┘
```

- **`backend/`** — FastAPI, deployed as a Hugging Face Docker Space on port 7860.
  22 routers / **78 endpoints**. Multi-tenant: every query filtered by the `tenant_id`
  pinned to the caller's `public.profiles` row. JWT verified via Supabase JWKS.
- **`frontend/`** — Next.js 16.3.0 / React 19.2.8, Tailwind 4, Supabase SSR.
- **`db/migrations/`** — `0001_schema.sql`, `0002_rls.sql`, `0003_functions.sql`, `0004_client_books.sql`.

> **Next.js caveat:** `frontend/AGENTS.md` warns this Next.js version has breaking changes vs.
> training data. Read `node_modules/next/dist/docs/` before writing frontend code.
> Notably: `params`/`searchParams` are Promises, `PageProps<'/route'>` / `LayoutProps<'/'>`
> are generated globals (they only exist after a build), and middleware is now `proxy.ts`.

---

## Frontend — what is built

Built from the reference screenshots in `screenshots of existing web/` and verified against
the live https://spidnums.com, rebranded from SpidNums to **SpeedNum**.
**34 route patterns → 87 prerendered pages**, ~17,000 lines of TS/TSX under `frontend/src`.

Three distinct surfaces, each with its own shell:

| Surface | Routes | Shell | Data |
|---|---|---|---|
| Public marketing site | `/`, `/features`, `/pricing`, `/blog`, `/case-studies`, `/request-demo`, `/terms`, `/privacy` | `app/(marketing)/layout.tsx` | Static content modules |
| Client portal | `/dashboard/*` | `components/dashboard/shell.tsx` | `lib/demo.ts` |
| Firm-side app | `/overview`, `/clients`, `/workflows`, `/deadlines`, `/services`, `/engagements`, `/team`, `/reporting`, `/notifications`, `/custom-fields`, `/import`, `/admin` | `components/firm/shell.tsx` | `lib/firm-demo.ts` |

### Public marketing site — complete

| Route | Notes |
|---|---|
| `/` | Hero + animated product mockup, trust marquee, modules bento, deadlines, engagement letters, white-label navy band, animated stat counters, testimonial, pricing, security, CTA |
| `/features` | Index of all 15 modules |
| `/features/[slug]` | 15 pages: benefit cards → problem → how it works → what changes → "what ships" checklist → related modules |
| `/pricing` | Plan card, capability comparison table, accordion FAQ |
| `/blog`, `/blog/[slug]` | 9 full-length posts, prev/next navigation |
| `/case-studies`, `/case-studies/[slug]` | 12 illustrative firm scenarios |
| `/request-demo` | Validated form (no endpoint yet — see below) |
| `/terms`, `/privacy` | Sticky contents rail; **template wording, not lawyer-reviewed** |
| `/login`, `/signup` | Split-screen auth, route-aware pitch panel |
| `not-found` | Custom 404 |

### Client portal — UI complete, running on demo data

`/dashboard` plus `invoices`, `expenses`, `payroll`, `taxes`, `reports`, `documents`,
`settings`. Collapsible sidebar, breadcrumb topbar, **Ctrl/⌘-K command palette**,
notifications panel, saturated KPI tiles matching the reference, sortable/filterable/
paginated tables with CSV export, detail drawers, drag-and-drop file staging.

### Firm-side app — UI complete, running on demo data

The staff-facing platform the marketing site sells. Each page mirrors the shape of its
backend router so wiring it up is a per-page swap.

| Route | What it does | Backing router |
|---|---|---|
| `/overview` | Practice health, a **needs-attention** list merging overdue deadlines + blocked tasks + declined letters, workload bars, audit feed | `dashboard.py` |
| `/clients` | The book — filter by status/plan/accountant, sort, CSV export | `clients.py` |
| `/clients/[id]` | The record everything hangs off: contacts with designations, custom fields, assigned services, deadlines, open work, letters | `clients.py` |
| `/workflows` | Task Master — Kanban **and** table over the same records, inline status changes | `workflows.py` |
| `/deadlines` | SLA board grouped overdue / due soon / upcoming, plus snoozed and filed-with-on-time-marker | `deadlines.py` |
| `/services` | Catalogue by category with cadence, due rule, lead time, client count and annualised value | `services.py` |
| `/engagements` | Letter pipeline with timestamped sent → viewed → signed trail and catalogue-priced line items | `engagements.py` |
| `/team` | Roster with workload computed from task records against weekly capacity; role reference | `team.py` |
| `/reporting` | Deadlines by month, revenue by category, workload, practice health | `reporting.py` |
| `/notifications` | Filterable feed with unread state and mark-all-read | `notifications.py` |
| `/custom-fields` | Field editor grouped by entity, with types, options and required flags | `custom_fields.py` |
| `/import` | Three-step CSV/XLSX flow: upload → expected columns → row-level validation preview | `imports.py` |
| `/admin` | Super-admin tenant console, audit log, isolation model | `admin.py` |

Counts are **computed, never hand-typed** — `open_tasks`, `overdue_deadlines`,
`next_due_date`, workload hours and on-time rate all derive from the same underlying
records, so every page agrees the way it would in production.

### Beyond the reference design

Light/dark theming with a three-way toggle and no flash-of-wrong-theme, scroll-reveal
animation, Features mega-menu, dependency-free SVG charts, toasts, cookie consent banner.

### Key files

| Path | What it is |
|---|---|
| `src/lib/site.ts` | Brand, contact, navigation — single source of truth |
| `src/lib/content/features.ts` | The 15 modules; drives mega-menu, index and detail pages |
| `src/lib/content/blog.ts` · `case-studies.ts` · `legal.ts` | Editorial and legal copy |
| `src/lib/demo.ts` | **All portal data.** Typed; swap for API calls to go live |
| `src/components/charts.tsx` | SVG charts — line/area, column, stacked share, sparkline, stat + KPI tiles |
| `src/components/ui.tsx` | Primitives (button, field, modal, drawer, pagination, switch…) |
| `src/lib/cn.ts` | Class joiner. **Lives outside `ui.tsx` on purpose** — that file is `"use client"`, and a server component calling a function exported from a client module fails at prerender |
| `src/app/globals.css` | Design tokens (navy + green), motion, and the validated `.viz` chart palette |

### Chart palette is validated, not eyeballed

The 5-slot categorical palette was run through the data-viz validator against the real
surfaces (`#ffffff` light, `#0e1729` dark). Lightness band, chroma floor, adjacent
colourblind separation, normal-vision floor and contrast **all pass in both modes**.

| Slot | Light | Dark |
|---|---|---|
| 1 green (brand) | `#0a8f4e` | `#1da75f` |
| 2 blue | `#1266f1` | `#4c8dfb` |
| 3 amber | `#f59e0b` | `#c98500` |
| 4 rose | `#e11d48` | `#e5556b` |
| 5 violet | `#7c3aed` | `#9085e9` |

One caveat carried forward: light-mode amber sits at 2.15:1, below 3:1. The documented
relief is applied — every chart using it ships direct labels **and** a table view.
**Do not hand-tweak a hex without re-running the validator.**

### Gotchas already hit (don't rediscover these)

1. **lucide-react v1 renamed icons.** `Loader2`→`LoaderCircle`, `AlertTriangle`→`TriangleAlert`,
   `CheckCircle2`→`CircleCheck`, `XCircle`→`CircleX`, `BarChart3`→`ChartColumn`,
   `Filter`→`ListFilter`, `FileSignature`→`Signature`. **Brand glyphs (LinkedIn, Facebook,
   Instagram, X, YouTube) were removed entirely** — they are inline SVG in `components/icon.tsx`.
2. **Server components cannot pass function props to client components.** Chart formatters
   have to live inside a `"use client"` wrapper (see `app/dashboard/overview-chart.tsx`).
3. **Interfaces don't get an implicit index signature.** `MonthPoint` is a `type` alias so it
   assigns to the charts' `Row` type. An `interface` there fails to compile.
4. **`clsx` cannot override a Tailwind width utility** with another one — both land in the
   stylesheet and source order wins. This made the dashboard filter row wrap; fixed with a
   plain `<select>` rather than the width-full shared `<Select>`.
5. **`--brand-ink` is a dark green for light chips.** Navy bands use `--brand-on-dark`,
   which is theme-invariant.

### Verified

- `npx eslint .` — clean.
- `npx next build` — clean, **87 pages**.
- All 34 route patterns return 200; unknown paths return 404.
- Headless Chrome over 31 pages in light **and** dark — **no console errors**.

Defects found and fixed during that verification, worth not reintroducing:

- The dashboard filter row wrapped (Tailwind width-class conflict, gotcha 4 above).
- `--brand-ink` was illegible on the navy panels → added `--brand-on-dark`.
- CTA arrows rendered before their label → `Button` gained `trailingIcon`.
- **On-time filing rate was structurally 100%** — it compared the due date to *today* rather
  than to when the item was actually filed. Deadlines now carry `filed_at` and the metric
  compares the two. It reads 83% (5 of 6), which is the point: a measured number can be bad.
- `/clients/[id]` 500'd in dev from a stale `.next` cache, not a code fault. `rm -rf .next`
  if a dynamic route starts throwing "Jest worker encountered 2 child process exceptions".

---

## Client-portal backend — built, not yet wired to the frontend

The gap flagged as "no server-side counterpart at all" is closed: `db/migrations/0004_client_books.sql`
plus 6 new routers give the client portal (`/dashboard/*`) a real API, mirroring
`frontend/src/lib/demo.ts`'s shape field-for-field so the eventual page swap is mechanical.

| Router | Prefix | Covers |
|---|---|---|
| `client_invoices.py` | `/client-portal/invoices` | The client's own sales invoices to its customers. "sent" past due reads as "overdue" at read time (same pattern as `Deadline.urgency`), never written directly. |
| `client_expenses.py` | `/client-portal/expenses` | Expenses, `pending → approved/rejected`. Approve/reject are firm-staff-only actions; a portal account can edit its own submission only while still pending. |
| `client_payroll.py` | `/client-portal/payroll` | `employees` (soft-delete via `is_active`) + `runs` (`draft → scheduled → processed`, staff-only `process` action). Per-run amounts are stored, not recomputed from current rates. |
| `client_taxes.py` | `/client-portal/taxes` | Tax obligations distinct from `deadlines` (which track the firm's *filing work*, not the money owed) — optionally linked via `deadline_id`. Staff-only `file` action. |
| `client_documents.py` | `/client-portal/documents` | Metadata only — file bytes go straight from the browser to the `documents` Supabase Storage bucket (already provisioned in `0003_functions.sql`); this just registers the pointer row. Extends the existing `documents` table with a `kind` column rather than adding a new one. |
| `client_overview.py` | `/client-portal/overview` | Landing summary. `cash_position` is a genuinely derived cumulative cash effect (collected invoices − approved expenses − processed payroll − filed tax remittances), not a placeholder constant like `demo.ts`'s `cashPosition: 148_320`. |

**Auth model:** a `profiles` row with `client_id` set (new column, migration 0004) is a
portal account pinned to that one client. `deps.get_book_scope` (`BookScopeDep`) resolves
this: firm staff may narrow to one client via `?client_id=`, a portal account always gets its
own client and that query param is ignored for them — it can only narrow access, never widen
it. `deps.require_staff` (`StaffUserDep`) gates the actions above that only make sense for
firm staff (approve, reject, process, file). RLS in `0004` mirrors the same rule for
defense-in-depth against direct Supabase access.

**Verified:** `python -c "import app.main"` succeeds with a dummy `DATABASE_URL` (the engine
is lazy — nothing dials out at import), and `app.openapi()` builds cleanly — 78 total paths,
23 of them under `/client-portal`. Not verified against a real database; there is no Supabase
project to test against yet (see below).

**Frontend types added, pages not yet swapped.** `frontend/src/lib/types.ts` now mirrors every
new schema (`ClientInvoice`, `ClientExpense`, `ClientEmployee`, `ClientPayRun`,
`ClientTaxObligation`, `ClientDocument`, `ClientBookOverview`, …), same as it already does for
the firm-side schemas. The `/dashboard/*` pages themselves still read `lib/demo.ts` — swapping
them to call `/client-portal/*` is blocked on the same thing as the firm side (see next
section): no Supabase project means no session, and a page that calls an authenticated
endpoint with no session just shows errors instead of the working demo it shows today.

**`/request-demo` now posts for real.** It calls the public, unauthenticated
`POST /api/v1/public/leads` endpoint (which already existed — `routers/public.py`), so this
one needed no backend change, just wiring the form in `demo-form.tsx`. Team size and notes
are folded into `message` since `LeadCreate` has no dedicated field for it.

## What is left

**Every screen is built and the client-portal backend now exists.** What remains is wiring
the frontend to real data (blocked on Supabase credentials this session cannot create),
plus smaller content/infra gaps.

### 1. Connect the frontend to the API (blocked on config)

**Zero of the 78 backend endpoints are called from a page yet** (`/request-demo` is the one
exception — see above). The API client (`src/lib/api.ts`), types (`src/lib/types.ts`) and
`useApi` hook are all in place and otherwise unused. Each firm page reads a getter from
`lib/firm-demo.ts`, and each portal page from `lib/demo.ts`, whose shapes already match the
routers' responses, so wiring is a per-page swap rather than a rewrite.

This is blocked on a Supabase project: without `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` there is no session to authenticate with, and `proxy.ts`
deliberately lets every request through rather than locking the site out.

### 2. Smaller gaps

- **No raw file upload endpoint.** `client_documents.py` registers already-uploaded metadata;
  actually placing bytes in Supabase Storage from the browser (signed upload URL) isn't wired
  either, and can't be end-to-end tested without a Supabase project.
- **`/onboarding` has no page** — `proxy.ts` guards the route; the flow is currently covered
  by `/clients` + `/import` + `/engagements` rather than a dedicated wizard.
- **Placeholder hero art** on interior pages; no licensed photography. Swapping `HeroArt` in
  `components/marketing/page-hero.tsx` won't shift layout.
- **Legal copy is a template** — needs a lawyer before launch.
- **No tests, no CI** despite the token carrying `workflow` scope.

### Rough sizing

| Area | State |
|---|---|
| Public marketing site | ✅ Done |
| Client portal UI | ✅ Done (on demo data) |
| Firm-side app UI | ✅ Done (on demo data) |
| Design system & charts | ✅ Done |
| Client-portal backend | ✅ Done — untested against a real database |
| Auth actually enforced | ⬜ Blocked — needs a Supabase project |
| Firm app → real API | ⬜ Blocked on the above; then ~12 per-page swaps |
| Portal → real API | ⬜ Blocked on the above; then ~7 per-page swaps |
| Raw file upload | ⬜ Needs a Supabase project + a signed-URL flow |
| Tests / CI | ⬜ Not started |

**What remains is one thing, blocking almost everything else:** a Supabase project. Once
`frontend/.env.local` has real credentials, both surfaces' page-swaps and the file-upload flow
become mechanical and independently parallelizable.

### Suggested next step

1. **Create the Supabase project** and fill `frontend/.env.local` — this unblocks everything
   else and switches the auth pages out of demo mode automatically.
2. **Run the migrations in order** — `0001` → `0002` → `0003` → `0004` — against it.
3. **Wire `/clients` end-to-end first** on the firm side (richest router, 10 endpoints, every
   other record hangs off it) **and `/dashboard/invoices` on the portal side** (now has a full
   backend). Each proves the auth path and gives a pattern the remaining pages copy.

---

## Large media & LFS quota

GitHub's free tier allows **1 GiB LFS storage** and **1 GiB/month bandwidth**.

| File | Size | Status |
|---|---|---|
| `2026-08-04 05-48-57-937.mp4` | 197 MiB | ✅ Pushed via LFS |
| `Demo Accounting software for a client.zip` | 422 MiB | ✅ Pushed via LFS |
| `Untitled 141.avi` | **792 MiB** | ❌ **Excluded** — see below |

Committed total is ~619 MiB of the 1 GiB quota. The `.avi` needs 792 MiB and does not fit;
it is excluded via `*.avi` in `.gitignore`. The file remains on disk, untracked.

**To include the `.avi` later:** buy a GitHub LFS data pack ($5/mo per 50 GB), remove the
`*.avi` line from `.gitignore`, then `git add "Untitled 141.avi" && git commit && git push`.
`.gitattributes` already routes `*.avi` through LFS.

**Cloning note:** run `git lfs install` before cloning, or `git lfs pull` afterwards, or you
get pointer text files instead of real media.

---

## Ignore rules

Root `.gitignore` covers Python (`__pycache__/`, `*.py[cod]`, `.venv/`), Node
(`node_modules/`, `.next/`, `out/`, `*.tsbuildinfo`), secrets (`.env`, `.env.*` with
`!.env.example`), `*.avi`, and OS/editor cruft. `frontend/.gitignore` is kept as-is.

`screenshots of existing web/` is currently **untracked** — commit it if the reference
design should live in the repo, or add it to `.gitignore` if not.

---

## Open items / known issues

1. **Nothing is wired to the API** — see *What is left*, item 1. Blocked on Supabase config.
2. **Plaintext credentials in research doc.** Line 24 of `speednum_chatgpt_research.md`
   contains `sa38299793@gmail.com` / password `test`. Harmless while the repo is private, but
   **scrub it before making the repo public** — removing it from history afterwards requires a
   history rewrite (`git filter-repo`), which is far more work than editing it now.
3. **No CI.** No workflow files yet.
4. **No tests.** Neither `backend/` nor `frontend/` has a test suite.
5. **Legal pages are unreviewed template wording.**
6. **`.avi` not in the repo** — blocked on LFS quota.
7. **Redundancy.** The 422 MB zip likely duplicates the extracted source in
   `backend/`/`frontend/`/`db/`. Dropping it would reclaim 422 MiB and leave room for the `.avi`.
8. **Migration 0004 is untested against a real Postgres.** Syntax and RLS logic were checked
   by hand against the 0001–0003 conventions, but never actually run — there is no Supabase
   project yet. Run it and its rollback path before trusting it in production.

---

## Verified state

- No `node_modules`, `.venv`, `.next`, or `__pycache__` in the index.
- No real `.env` tracked — only `backend/.env.example`.
- `frontend/package.json` and `package-lock.json` unmodified by the frontend build
  (no dependencies were added; everything uses what was already installed).
- Backend: `python -m compileall app` and `import app.main` (dummy `DATABASE_URL`) both clean;
  `app.openapi()` builds without error — 78 paths total.
- Frontend: `npx tsc --noEmit` and `npx eslint .` both clean after a `.next` cache rebuild
  (a stale cache from the prior session's build was producing spurious `PageProps` errors —
  same root cause as the existing `/clients/[id]` gotcha above; `rm -rf .next` fixed it).
