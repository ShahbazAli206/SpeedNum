# SpeedNum — Progress Log

Running state of this repo so a fresh session can pick up without re-deriving anything.

**Last updated:** 2026-08-16 (session 5 — see the bottom of this file)

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
| `56ea0e7` | Client-portal backend (models, schemas, routers, migration 0004) + `/request-demo` wired live |
| *(uncommitted)* | **Portal pages wired to real data, an access-control fix, document upload, backend unit tests, CI** (this entry) |

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
| Client portal | `/dashboard/*` | `components/dashboard/shell.tsx` | `lib/demo.ts`, real data where available (see below) |
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
| `/request-demo` | Validated form, posts live to `POST /api/v1/public/leads` |
| `/terms`, `/privacy` | Sticky contents rail; **template wording, not lawyer-reviewed** |
| `/login`, `/signup` | Split-screen auth, route-aware pitch panel |
| `not-found` | Custom 404 |

### Client portal — UI complete, wired to real data with a demo fallback

`/dashboard` plus `invoices`, `expenses`, `payroll`, `taxes`, `reports`, `documents`,
`settings`. Collapsible sidebar, breadcrumb topbar, **Ctrl/⌘-K command palette**,
notifications panel, saturated KPI tiles matching the reference, sortable/filterable/
paginated tables with CSV export, detail drawers, drag-and-drop file upload (now real —
see *Portal wired to real data* below).

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
| `src/lib/demo.ts` | Portal demo data / fallback shapes. Live now via `portal-live.ts` where a backend exists |
| `src/lib/portal-live.ts` | Fetches `/client-portal/*` and maps it into `demo.ts`'s shapes — see *Portal wired to real data* |
| `src/lib/api-server.ts` | Server Component fetch helper (cookie-backed session), the `api.ts` of Server Components |
| `src/lib/storage.ts` | Signed-URL upload straight to Supabase Storage, then registers metadata via the API |
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

## Client-portal backend

`db/migrations/0004_client_books.sql` plus 6 new routers give the client portal (`/dashboard/*`)
a real API, mirroring `frontend/src/lib/demo.ts`'s shape field-for-field.

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
is lazy — nothing dials out at import), `app.openapi()` builds cleanly (78 total paths, 23
under `/client-portal`), and `pytest tests/` passes (see *Backend unit tests* below). Not
verified against a real database — there is no Supabase project to test against yet.

## Access-control fix: portal accounts could read every other client's data

Adding `profiles.client_id` (migration 0004) created a real gap that didn't exist before it:
every firm-side router (`clients.py`, `team.py`, `deadlines.py`, `reporting.py`, …) depends on
`TenantUserDep`, which only checked "does this account belong to a tenant" — it never checked
*which kind* of account. A portal account has a tenant too (the firm it belongs to), so its
token could call `GET /clients`, `GET /team`, etc. and get **every** client's records, not just
its own — a client-facing login reading the firm's entire book, including its own competitors.

Fixed in `deps.py` by splitting the dependency in two:

- `get_firm_linked_user` / `AnyTenantUserDep` — the old broad check ("has a tenant"), used only
  by `get_book_scope` (which legitimately needs to accept both kinds of account).
- `get_tenant_user` / `TenantUserDep` — now additionally rejects `profile.client_id is not None`.
  Every firm-only router already used this name, so **zero router files needed to change** —
  the fix is contained entirely to `deps.py`. `StaffUserDep` becomes a plain alias for it
  (`TenantUserDep` already excludes portal accounts, so the old separate check was redundant).

Verified via `app.openapi()` still building the same 78 paths after the change (no route lost
the ability to resolve its dependencies).

## Portal wired to real data (with a demo fallback that can never break)

The `/dashboard/*` pages now try the real API first and fall back to `lib/demo.ts` on any
failure — no session, no Supabase project, a network error, a non-2xx response. This can only
improve on the working demo, never regress it, which matters because none of this can be
tested against a live backend yet.

- **`frontend/src/lib/api-server.ts`** (new) — the Server Component equivalent of `api.ts`.
  `api.ts` is `"use client"` and reads the bearer token via `supabaseBrowser()`, which doesn't
  exist during server rendering; `apiServer()` pulls it from the cookie-backed session instead
  and returns `null` on any failure rather than throwing.
- **`frontend/src/lib/portal-live.ts`** (new) — one `fetchLiveX()` per backend endpoint, each
  mapping the snake_case response into the exact camelCase shape `lib/demo.ts` already returns
  (`revenue_mtd` → `revenueMTD`, `customer_name` → `client`, `employment_type: "full_time"` →
  `type: "Full-time"`, …), so **no page JSX changed at all** — only the data-sourcing line did:
  `const invoices = (await fetchLiveInvoices()) ?? getInvoices();`
- **Two real mismatches found and fixed, not glossed over:**
  - The live API's invoice `status` can be `"void"`; `demo.ts`'s `InvoiceStatus` union has no
    such state. Mapped by dropping voided invoices from what the adapter returns, rather than
    mislabelling them as `"draft"` or similar.
  - `Expense.method` and `TaxObligation.authority` were typed as closed string unions in
    `demo.ts` (`"Visa ••4821" | "Mastercard ••7702" | …`, `"CRA" | "Revenu Québec"`) but the
    live API allows free text for both. Checked every usage first (both are plain-text
    display, never switched on) and widened both to `string` in `demo.ts` — the honest fix,
    versus silently coercing any other value into a wrong-but-compiling label.
- **Pages wired:** `/dashboard` (overview KPIs, monthly chart, recent invoices — "upcoming
  deadlines" and "recent activity" stay on demo data, see below), `/dashboard/invoices`,
  `/dashboard/expenses`, `/dashboard/payroll`, `/dashboard/taxes`, `/dashboard/documents`.
- **Not wired, on purpose:** the dashboard's "upcoming deadlines" and "recent activity" panels
  use `demo.ts`'s `Deadline`/`ActivityEntry`, which mix concepts (CRA filings, firm handoffs,
  sign-in history) this API doesn't model for a portal account — there is no
  `/client-portal/deadlines` or `/client-portal/activity` endpoint, and inventing one wasn't in
  scope this pass.
- **Document upload is now real.** `frontend/src/lib/storage.ts` (new) uploads straight to the
  `documents` Supabase Storage bucket via a signed URL (`createSignedUploadUrl` +
  `uploadToSignedUrl` — bytes never pass through the FastAPI Space), then registers the
  metadata via `POST /client-portal/documents`. `documents-client.tsx`'s upload handler calls
  it when Supabase is configured and keeps its old "acknowledged, not stored" toast in demo
  mode. **Download is still just a toast** — no signed *read* URL flow yet, only upload.

## Firm-side app: NOT wired — `lib/firm-demo.ts` has drifted from `schemas.py`

The previous session's claim that firm-side shapes "mirror `backend/app/schemas.py`... so
wiring is a per-page swap" turned out to be **only approximately true**, and not safe to act on
blindly. Spot-checking `/clients` and `/clients/[id]` surfaced real drift:

- `firm-demo.ts` defines its **own** local `Client`/`Service` interfaces rather than importing
  from `types.ts` — they've diverged from `ClientRead`/`ServiceRead` in `schemas.py`.
- `Client.joined` (demo) vs. `onboarded_at` (backend) — a rename, but also a `Client.plan`
  field the backend doesn't have at all, and a `service_ids: string[]` array where the backend
  has a computed `service_count: number` instead.
- `Service.due_rule: string` (demo, human-readable — `"6 months after fiscal year-end"`) vs.
  `due_rule: dict[str, Any]` (backend, structured — `{"type": "offset_from_period_end", ...}`).
  `[id]/page.tsx` renders `{service.due_rule}` directly; rendering the live *object* there would
  throw ("Objects are not valid as a React child"), not just display wrong.
- `Contact.phone`/`.email` are demo-typed as required strings and called with `.replace(...)`
  directly; the backend's `ContactRead.phone`/`.email` are `string | null` — a null from real
  data would crash that line, not just look wrong.

None of this is unfixable — it's the same kind of rename-and-translate work the portal side
just went through — but it needs the same care (read every real usage, don't cast around a
type error) applied to **12 firm pages and their demo interfaces**, not 6 already-well-understood
portal ones. Given no live backend exists yet to catch a wrong guess, and a wrong "swap" would
regress the currently-verified-working demo for uncertain benefit, this pass stopped at
finding and documenting the drift rather than guessing through a fix. **Firm-side pages still
read `lib/firm-demo.ts` exactly as before — nothing there changed.**

## Backend unit tests + CI

- **`backend/tests/test_deadlines.py`** (24 tests) — the compliance-calendar engine
  (`app/services/deadlines.py`): month-end/leap-year handling, the Easter computus (checked
  against published Easter Sundays), statutory holiday rolling, `periods_for` for every
  frequency, `due_date_for` for both rule types, `plan_deadlines`' service-window filtering,
  and `urgency_for`/`summarise`'s bucketing. All pure functions, no database.
- **`backend/tests/test_utils.py`** (11 tests) — `apply_updates`, `ensure_found`, `as_float`,
  `group_count`.
- **`backend/requirements-dev.txt`** (new) — `-r requirements.txt` + `pytest`, kept out of the
  production Docker image on purpose.
- **`.github/workflows/ci.yml`** (new) — two jobs. Backend: byte-compile, import smoke test,
  `pytest`. Frontend: `npm run build` (generates `.next/types` — running `tsc` without it first
  produces the exact spurious `PageProps` errors hit earlier this session), then `tsc --noEmit`,
  then `npm run lint`. Both jobs skip Git LFS checkout (source only; the repo's ~619 MB of media
  would burn a meaningful slice of the free 1 GB/month LFS bandwidth on every run otherwise).

All 35 backend tests pass locally; the workflow itself has not run on GitHub Actions yet (no
push since it was added — see the commit this section describes).

## What is left

**Every screen is built, the client-portal backend exists, and the portal is wired to it with
tests and CI in place.** What remains: the firm-side wiring (needs demo-data reconciliation
first, see above), a Supabase project to test any of this against, and smaller content gaps.

### 1. Firm-side wiring (needs reconciliation first, not just a Supabase project)

Per the drift found above, wiring `/clients`, `/team`, `/services`, etc. to their routers isn't
a mechanical swap until `firm-demo.ts`'s `Client`/`Service`/`Contact` interfaces (and the pages
that read their now-demo-only fields — `.joined`, `.plan`, `.service_ids`, `due_rule` as a
string) are reconciled against `schemas.py`. That reconciliation is real, separate work, ideally
done with a live backend available to verify each page against — see item 2.

### 2. A Supabase project (blocks everything else)

Nothing here — the client-portal wiring included — has run against a real database. Once
`frontend/.env.local` has real credentials:

1. Run the migrations in order: `0001` → `0002` → `0003` → `0004`.
2. The portal pages built this session start showing real data automatically — no code change
   needed, `apiServer()` just stops returning `null`.
3. `.github/workflows/ci.yml` can finally be watched run for real on a push.
4. The firm-side reconciliation (item 1) can be done *against* real responses instead of by
   reading schemas side-by-side — much lower-risk than continuing to guess blind.

### 3. Smaller gaps

- **No signed *read* URL flow for documents** — upload is real (this session); download is
  still a "will download once storage is connected" toast.
- **`/onboarding` has no page** — `proxy.ts` guards the route; the flow is currently covered
  by `/clients` + `/import` + `/engagements` rather than a dedicated wizard.
- **Placeholder hero art** on interior pages; no licensed photography. Swapping `HeroArt` in
  `components/marketing/page-hero.tsx` won't shift layout.
- **Legal copy is a template** — needs a lawyer before launch.

### Rough sizing

| Area | State |
|---|---|
| Public marketing site | ✅ Done |
| Client portal UI | ✅ Done |
| Firm-side app UI | ✅ Done (on demo data) |
| Design system & charts | ✅ Done |
| Client-portal backend | ✅ Done — untested against a real database |
| Access control (portal vs. staff) | ✅ Done |
| Portal → real API | ✅ Done (with demo fallback) — untested against a real database |
| Document upload | ✅ Done — untested against a real database; download still not wired |
| Backend tests / CI | ✅ Done — CI itself hasn't run on GitHub yet |
| Firm-demo data reconciled with schemas.py | ⬜ Not started — see finding above |
| Firm app → real API | ⬜ Blocked on the above, then ~12 per-page swaps |
| Auth actually enforced | ⬜ Blocked — needs a Supabase project |

### Suggested next step

1. **Create the Supabase project** and fill `frontend/.env.local` — this unblocks everything
   else and switches the auth pages out of demo mode automatically.
2. **Run the migrations in order** — `0001` → `0002` → `0003` → `0004` — against it.
3. **Exercise the portal pages against real data** (sign up, add an invoice/expense/etc. via
   `/docs`, reload the page) — this is the first real test any of this session's work gets.
4. **Then tackle the firm-side reconciliation**, now with a live backend to check each page
   against instead of reading two files side by side and hoping.

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

1. **Firm-side pages are not wired** — real, documented shape drift between `lib/firm-demo.ts`
   and `backend/app/schemas.py`. See *Firm-side app: NOT wired* above before attempting it.
2. ~~**Plaintext credentials in research doc.**~~ Scrubbed in session 4 — the working copy now
   points at the gitignored secrets file instead. **They remain in git history**, so if the repo
   is ever made public, rewrite history first (`git filter-repo`) or rotate that password.
3. **CI has never run on GitHub.** The workflow exists (`.github/workflows/ci.yml`) and passes
   locally; it hasn't been exercised by an actual push/PR yet.
4. **No frontend tests.** Backend has 35 (pure-logic) unit tests; the frontend has none.
5. **Legal pages are unreviewed template wording.**
6. **`.avi` not in the repo** — blocked on LFS quota.
7. **Redundancy.** The 422 MB zip likely duplicates the extracted source in
   `backend/`/`frontend/`/`db/`. Dropping it would reclaim 422 MiB and leave room for the `.avi`.
8. **Migration 0004 is untested against a real Postgres.** Syntax and RLS logic were checked
   by hand against the 0001–0003 conventions, but never actually run — there is no Supabase
   project yet. Run it and its rollback path before trusting it in production.
9. **No signed *read* URL for documents** — upload is real, download is still a toast.

---

## Verified state

- No `node_modules`, `.venv`, `.next`, or `__pycache__` in the index.
- No real `.env` tracked — only `backend/.env.example`.
- `frontend/package.json` and `package-lock.json` unmodified by the frontend build
  (no dependencies were added; everything uses what was already installed).
- Backend: `python -m compileall app`, `import app.main` (dummy `DATABASE_URL`), and
  `app.openapi()` (78 paths) all clean. `pytest tests/` — **35 passed**.
- Frontend: `npx tsc --noEmit`, `npx eslint .`, and `npx next build` (87 pages) all clean after
  a `.next` cache rebuild (a stale cache from the prior session's build was producing spurious
  `PageProps` errors — same root cause as the existing `/clients/[id]` gotcha above; `rm -rf
  .next` fixed it — now baked into `ci.yml` as `npm run build` before `tsc`).
- `.github/workflows/ci.yml` YAML validated with `yaml.safe_load()`; not yet run by GitHub
  Actions itself (see *Open items* above).

---

# Session 3 — QA pass, dropdown system, and the wiring gaps (2026-08-15)

A full UX/functional audit against the brief, then fixes. Everything below is verified
by the gates in *Verified state (session 3)*.

## The build was broken

`frontend/src/app/(firm)/users/page.tsx` passed an `isLive` prop that `users-client.tsx`
did not declare — one TS error, so `npx next build` and therefore **any Vercel deploy
would have failed**. That half of the change had simply not been written. Fixed by
wiring the users page properly (below).

`npx eslint .` was also failing on `lib/session.tsx` and `reminders/reminders-client.tsx`
(React Compiler rules: `set-state-in-effect`, `purity`). CI runs lint, so that was red too.
Both fixed at the root rather than silenced — except one narrow, justified disable in
`session.tsx` where the rule cannot see across an `await`.

## The dropdown system — `frontend/src/components/select.tsx` (new)

Every dropdown in the app was a native `<select>`: the option list is drawn by the OS, so
it ignored our tokens, our dark mode and our type scale, and could not show a second line,
a status dot or an icon. Three call sites had started fighting the primitive's fixed size
with `!important`.

Replaced with a real listbox plus a `Menu` primitive for action menus. Two load-bearing
details:

- **Portal + `position: fixed`.** Tables live inside `overflow-x-auto`, which clips an
  absolutely positioned child. Fixed-and-portaled is the only thing that reliably escapes
  an ancestor's overflow. Coordinates are recomputed on scroll/resize (capture phase, so
  scrolling an ancestor tracks too) and flip above the trigger when space below is tight.
- **Width is a `fullWidth` prop, not a class.** `cn` is plain clsx with no tailwind-merge,
  so emitting `w-full` in the component and `w-40` at the call site puts both in the
  stylesheet and lets source order decide. That exact conflict is the documented reason
  `data-table.tsx` had bailed out to a raw `<select>` (gotcha 4, session 2).

Full WAI-ARIA listbox keyboard contract, type-ahead, optional search (auto-on past 10
options), groups, descriptions, dots, and a hidden input so it still posts inside a plain
form (`request-demo` relies on this).

**Rolled out to all 33 call sites** — every `Select` usage, all 7 raw `<select>` elements,
the DataTable export menu, the engagement export menu, and new account menus in both shells.

> `openPanel` explicitly calls `triggerRef.current?.focus()`. Clicking a `<button>` does
> not focus it in every browser (Safari, and any programmatic click), and the keyboard
> handler hangs off the trigger — without it, open-with-mouse-then-arrow did nothing.
> Caught by the interaction suite, not by reading the code.

## Things that looked done but were not connected

| Surface | Was | Now |
|---|---|---|
| `/import` | Hardcoded `PREVIEW_ROWS` constant, no file parsing, ended in a toast saying *"Import not connected"* — while `routers/imports.py` had preview **and** commit for both clients and users | Real upload to server-side preview to commit, for **both** clients and users. Invalid rows are excluded from the commit and shown with their reasons. Bulk user import shows each temporary password once. |
| `/users` | Full CRUD UI backed only by `useState`; toasts claimed *"their account and access have been revoked"* when nothing happened | Wired to `POST/PATCH/DELETE /users` plus `resend-credentials`. Delete copy now matches what the server does (staff deactivated, portal logins deleted). |
| `/services` | Read-only demo catalogue, no add/edit/delete at all | Full CRUD. The `due_rule` JSON grammar is exposed as a two-option form rather than raw JSON, and rendered back through `describeDueRule`. |
| `/clients` | Demo data even with the API up | Live via `toClientRow`. Bulk-add grid actually POSTs. |
| Client export | Columns had no `exportValue`, so it fell back to sort keys — "Year-end" exported `1231`, "Open work" exported `3002` | Real values in CSV **and** xlsx. |
| Add client | `catch {}` swallowed every failure and still showed a green success toast; `plan` and `ownerId` were collected but never sent | Only an unreachable API (`ApiError.status === 0`) falls back to demo; a real rejection is surfaced. Plan posts as `tags`, owner as `owner_id`. |
| Portal topbar | Demo deadlines as "notifications", no polling, no blink, `DEMO_ACCOUNT`'s name for every real client, sign-out was a `<Link href="/login">` the proxy bounced straight back | Real `/notifications` feed, blinking bell matching the firm shell, real identity, real sign-out. |

## Reminders now actually fire — `backend/app/services/scheduler.py` (new)

Generation was endpoint-driven only, and **nothing called the endpoint**. A "10 days left"
reminder existed only if a human happened to open the page and press *Check now*.

Added an in-process daily sweep on the FastAPI lifespan. Safe because `persist()` inserts
`ON CONFLICT DO NOTHING` against `reminders_dedupe_unique` and returns only new rows, so a
duplicate run creates nothing and emails no one. Every failure is logged and swallowed —
**verified**: with a dead database the startup sweep failed and the API stayed up.

The next-run time is computed against a wall clock, not a fixed 24h sleep, so a restart at
09:05 does not permanently move the daily sweep to 09:05. Six tests pin that down.

Config: `REMINDER_SCHEDULER_ENABLED`, `REMINDER_SWEEP_HOUR` (UTC), `REMINDER_SWEEP_ON_START`.

## Email

- **Client welcome** now carries the services the client is signed up for and their next
  four deadlines, read at send time from the same tables the portal renders, plus the
  assigned accountant as a named contact. Empty sections are omitted entirely.
- **Staff credentials** finally get a magic link. `staff_welcome_html` always accepted one;
  `accounts._send_welcome` just never passed it, so an accountant had to type a 16-character
  password by hand while clients got one-click access.
- `/portal-login` honours `?next=`, so staff links land on `/overview` and client links on
  `/dashboard`. Only same-origin relative paths are accepted — an open redirect handed out
  by email is the worst kind.
- `ForcePasswordModal` is now mounted in the **firm** shell too. It was portal-only, so a
  new accountant was never asked to replace the temp password an admin generated.

## Security / correctness fixes

- `GET/POST /notifications*` now accept portal logins (they need their own feed) but a
  null `profile_id` — a firm-wide broadcast — stays with staff. Single-row read/delete got
  the same scoping; without it one account could act on another's row by id.
- `POST /reminders/run` is now `AdminUserDep`. It emails every owner and admin of the firm,
  so it should not be triggerable by any staff member who finds the button. The UI hides it
  for non-admins rather than letting them click into a 403.
- `POST /clients` from the bulk grid only sends `owner_id` when it is a real UUID (demo team
  rows carry slugs, which would 422).
- Added `GET /notifications/unread-count` — the bell polled `/auth/me`, which loads the
  profile and tenant to return one number.
- `/integrations` documented `GMAIL_USER` / `GMAIL_APP_PASSWORD`, which the backend has
  never read. It uses Resend.
- Import aliases now recognise "Primary Contact Email/Phone" — the headers the app's **own**
  downloadable template uses did not round-trip. Caught by a new test.

## Tests: 62 to 114

New: `test_imports.py` (importer parsing had **zero** coverage), `test_scheduler.py`,
`test_email.py`. Still pure-logic — there is no DB fixture, so endpoints remain untested.

Two new headless-Chrome suites under `frontend/scripts/`, driven over CDP directly (no
Puppeteer dependency — Node 22 has a global `WebSocket`):

- `cdp-check.mjs` — 42 routes, asserting status and zero console errors.
- `cdp-interact.mjs` — 31 assertions on the parts you have to *use*: the listbox opens,
  keyboards correctly, exposes the right ARIA, escapes an overflow-clipped table, commits
  on Enter, does not commit on Escape; menus portal; the bell blinks; the importer no
  longer shows its fake preview.

## Verified state (session 3)

- Backend: `pytest tests/` — **114 passed**. `compileall app` clean. `app.openapi()` — 102 paths.
- Frontend: `tsc --noEmit`, `eslint .`, `next build` — all clean.
- `node scripts/cdp-check.mjs` — **42/42 routes clean**, no console errors.
- `node scripts/cdp-interact.mjs` — **31/31 checks passed**.
- Live servers: API on :8111 (DB deliberately unreachable) reported `degraded` and stayed
  up through a failed scheduled sweep; every new endpoint returns 401 unauthenticated
  rather than 404, confirming registration and the auth gate.
- A messy 11-column **XLSX** was parsed end-to-end through `_read_table`, `detect_mapping`
  and `parse_row`: all headers mapped, good rows parsed, bad rows flagged individually.

## Still open

1. **No endpoint/integration tests.** Everything is pure-logic; there is no DB fixture and
   no `TestClient`. The wiring above is verified by browser and by hand, not by CI.
2. **Nothing has been run against a real Supabase.** `backend/.env` points at a dead host on
   purpose. Account creation, credential email delivery and the reminder digest have been
   verified by rendering and by contract, **not** by delivering a real email to a real inbox.
3. ~~`must_change_password` is still **advisory**~~ — enforced server-side in session 4.
4. `kind="portal"` reminders are declared in the enum and never generated.
5. `db/migrations/0007_reminders.sql` has not been applied to a real database.
6. The client welcome email is still awaiting the reference screenshot; services and
   upcoming deadlines were added per the brief, layout may need to change to match.

---

# Session 4 — deployment readiness (2026-08-15)

Started from the four gates in *Verified state (session 3)*: all green on the current tree
(114 backend tests, `tsc`/`eslint`/`next build` clean). So this pass went after what those
gates cannot see — the things that only break once the app meets a real deployment.

## Four defects that would have surfaced on the first real deploy

### 1. Document storage could never have worked (the big one)

`0003_functions.sql` creates the `documents` bucket with `public = false` and defines **no
policies on `storage.objects`**. Supabase has RLS on that table by default, so deny-by-default
applies: the browser-side flow in `lib/storage.ts` — `createSignedUploadUrl` then
`uploadToSignedUrl` with the user's anon-role session — is denied every step. Upload was
marked ✅ done in session 2 and had only ever run in demo mode, where it makes no calls at all.

Fixed by moving signing to the backend (`app/services/storage.py`), which uses the
service-role key and so bypasses storage RLS. The access decision therefore has to happen
*before* signing, which is the right place anyway: `routers/client_documents.py` already knows
the tenant/portal visibility rules. Bytes still go browser↔Supabase directly and never
through the API.

**This also closed a read-anything hole.** `storage_path` used to be chosen by the browser and
accepted as given. Combined with service-role signing, a caller could have registered a row
pointing at *any* object in the bucket and then read it back. Now the server mints every path
under `{tenant_id}/{client_id}/` and `register_document` rejects anything outside the caller's
own prefix. Both properties are pinned by tests, including traversal attempts (`../../etc/passwd`).

Download is wired at the same time — `GET /client-portal/documents/{id}/download-url` returns a
5-minute signed URL, minted per click, applying the same visibility rules as the list endpoint.
It had been a toast reading *"will download once storage is connected"* since session 2.
Deleting a document now removes the object too, instead of orphaning the bytes.

### 2. CI would have failed on its first push

The backend job's *Unit tests* step never set `DATABASE_URL`, while the *Import smoke test*
step right above it did. `app/db.py` builds the engine at import time and raises without one,
so every test errored at collection. It passed locally only because `backend/.env` exists on
this machine and is gitignored — CI and any fresh clone have no such file.

Fixed at the root in `backend/tests/conftest.py` rather than by patching the workflow, so a
fresh clone works too. Verified by running the suite from an empty directory with no `.env`.

### 3. Every dropdown in the app was keyboard-dead

Opening a listbox with the mouse left focus wherever it already was — on `/clients/new`, on the
autofocused first field; elsewhere, on `<body>`. Keyboard handling hangs off the trigger, so
every subsequent arrow key went somewhere else and nothing moved. `openPanel` did call
`triggerRef.current?.focus()`, but that runs *before* React commits `setOpen(true)` and the
commit put focus back. Moved into an effect, which runs after the commit and wins.

The interaction suite had been catching this all along — it was reporting 26/31, not the
documented 31/31. **Now 31/31.** (Four of those five failures were one cascade: a panel left
open by the dead keyboard path swallowed the click the bell assertion needed.)

> Debugging note, because it cost real time: `next start` failed to bind with `EADDRINUSE` and
> the *previous* server kept serving an older build, so a fix that worked read as a fix that
> did nothing. If a verified change appears to have no effect, check the port before doubting
> the change.

### 4. The runbook would have produced a half-working deployment

`DEPLOYMENT.md`'s Render step listed the env vars to set and omitted
`SUPABASE_SERVICE_ROLE_KEY`. Following it literally yields a service that boots, passes
`/health`, and cannot create a single login or serve a single document — every one of those
routes returns 424. Added, with the consequence spelled out.

Also corrected there: Supabase is marked ⚠️ rather than ✅, because **migrations `0005`–`0007`
were never applied**. `0005` is not optional — it adds `profiles.must_change_password` and the
`clients.portal_invited_*` columns that `models.py` already selects, so *every* request that
loads a profile fails until it is run. All four are `if not exists`-guarded and safe to re-run.

## Security hardening

- **`must_change_password` is now enforced**, not merely prompted. It was advisory: the modal
  was dismissible and nothing on the server cared, so anyone holding an admin-generated
  temporary password — emailed in plaintext, often read aloud — had the full API. Enforced in
  `deps.get_firm_linked_user`, the choke point every data dependency is built on, so no router
  had to change (same shape as session 2's portal/staff fix). Returns **428** so the client can
  tell it apart from a role failure; `/auth/*` uses `CurrentUserDep` and stays reachable, which
  is what lets the user actually escape the state. The modal is now non-dismissible when the
  server is the one asking.
- **CORS no longer trusts all of `vercel.app`.** A standing `https://.*\.vercel\.app` regex
  meant *anyone's* Vercel project was an allowed origin. Replaced with an opt-in
  `CORS_ORIGIN_REGEX` that should be scoped to this project's own preview hostnames.
- **Startup now warns** about a production deploy with wildcard CORS, a missing service-role
  key, a missing Resend key, or a `PUBLIC_APP_URL` still on localhost. Warnings, not failures —
  a deploy that refuses to boot over CORS would be worse than one that works and says so.
- Plaintext credentials scrubbed from `speednum_chatgpt_research.md` (still in git history —
  see *Open items*).
- `/onboarding` removed from `proxy.ts`'s guarded list: it has no page, so the guard sent a
  signed-out visitor through login only to land them on a 404.

## Tests: 114 → 144

- `test_storage.py` (22) — path minting, prefix confinement, traversal, signed-URL parsing.
- `test_deps.py` (8) — the temporary-password gate and the portal/staff split, which had no
  direct coverage despite being the load-bearing access-control code.
- `conftest.py` — the CI fix above.

## Verified state (session 4)

- Backend: `pytest tests/` — **144 passed**; also passes from an empty cwd with no `.env`
  (the CI condition). `compileall app` clean. `app.openapi()` — 105 paths.
- Frontend: `tsc --noEmit`, `eslint .`, `next build` (122 pages) — all clean.
- `node scripts/cdp-check.mjs` — **42/42 routes**, no console errors.
- `node scripts/cdp-interact.mjs` — **31/31**, run three times, against a confirmed-fresh build.

## What is still open

1. **Nothing has run against a real Supabase.** Unchanged, and still the top item — every fix
   above is verified by test and by browser, not against the live project.
2. **Apply migrations `0005`–`0007`** before or with the backend deploy (see DEPLOYMENT.md §2).
3. **No endpoint/integration tests** — still no DB fixture or `TestClient`.
4. The document *upload* path is now correct by construction but has never moved a real byte
   into a real bucket; that is the first thing to exercise once Supabase is live.
5. Items 4–6 from session 3 (portal reminders, welcome-email layout) are unchanged.
6. Legal copy is still unreviewed template wording.

---

# Session 5 — portable schema, VPS Postgres/MinIO, first real staging deploy (2026-08-16)

Driven by a separate architecture brief (Supabase exit plan + Hostinger VPS deployment).
Branch: `migration/portable-production-architecture` (not yet merged to `main`). Full detail in
the branch's commit messages and `DEPLOYMENT.md`; this is the pointer for a fresh session.

## What changed

- **Schema made portable.** `profiles.id`'s FK to `auth.users` removed (that table only exists
  when Postgres is Supabase's own — `deps._provision_profile` already recreates what the
  `on_auth_user_created` trigger does, as a fallback, so nothing depended on it existing).
  `0003`'s trigger-attach and `storage.buckets` insert now guard on `to_regclass(...) is not
  null`; `0004`/`0007`'s RLS policies guard on `to_regrole('authenticated') is not null`.
  `0002_rls.sql` has no portable content at all, so it's skipped by name via a new
  `MIGRATIONS_SKIP` env var read by `backend/scripts/migrate.py`, rather than guarded in place.
  **Verified**: `migrate.py apply` runs clean against a truly empty `postgres:16` container — 24
  tables, no leftover `auth`/`storage` schema references, no orphaned RLS.
- **Storage abstraction gained an S3/MinIO provider.** `storage.py` is now a thin dispatcher over
  `STORAGE_PROVIDER` (supabase | s3); the Supabase implementation moved unchanged to
  `storage_supabase.py`; `storage_s3.py` is new (boto3, two endpoints — internal for the
  backend's own calls, public for presigned URLs the browser must reach). No frontend change
  needed: `lib/storage.ts` already just PUTs to whatever `url` comes back. **Verified**: a real
  presigned upload → download → delete round-trip against the deployed MinIO, through Caddy,
  over HTTPS.
- **VPS now runs Postgres + MinIO alongside the API**, all Docker-internal except `api` (Caddy
  reaches it by container name over the `web` network — no host port published at all, a change
  from the previous nginx-oriented compose file). Caddy (already running on the VPS before this
  work) got a new site block for `test.spidnums.com`, replacing its "HTTPS is working" test
  response — the previously-written nginx+certbot runbook was never deployed and would have
  fought Caddy for ports 80/443, so it was replaced rather than stood up alongside.
- **Backup/restore scripts for both Postgres and MinIO**, cron'd daily at 03:00/03:15 UTC, plus
  `health-check.sh`. **Verified real restores**, not just written scripts: backed up the live
  (empty, freshly-migrated) Postgres and restored it into a disposable container (24 tables, 7
  `schema_migrations` rows survived); uploaded a real test object, backed up MinIO's data
  directory, and restored it into a disposable MinIO that listed the object back.

## Bugs the deploy itself caught (not found by reading code)

1. Generated `POSTGRES_PASSWORD`/`MINIO_ROOT_PASSWORD` with `openssl rand -base64`, which can
   emit `/` and `+` — both break when the value is embedded directly in `DATABASE_URL`'s DSN
   string. Switched the hint to `-hex`.
2. `app/db.py` defaults to `sslmode=require` when the DSN doesn't say otherwise; the VPS's own
   `postgres:16` doesn't terminate TLS at all, so the API's engine got "PostgreSQL server ...
   rejected SSL upgrade" (`migrate.py`'s bare `asyncpg.connect()` worked fine, no ssl kwarg,
   which is what made this confusing at first) — fixed with `?sslmode=disable` on the two
   VPS-Postgres `DATABASE_URL`s in `docker-compose.yml` only; Supabase's pooler DSN is unaffected.
3. First Caddy routing attempt used `handle_path /storage-api/*` to strip a prefix before
   forwarding to MinIO. That broke every presigned URL: SigV4 signs the exact request path, and
   MinIO validates against the path it actually receives — stripping the prefix meant those two
   never matched, and every request came back "Access Denied" with no more specific reason.
   Fixed by dropping the prefix entirely (`S3_PUBLIC_ENDPOINT_URL` is now the bare host) and
   matching Caddy's route on the bucket name itself, which path-style S3 already puts first in
   the URL — nothing rewrites the path anymore.
4. `restore-storage.sh`'s first draft ran `minio/mc ... sh -c "..."` — `mc`'s entrypoint *is*
   `mc`, not a shell, so that was parsed as a (nonexistent) `mc sh` subcommand. Needed
   `--entrypoint /bin/sh` explicitly, matching how `docker-compose.yml`'s `minio-init` already
   does it. Its cleanup also tried to `rm -rf` a directory MinIO had written as its own
   container-internal uid, which the host user can't remove through a bind mount — fixed by
   deleting it through a throwaway root container instead.
5. `deploy.sh` and the original `docker-compose.yml` published the api container on
   `127.0.0.1:8000` for an nginx-fronted setup; the Caddy-based one reaches it by container name
   over the `web` network instead and publishes no host port at all, which silently broke
   `deploy.sh`'s own `curl 127.0.0.1:8000/health` — fixed to check from inside the container.

All five were caught because the deploy was actually run and its output actually read, not
because the code looked wrong on inspection — worth remembering before trusting untested
infrastructure changes of this shape again.

## What is still open (this branch)

1. **Not merged to `main`.** Everything above lives on `migration/portable-production-architecture`.
2. **No live Supabase project credentials in this session** — Auth (`SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`) is unset on the VPS deploy, so account-creation/JWT-verified
   routes correctly 424/401 rather than crash, but signup/login/document-upload were never
   exercised through a real token. That needs either this project's real Supabase credentials or
   a decision to build self-hosted auth (the architecture brief explicitly allows keeping
   Supabase Auth as the long-term choice if self-hosting it is judged riskier than worth).
3. **No Vercel access in this session** — `NEXT_PUBLIC_API_URL=https://test.spidnums.com` still
   needs to be set in the Vercel dashboard and the frontend redeployed to actually exercise the
   Vercel → VPS path end-to-end.
4. **No offsite backup.** Both backup scripts write to the VPS's own disk only — a VPS failure
   would take the only copy with it. Needs an external destination (rclone to B2/S3, or similar)
   and credentials this session didn't have.
5. **`api.spidnums.com` DNS record doesn't exist yet** — staging currently rides on the
   pre-existing `test.spidnums.com` record. Creating the `api` A record is a new record, not a
   change to the production root domain, but still needs Hostinger DNS access this session
   didn't have.
6. Production data migration from Supabase (Postgres + Storage) was explicitly out of scope for
   this pass — nothing in Supabase was read, exported, or touched.

# Session 6 — full auth/role/OAuth/export QA pass, Google login, desktop backup app (2026-08-17)

Items 2 and 3 from Session 5's "still open" list above are now resolved: self-hosted auth (not
Supabase) is the live default and was live-tested end to end, and `NEXT_PUBLIC_API_URL` is
confirmed working (`speed-num.vercel.app` → `test.spidnums.com`). Item 4 (no offsite backup) is
now partially addressed by the desktop sync app below, though it downloads on demand/interval
rather than continuously.

**Note:** partway through this session, a second, independent piece of work (the backup
snapshot system, commit `318cb04`, plus three follow-up commits) was pushed to this same branch
directly by the repo owner or their own tooling, while this session was still running. No
conflicts occurred — `git fetch` before each push confirmed a clean fast-forward every time —
but it's worth knowing this branch had concurrent writers during this window.

**Full audit against a 26-part brief covering user/role model, client and staff onboarding,
first-login forced password change, portal routing, session/token security, PDF/XLSX/CSV
export and import, and email — all tested live against `test.spidnums.com` with disposable
`qa+`-tagged accounts, not just read from code.** One real defect found and fixed: CSV/XLSX
export had no spreadsheet-formula-injection sanitization (commit `bc940eb`). Everything else
audited was already correctly built — see this session's chat transcript for the full test
matrix; not reproduced here to avoid drift from the actual code.

**Google OAuth** ("Continue with Google") built and live-verified up to the external-provider
boundary: authorization-code + PKCE, ID-token verification against Google's real JWKS (12 unit
tests with a real RSA keypair), verified-email-only account linking. `GOOGLE_CLIENT_ID`/
`GOOGLE_CLIENT_SECRET` don't exist anywhere in this deployment, so the real browser flow through
an actual Google consent screen is **BLOCKED** — `GET /auth/oauth/providers` correctly reports
`{"google": false}` in production. Facebook/Microsoft/Apple evaluated and deliberately not
built (see SECURITY.md's OAuth section for the reasoning).

**Generic PDF export** added to the existing CSV/XLSX export menu (`data-table.tsx`), covering
every table that already had CSV/XLSX. Found and fixed a real layout bug in the process (long
unbroken tokens like emails overflowing into the next column instead of wrapping).

**SpeedNum Desktop** (`desktop/`) — a new Electron app built on top of the backup-snapshot
system from `318cb04`: syncs encrypted snapshots to local disk (AES-256-GCM, streaming, 12 unit
tests), and runs real restore drills into disposable Docker containers. Electron rather than
Tauri because this dev environment has no Rust/MSVC toolchain and installing one was
impractical within the pass — see DESKTOP.md for the full reasoning. Live-verified against
production: real login/list/download/encrypt/ack through the actual Electron GUI
(Playwright-driven, screenshotted), and a real restore drill that decrypted a real snapshot,
restored it into a disposable Postgres container, and logged in against the restored data. That
drill surfaced a real gap — `pg_dump --no-owner` doesn't reliably carry every GRANT the app's
non-superuser role needs — fixed by always re-applying `GRANT ALL ON ALL TABLES/SEQUENCES` after
a restore, not left as a manual runbook step. Full feature parity with the web admin dashboard
was explicitly scoped out; see DESKTOP.md's "what's real vs. scoped out" section.

**Docs**: wrote `BACKUP_ARCHITECTURE.md` and `DESKTOP.md` (both previously promised in code
comments/commit messages but never written), added an OAuth section to `SECURITY.md`, fixed the
root `README.md` and `backend/README.md` (both still described the old Supabase/Hugging-Face
architecture), and added the missing `GOOGLE_CLIENT_ID`/`BACKUP_*` variables to both
`.env.example` files.

**Still open:**
1. Offsite backup exists now (the desktop sync), but nothing automated pushes it further
   offsite (e.g., to cloud storage in a second region) — it lives on whichever machine ran the
   desktop app.
2. Server-side snapshot components are not encrypted at rest in MinIO (see
   BACKUP_ARCHITECTURE.md's Encryption section for why this was deprioritized this pass).
3. Google OAuth: blocked on real credentials, as above.
4. Backend PDF export for invoices/reports/financial-data specifically (as opposed to the
   generic tabular PDF export added this session) was not built — the generic export covers the
   same tables, just not with bespoke per-document-type layouts.
5. The desktop app has no signed installer and requires Docker for restore drills.
