# SpeedNum — Progress Log

Running state of this repo so a fresh session can pick up without re-deriving anything.

**Last updated:** 2026-08-06 (session 2)

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
2. **Plaintext credentials in research doc.** Line 24 of `speednum_chatgpt_research.md`
   contains `sa38299793@gmail.com` / password `test`. Harmless while the repo is private, but
   **scrub it before making the repo public** — removing it from history afterwards requires a
   history rewrite (`git filter-repo`), which is far more work than editing it now.
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
