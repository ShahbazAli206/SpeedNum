# SpeedNum — Master Execution Plan (Customer Handover)

Tracking file for the "FINAL MASTER EXECUTION PROMPT" (given 2026-08-18). This is a
working checklist, not a report — update statuses as work actually completes and
is verified, not when it's merely started. Status values:

- `DONE` — implemented AND verified (test/live command run, output checked)
- `PARTIAL` — some of it real, gap noted
- `TODO` — not started
- `BLOCKED` — needs an external credential; noted exactly what

Re-run `git fetch && git log --oneline <last-known>..origin/...` before resuming —
another session may be working the same branch concurrently (confirmed happening
throughout this project). Reuse/verify their work; don't duplicate or revert it.

Last updated: 2026-08-18 (start of this pass). Baseline commit: `04fed8c`.

---

## Already verified working (do not re-litigate, spot-check only if touched)

- Self-hosted auth: registration/login/logout/refresh/rotation/reuse-detection/
  reset/forced-password-change/lockout/rate-limiting — DONE, live-tested repeatedly.
- Tenant isolation across clients/contacts/projects/services/documents — DONE,
  live-tested. Tasks specifically had a real cross-tenant bug, fixed by the
  concurrent session (`e96280c`) — confirmed deployed.
- MinIO private storage, presigned upload/download/delete, byte-identical
  round-trip, Unicode content — DONE, live-tested.
- Backup snapshot system, device registration/revocation, retention — DONE,
  live-tested including a real restore drill into disposable Postgres.
- Desktop app: sync, encryption, restore-drill, auto-update (check/detect/
  download/integrity-verify against a real VPS-hosted feed) — DONE, live-tested.
  NOT done: code signing (BLOCKED — no certificate), actual quit-and-relaunch
  click-through (mechanism proven, final click not exercised).
- Google OAuth: implemented, unit-tested (real crypto), BLOCKED on
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` for live E2E. Correctly hidden
  until configured.
- Dashboard/reporting wired to real data, real invoice-derived revenue,
  task-assignment notifications+emails, deadline auto-generation — DONE
  (concurrent session), spot-verified via passing tests.
- Branding settings — DONE this pass (was localStorage-only, fixed to persist
  via real `PATCH /settings/tenant`).
- SSH hardening (`PermitRootLogin no`, `PasswordAuthentication no`) — DONE,
  live-verified, deploy access preserved.
- `STORAGE_PROVIDER` unsafe-default bug — DONE, fixed and tested.

## Section-by-section status

| # | Area | Status | Notes |
|---|---|---|---|
| 4 | Admin — organization settings | PARTIAL | Branding (colors/logo/font) done. Timezone/currency/date-format/language settings: not modeled yet. |
| 4 | Admin — staff management | DONE | Create/edit/disable/role/resend-credentials all real; verified earlier sessions. |
| 5 | Client management | DONE | Full CRUD + portal invite verified live. |
| 6 | Client portal invitation email | DONE | Real SMTP send confirmed live. |
| 7 | Services | DONE | Full CRUD + assignment verified (concurrent + earlier session). |
| 8 | Service assignment → deadlines/tasks | DONE | Concurrent session wired auto-deadline-generation on assignment; tests passing. |
| 9 | Task management | PARTIAL | Core CRUD/status/kanban real. Missing: attachments, comments/activity — **explicit gap, Section 18, do now.** |
| 10 | Staff portal | DONE | Verified earlier session. |
| 11 | Client portal isolation | DONE | Verified live, cross-tenant/cross-client blocked. |
| 12 | Deadlines/reminders | DONE | Real engine, real scheduler, idempotent (dedupe_key), tested. |
| 13 | Top-center alert banner | TODO | "Needs attention" list exists on Overview; no persistent top-center banner component. Small, do this pass. |
| 14 | Email notifications | PARTIAL | Account/invite/reset/task-assignment/deadline digest all real. Signature-request email: exists for engagement letters only. |
| 15 | Admin dashboard (real data) | PARTIAL | Firm-level `/dashboard`, `/reporting` real (reporting fixed this pass — see queue). Platform **super-admin** console (`/admin`) still 100% demo — separate item added below. |
| 16 | Revenue/financial logic | DONE | Real invoice-derived revenue (paid/outstanding/overdue) + contract-value projection, both real. |
| 17 | Document management | DONE | Live-tested this session (upload/download/delete/cross-tenant/Unicode). |
| 18 | Task attachments + comments | TODO | **Explicit gap — implementing this pass.** |
| 19 | Signature system (generic) | PARTIAL | Real, working (as of the final consolidation pass — was actually 100% broken before that, see below), hardcoded to engagement letters. Generalizing beyond that is a larger schema change — out of scope. |
| 20 | Signature request workflow | DONE (for letters), corrected 2026-08-18 | This row previously claimed "Full flow real," which was **false** — `POST /engagements` failed on every single attempt, in every tenant, since the table existed (two real bugs: a NULL `token` default mismatch, then a `MissingGreenlet` crash — see "Final consolidation pass" section below). Both fixed and the full lifecycle (create/get/list/update/duplicate/send/sign/void/delete) live-verified end to end today. Earlier "DONE" was never actually exercised against a real create call. |
| 21 | Letterhead/branding in documents | DONE | Tenant brand_color/logo/letter_footer already used in the real PDF + emails. |
| 22 | Client letter/email workflow | DONE | Real, for engagement letters. |
| 23 | Branding/appearance (web+desktop) | PARTIAL | Web done this pass. Desktop has no theming at all (plain HTML/CSS, no dark/light/system, no brand injection) — small, scoped desktop task. |
| 24–27 | Desktop (backup/update/parity) | DONE / PARTIAL | Backup+update DONE. Full web-feature-parity explicitly out of scope (documented decision, DESKTOP.md) — not revisiting without direction. |
| 28 | Responsive UI/UX audit | TODO | Not systematically audited this pass. |
| 29–30 | Access control / security audit | PARTIAL | Extensively tested piecemeal across sessions. Doing one more consolidated negative-test pass (Section 56) before final report. |
| 31 | Database/migrations audit | DONE | Fresh-DB migration test done multiple times; production healthy. |
| 32 | Backups | DONE | Verified multiple times including real restore drill. |
| 33 | Email system | DONE | Real SMTP confirmed multiple times this project. |
| 34 | Notification scheduler | DONE | Advisory-lock-guarded, tested, real. |
| 35 | Audit log | PARTIAL | Covers most listed events; signature/device/backup events confirmed; verify task-attachment/comment events once built. |
| 36–38 | Error handling / empty states / search-filter-sort | TODO | Not systematically audited. |
| 39 | Performance | TODO | Not systematically audited (no evidence of a real problem either). |
| 40–44 | Testing (backend/frontend/E2E/desktop/regression) | ONGOING | Re-run after each change in this pass; full auto-update A→B regression already done once for real. |
| 45 | Production deployment | ONGOING | Redeploy after each backend-affecting change in this pass. |
| 46 | No-Supabase sweep | DONE | Full classification done, fixed several stale references, confirmed zero live Supabase traffic via real browser capture. |
| 47 | Secrets | DONE | No secrets found in git this project; `.gitignore` correct. |
| 48 | Google OAuth | BLOCKED | Credential, documented. |
| 49 | Desktop code signing | BLOCKED | Credential, documented. |
| 58 | Handover documentation | PARTIAL | ARCHITECTURE/SECURITY/DEPLOYMENT/BACKUP_ARCHITECTURE/DESKTOP.md all real and current. Missing a single consolidated "start here" handover doc — do this pass. |

## This pass's work queue (in order)

1. [x] Task attachments (backend+deploy+live-verified) — DONE. Migration applied to production (found+fixed a real DB ownership bug along the way: `speednum_app` didn't own 24 legacy tables including `documents`, only had DML grants, so `ALTER TABLE` failed — transferred ownership of all 35 tables to `speednum_app`, now consistent). Real live test: created a task, uploaded a real file with Unicode content, registered/listed/downloaded (byte-identical)/deleted it, confirmed removed from MinIO, confirmed cross-tenant 404.
2. [x] Task comments (backend+deploy+live-verified) — DONE, same pass. Real comment created/listed/deleted live.
3. [x] Top-center urgent-deadline banner — DONE by the **concurrent session** (`urgent-deadline-banner.tsx`, wired into `shell.tsx`) while this item was queued here. Verified real (dismissible, deduped by `id:urgency`, reuses real `/dashboard` data, sticky top-center). Not touched/duplicated.
4. [x] Task attachments/comments **frontend UI** — DONE (this contributor). `task-detail-client.tsx`: upload/list/download/delete attachments, add/list/delete comments, both under a real `isLive` guard (skipped entirely for the demo-fixture fallback task, matching the existing convention rather than 404ing against a fake id). New `lib/storage.ts` helpers (`uploadTaskAttachment`, `taskAttachmentUrl`) mirror the existing document-upload pattern exactly. Live-verified against production with the *exact* payload shapes the UI sends (not just the backend's own test): create task → upload-url → PUT bytes (Unicode content) → register → list → download-url → byte-identical fetch → comment → delete both. All real, all cleaned up after. `tsc`/`lint`/`build` clean, including on top of a concurrent session's simultaneous error-handling improvements to the same file (optimistic-update rollback + real error messages on status change/save/delete) — reconciled without conflict, both verified together.
5. [x] Desktop app theming — DONE. Corrected scope during implementation: this app is a single-operator superadmin DR tool with no tenant context (`renderer/index.html` login copy literally says "Superadmin credentials only"), so tenant brand-color injection doesn't apply — noted in `DESKTOP.md`. The real gap was that it declared `color-scheme: light dark` but never implemented a dark palette. Added system-linked `prefers-color-scheme: dark` CSS (no manual toggle — a tool used a few times a year doesn't need its own theme preference separate from the OS). Verified visually, not just by reading the CSS: launched the real Electron renderer with `nativeTheme.themeSource` forced to each value and screenshotted both — light and dark both render with correct contrast across header/card/inputs/modal. `node --test test/*.test.js` (12/12) still passing.
6. [~] Responsive/empty-state/error-state audit pass on the areas touched above — PARTIAL, not claiming more than was done. Every page/component touched this pass got real error states (toast.error with a specific message on every failure path, no silent catches) and real empty states (`EmptyState`/loading placeholders for zero-data and 403 cases) as part of fixing them — that part is genuine and live-verified alongside each fix above. What was **not** done: a systematic responsive/breakpoint audit (resizing to tablet/mobile widths and checking layout) across these or any other pages. No regressions are known, but none were specifically looked for either — this is an honest gap, not a rounding-up.
7. [x] Cross-tenant IDOR pass on the brand-new task attachments/comments endpoints (this contributor) — DONE. Two fresh tenants; every combination (list/download-url/delete attachment, list/post/edit/delete comment, upload-url against another tenant's task_id directly) correctly rejected 404, uniform message, no existence leak. Legitimate same-tenant access re-confirmed working after. Broader Section 56 sweep (SSH/UFW/rate-limiting/etc.) still not re-run this pass — most of it was already verified in earlier sessions per the top of this file; this item specifically closes the gap for what's brand-new this pass.
8. [x] Final production deployment + health verification — DONE. All backend-affecting commits this pass deployed to the VPS and confirmed via `/health` after each. Final consolidated check: all four containers (api/postgres/minio/caddy) up and healthy, `migrate status` reports "Schema is up to date", UFW still exactly 22/80/443 (v4+v6), SSH key-only access unaffected. Frontend pushed to `migration/portable-production-architecture`; **could not confirm** which branch Vercel's production deployment is wired to or the exact deployed commit — no Vercel CLI session/credentials exist in this environment (`vercel whoami` → logged out). Noted in `HANDOVER.md` as something to check, not glossed over.
9. [x] Write `HANDOVER.md` (single consolidated onboarding doc) — DONE. Points at the existing depth docs rather than duplicating them; states current live status, the real completion list, both remaining external-credential gaps with exact remediation steps, and flags `PROGRESS.md` as a stale pre-migration log.
10. [x] Final acceptance report per Section 61 — delivered directly to the user at the end of this pass, not as a separate file (this tracking file already carries the section-by-section detail).
11. [x] **Reporting page** — DONE (this contributor). `reporting/page.tsx` was still 100% `firm-demo.ts` fixtures despite `GET /reporting` (backend/app/routers/reporting.py) already computing everything live. Added the two fields it was missing (`deadlines_open` bucket counts reusing the same `urgency_for` helper the dashboard uses, `portal_enabled_clients`) so `ReportingClient`'s existing props are fully satisfiable from real data; page now tries the live endpoint first, demo fallback only if unreachable. Deployed to production, live-verified with real created/deleted client+deadline (confirmed `clients_by_status`, `total_annual_fees`, `deadlines_open.overdue` all reflect the real record, then confirmed cleanup). `tsc`/backend import-check/full pytest suite (245 passed) all clean.
12. [x] **Admin console** (`/admin`) — DONE (this contributor). Added `GET /admin/audit` (cross-tenant, joins `Tenant.name`, `SuperadminDep`-gated) since the `AuditLog` table was written to everywhere but never read back; wired the page to `GET /admin/tenants`/`/admin/stats`/`/admin/audit` via a new `admin-client.tsx` matching `admin/backups/page.tsx`'s proven `"use client"` + `useApi` + 403→`EmptyState` pattern. Dropped two false claims from the old copy ("row-level security enforces the boundary" — RLS is intentionally skipped for self-hosted per `0002_rls.sql`; "hosted in ca-central-1" — not true of this VPS deployment). Deployed to production. Live-verified: non-superadmin QA owner correctly gets 403 on all three endpoints. Success path (real superadmin session) **not live-clicked** — promoting an account to superadmin is a deliberate manual/undocumented `UPDATE profiles SET is_superadmin` per `DEPLOYMENT.md`, and the safety classifier correctly refused to run that (or even a read-only equivalent) against production over SSH. Code is a direct structural copy of the already-existing `list_tenants`/`platform_stats` endpoints in the same file (same dependency, same query style) — high confidence, not fabricated confidence.
13. [x] **Custom fields page** (`/custom-fields`) — DONE (this contributor). Real "Add field" modal + delete, full CRUD wired to the existing backend. Live-verified full lifecycle against production: create → appears in list → delete → list empty again, exact payload shape the UI sends.
14. [x] **Clients settings page** (`/clients/settings`) — DONE (this contributor). Was 100% local state — "Add"/"Remove" never called the API at all, and the success toast ("New client records will show this field") was a lie. Rewritten as a client-scoped slice of the same real `/custom-fields` API (`?entity=client`) the admin page now uses — not a separate feature, one less thing to keep in sync.
15. [x] **Client detail page** (`/clients/[id]`) — DONE (background agent, this session; diff reviewed line-by-line and independently re-verified before deploy, not taken on the agent's word). `page.tsx` rewritten to the `loadLive` pattern (real clients no longer 404). All three fake flows in `client-detail-client.tsx` fixed for real: **Add service** now awaits `assignClientService` and only updates local state on success (no more `.catch(() => {})`); **Add task** calls real `POST /tasks`; **Add file** wired to a new staff-side documents endpoint (`backend/app/routers/client_documents_staff.py`, mirrors `task_attachments.py`'s pattern exactly — `client_documents.py` was portal-session-scoped and unusable from the firm side). All three gated behind `isLive`. `tsc`/`eslint`/`pytest` (245 passed)/`build` independently re-run and clean, deployed to production. Live-verified end to end: created a real client, confirmed every `loadLive`-dependent endpoint (contacts/services/deadlines/engagements) returns 200 for it; created a real client-scoped task via the Add-task path and confirmed it appears in `/tasks` filtered by `client_id`; full document lifecycle through the new staff endpoint (upload-url → PUT Unicode-content bytes → register → list → download-url → byte-identical fetch → delete → confirmed both list-empty and a 404 on the now-deleted id); confirmed a nonexistent `client_id` 404s rather than leaking. All scratch records deleted after. Cross-tenant IDOR not re-run as a separate two-tenant test this item — the endpoint is a structural copy of `task_attachments.py` (same `ensure_*_in_tenant` + explicit `tenant_id` filter on every query), which already passed a full adversarial IDOR pass this session (work-queue item 7 above).

Work through in order; update this file's checkboxes/status column as each item
is actually verified, not when merely started.

## Additional pass, after the queue above was closed out

The queue above was marked closed by a concurrent session (commits `838adac`..`ebfee32`,
including `HANDOVER.md`). This is a genuine additional finding made *after* that close-out,
not a duplication of it:

16. [x] **Fixed a real fake-save bug in Settings → Email alerts** — the "alert recipient
    email" field and the two "alert me about tasks/reminders" checkboxes only ever wrote to
    `localStorage`. The real digest sender (`services/reminders.py::admin_recipients`)
    always emails every active owner/admin in the tenant, completely independent of that UI
    — the controls did nothing. Fixed by adding `profiles.notify_deadline_digest`
    (migration `0014`, real Postgres column, default `true`), wired through the existing
    `PATCH /auth/me` allow-list, and filtered on in `admin_recipients`. Replaced the fake
    recipient-override + category-split UI with one real `Switch` bound to the logged-in
    user's own profile. Dropped the recipient-override entirely rather than wiring it up —
    redirecting a firm's client-work digest to an arbitrary email address is a data-exposure
    risk `admin_recipients` deliberately avoids by only ever emailing real tenant accounts.
    `tsc`/`eslint`/`next build` clean, backend suite 261/261 passing (up from 245: also added
    `test_dashboard.py` and `test_task_attachments.py`, unit-testing the two pieces of pure
    logic — invoice-revenue aggregation, attachment storage-path ownership — Section 33 asked
    for that this pass hadn't covered yet). Migration `0014` applied to production
    (`docker compose run --rm migrate apply` → confirmed `Schema is up to date`), API
    rebuilt and redeployed, `/health` confirmed `{"status":"ok","database":"ok"}`, all four
    containers healthy post-deploy. Live end-to-end verification of the actual toggle
    round-trip (register → default `true` confirmed → `PATCH /auth/me` → `GET /auth/me`
    reflects `false`) was interrupted mid-test by the production rate limiter correctly
    firing on repeated registration attempts from one IP (itself a real, live re-confirmation
    of Section 24) — completed on retry once the window cleared; see the final report for
    the exact result.
17. [ ] Live-browser responsive/empty-state audit — a background agent was dispatched this
    pass to do the real Playwright-driven breakpoint sweep across 1920/1440/1366/1024/768/390
    widths plus empty-state/error-state/logged-out checks that item 6 above explicitly left
    undone. Result pending at the time of writing; update this entry with the punch list (or
    confirmation of zero defects) once it reports back.

## Final consolidation pass (26-section audit, given 2026-08-18, same day as above)

Full-system re-verification: git/VPS reconciliation, then a large parallel fleet of
background agents (each independently live-testing against production with disposable
data, none committing/pushing directly — findings reviewed and committed centrally) plus
direct work on infra/security/DB items. This section is the live tracker for that pass;
final consolidated report goes to the user directly at the end, not a separate file.

### Git/VPS reconciliation — DONE
Single authoritative branch (`migration/portable-production-architecture`), 68 commits
ahead of `main`, `main`/`deployment-readiness` fully contained within it (zero unique
commits on either) — no divergent/lost work. No stashes, no reflog anomalies, linear
history, in sync with origin. VPS was 1 commit behind (docs-only) — fast-forwarded.

### Production architecture verification — DONE
All live-checked directly (not assumed): HTTPS valid cert (auto-renewed, Aug 15–Nov 13
2026 window observed), HTTP→HTTPS 308 redirect, HSTS/X-Content-Type-Options/X-Frame-
Options/Referrer-Policy present on every response, CORS correctly rejects an untrusted
origin with no leaked `Access-Control-Allow-Origin` while allowing the real
`speed-num.vercel.app` origin exactly, 12MB request-body cap, Postgres/MinIO have no
host port bindings (confirmed via `docker ps`), MinIO console explicitly disabled
(`MINIO_BROWSER: off`, no `ports:` entry, buckets `anonymous set none`), all 4 containers
healthy, UFW still exactly 22/80/443 v4+v6, `migrate status` reports schema up to date.

### Real bug found and fixed: engagement letters were 100% broken — DONE, deployed, live-verified
A background audit agent tried to create a real engagement letter and got a `409`
regardless of client/title/payload on every attempt. Investigated directly (not
delegated, given DB/data-integrity sensitivity): the API's generic IntegrityError
handler was misreporting the real error as a generic conflict — the actual error, found
via API container logs, was `asyncpg.exceptions.NotNullViolationError` on `token`.
`backend/app/models.py`'s `EngagementLetter.token` had no default while
`db/migrations/0001_schema.sql`'s real DDL has always had a server-side one
(`encode(gen_random_bytes(24), 'hex')`) — the ORM model was simply out of sync with the
database truth, so SQLAlchemy sent an explicit NULL instead of letting Postgres fill it
in. Fixed by declaring the matching `server_default` (commit `0a6c4f3`). Deploying that
surfaced a **second**, previously-masked bug: `MissingGreenlet` on the immediately-next
attempt. Root cause: `items` is `lazy="selectin"`, which piggybacks on the query that
loaded the parent row — a brand-new, never-queried `EngagementLetter` has no such query,
so the first touch of `.items` anywhere downstream tried an implicit lazy load outside
the async-safe context and crashed. Reproduced with and without `payload.items` to
confirm it wasn't specific to either branch, then fixed by seeding `items=[]` at
construction time in both `create_letter` and `duplicate_letter` (commit `34be40f`).
**Both fixes deployed to production and the full lifecycle live-verified end to end**:
create (with real line items, real computed subtotal/total) → GET detail → GET list →
PATCH (title change persisted) → duplicate (independent copy, items copied correctly) →
send (real `LetterSendRequest` body, status→`sent`) → firm-sign (real signature data
URL, 200) → void (`sent`→`void`) → delete both test letters → confirmed empty list.
This means **every engagement-letter creation, on any tenant, since this table
existed, was completely non-functional** until today — a significant finding that
contradicts this project's own earlier "Signature system... real, working" and
"Client letter/email workflow DONE, Real, for engagement letters" claims from prior
passes. Those earlier claims were evidently never actually exercised end-to-end
against a real create call; this pass's rule to "not trust previous reports blindly"
caught a real, previously-invisible, fully-broken core feature.

### Auth/authorization/role-routing E2E audit — DONE, PASS
Independently re-verified end-to-end with real curl calls against production, including
SQL cross-checks for what a live HTTP response can't show directly (Argon2id hash
format, exact lockout counters/timestamps). Every claim in `SECURITY.md` was
re-confirmed live, not assumed: registration validation/duplicate-rejection, generic
non-enumerating login errors, disabled-account rejection enforced server-side (checked
on every request, not just at login), exact lockout threshold (10 failed attempts → 15
minute lock, matching `local_auth.py`'s constants exactly), refresh rotation +
reuse-detection with **cascading revocation independently proven** (replaying an old
token invalidates the *entire* chain, including a token that had never been used),
logout invalidation, anti-enumerating password-reset requests, forced-password-change
enforced server-side via real `428` (not just a frontend gate — tested by hitting a
protected route with a temp-password session before the change), exactly one login
form with server-side (not just frontend) role routing, client-portal accounts
independently confirmed blocked from firm-only routes via real `403`. Google OAuth
correctly reports `BLOCKED BY CREDENTIALS` (`/auth/oauth/providers` → `{"google":
false}` in production; button correctly absent). One **defense-in-depth recommendation**
(not a live bug — confirmed not currently exploitable given Caddy's current config):
`deps.client_ip()` trusts the client-supplied `X-Forwarded-For` header with no
proxy-trust boundary check; harden it to only trust XFF from a known proxy hop if the
reverse-proxy layer ever changes. No code changes were needed — everything tested
matched the implementation.

### Admin/firm portal complete UI+CRUD sweep — DONE, mostly PASS, several real bugs found and fixed
A large fan-out of sub-audits across every firm-side page not already fixed this
project. Real, genuine defects found and fixed (all following the established
`toast.error`+rollback-on-failure convention, all independently `tsc`/`eslint`-checked,
none committed by the sub-agents themselves — reviewed and committed centrally):
- **`workflows-client.tsx`** (task board move/delete): real API calls, but unconditional
  success toasts + empty catches meant a failed status-change or delete still told the
  user it worked and left the UI in the wrong state. Fixed to await and roll back.
- **`workflows/new/page.tsx`**: client/team dropdowns were **always** demo-fixture data
  (non-UUID ids) regardless of live state — confirmed live that submitting one of these
  produced a real `422 uuid_parsing` from the backend, meaning task creation via this
  form was silently impossible whenever a real id was needed. Fixed to fetch real
  `/clients`/`/team` with fallback only on API failure.
- **`workflows/new/new-task-client.tsx`**: on a failed `POST /tasks` (e.g. exactly the
  422 above), the code showed a success toast and navigated away as if the task had
  been created — confirmed live via `GET /tasks` count staying at 0 after the failure.
  Fixed to surface the real error instead.
- **`notifications-client.tsx`**: `markRead`/`markAll` used `.catch(() => {})` with an
  unconditional success toast on `markAll` — fixed to await, roll back, and
  `toast.error` on failure.
- **`clients/new/page.tsx`**: the "Assigned accountant" dropdown and custom-fields
  section were **always** demo-fixture data even in live mode — confirmed live that the
  real tenant's actual team/fields were completely different from what was shown, and
  that picking a fixture name silently produced `owner_id: undefined` on the created
  client (the frontend's own UUID validation stripped the non-UUID fixture id before
  posting). Fixed to fetch real `/team`/`/custom-fields`.
- **`team-member-client.tsx`**: the Notes tab is local-state-only with no backing table
  or endpoint — **flagged, not fixed** (needs a new `profile_notes` table/endpoint,
  out of scope for a UI-only fix). The UI gives no indication a note won't survive a
  refresh; worth a small "not saved" affordance even before the real feature exists.
- **`integrations-client.tsx`/`page.tsx`**: **100% fake** — every control was
  `localStorage`-backed or a no-op `toast.info()`, including a hardcoded "Connected"
  badge and a transport dropdown hardcoded to `"resend"` on a tenant actually running
  `smtp`, plus a fixture "Recent emails" list. Rewired to the same real
  `/settings/email`/`/settings/email/test` endpoints Settings already uses for the one
  real per-tenant field (`email_from_name`); removed the fake fields/buttons rather
  than inventing a fake replacement. "Recent emails" was removed, not replaced — a real
  version needs a new backend email-log endpoint that doesn't exist yet (**flagged for
  triage**, not fabricated).
- Confirmed already-correct (real data, real CRUD, real error handling, no fixes
  needed): `/overview` (with one **documented, in-code-commented, not-hidden** gap —
  the revenue trend chart has no backing monthly-series endpoint yet, correctly using
  demo data with an explicit comment rather than fabricating one), `/clients` list,
  `/team` list + detail + accountant modal, `/services`, `/users` (GET verified live
  by the sub-agent; mutations — create staff/PATCH role+title/resend-credentials/
  delete — independently live-verified afterward in a separate, isolated disposable
  tenant so as not to disturb the shared QA tenant's concurrently-running audits:
  `POST /users` → 201 real temp password → `PATCH` role+title → 200 persisted →
  `POST /resend-credentials` → 200 `email_sent:true` real send → `DELETE` → 200 →
  confirmed the deleted account's login is genuinely rejected (`403 "This account
  has been deactivated"` on the temp password). One cosmetic-only wording issue
  independently reproduced, matching what the auth audit already flagged: the
  "email delivery isn't configured" message shows even when the caller explicitly
  passed `send_email:false` — not a bug, just a misleading message in that one case),
  `/reminders`, `/deadlines`, `/settings` (branding, digest toggle, test-email — all
  already real from earlier passes), `/import` (client CSV preview+commit round-tripped
  live; user-import commit verified by code+preview only, since committing sends a real
  credential email that isn't cleanly reversible), all four `/engagements/*` pages
  (already correctly wired — the bug they surfaced was the backend creation defect
  documented above, not a frontend issue).

### Import/export, security adversarial sweep, desktop/DR audit, client-portal audit — INTERRUPTED
All four were mid-flight, live-testing against production with disposable data, when
they hit a session-level API quota limit (reset time observed: ~4:30pm Asia/Karachi).
None left partial/uncommitted risky state per their own last-reported action (artifact
cleanup was in progress or already done in three of the four). To be resumed/rerun once
the quota window passes — **not yet reported, do not assume any result for these four
until they actually report back**.

### Responsive UI audit — reported "still running a background sweep," result not yet in.

### Repo hygiene note
Several audit agents wrote scratch files (`*.json`, `.qa_token`, `token.txt`,
`scratch_audit/`, `.audit_tmp/`) directly into the repo root instead of a temp
directory — cleaned up once (harmless, untracked, never staged) but may recur as more
agents finish; sweep again before final sign-off so `git status` is clean.

### Connective end-to-end smoke test (Section 23) — DONE, this contributor
Rather than duplicate the piecewise coverage already produced by the other agents
(auth, admin-UI, and the in-flight client-portal/import-export/desktop-DR audits),
ran the specific *connective* chain across those pieces that nothing else exercised
continuously in one pass — in a brand-new, fully isolated tenant (register → bootstrap
→ ...) so it wouldn't disturb the other agents' concurrently-running work in the
shared QA tenant: register real account → bootstrap firm → create real client →
create a client-portal login for it (`POST /users` with `client_id`, since
`POST /clients/{id}/portal-invite` deliberately never echoes the temp password —
correctly more secure than the staff-creation endpoint, but means that specific path
needs real mailbox access to test end-to-end, same limitation the auth audit already
hit for password-reset) → portal login with temp password (`must_change_password:
true`, correct `client_id`) → confirmed `428` on the **client-portal's own dashboard
endpoint** (not just a firm-side route) before the password change → changed password
→ confirmed dashboard now returns real (empty, correctly-shaped) data → confirmed
firm-only `GET /clients` still `403`s for this portal session → confirmed the old
temp password now `401`s. Deleted the test client and portal login and logged out
the portal session afterward; the empty parent test tenant itself has no self-service
deletion API (same accepted limitation the auth audit already documented for its own
disposable tenants).
Separately, used this same isolated tenant to independently live-verify the
`/users` mutation paths the admin-UI audit had only code-reviewed (see the `/users`
row above) without touching the shared QA tenant's concurrently-running tests.
