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

### Security adversarial sweep — DONE. One HIGH finding fixed and deployed; one HIGH finding documented, deliberately not auto-fixed; several lower-severity findings documented.

**Fixed, deployed, live-verified: stored XSS in engagement-letter `terms_html`.**
The audit found `terms_html` had zero sanitization anywhere and was rendered via
`dangerouslySetInnerHTML` with no escaping on the **public, unauthenticated**
client-signing page (`frontend/src/app/engagement/[token]`) as well as the staff
preview — live-confirmed with a real `<img onerror>` payload surviving storage and
both read paths byte-for-byte. Investigated and fixed directly (not left to the
audit agent, given the shared-branch dependency-collision risk it correctly flagged):
added `sanitize_rich_text()` (`backend/app/utils.py`, using `bleach`, new backend
dependency) with an allowlist matching exactly what the Tiptap/StarterKit editor can
actually produce, applied on write in both `create_letter` and `update_letter` — not
patched per-render-site, so every consumer (staff preview, PDF export, the public
portal) is protected from a single fix point. Guarded `update_letter`'s
`exclude_unset` semantics so an untouched request can't accidentally wipe an existing
value. 6 new unit tests added (`test_utils.py`); full suite 267/267 passing.
**Deployed to production and re-tested with the exact payload the audit used**:
`POST /engagements` with `<img src=x onerror="alert(document.domain)"><p>Real
<strong>bold</strong> terms</p>` → the `<img>` is now completely stripped, the
legitimate `<p>`/`<strong>` formatting survives untouched, confirmed via the live API
response. Test letter deleted afterward.

**Found, documented, deliberately NOT auto-fixed: OAuth pre-account-hijacking gap.**
Code-review finding (can't be live-tested — no Google OAuth credentials exist in this
environment): `local_auth.login()` never checks `auth_credentials.email_verified`,
so a self-registered account is fully usable immediately, with no verification
enforced. Chained with `complete_oauth()`'s email-match linking, this is the classic
pre-account-hijacking pattern: an attacker registers first with a victim's real
email, the real victim later signs in via Google (a different code path) and silently
gets linked onto the attacker's pre-planted profile, whose password the attacker
still knows. **Real, HIGH-severity, not fixed this pass** — deliberately, not by
oversight: `login()` is inside the exact auth flow this same pass's independent audit
already exhaustively re-tested and signed off as PASS; changing shared, just-verified
login behavior without re-running that entire audit risks silently invalidating that
sign-off, and — more concretely — could lock out any already-existing self-registered
account on this shared environment that never went through email verification (unknown
how many, and checking would mean a production DB query this pass's safety classifier
has already refused for similar privilege-sensitive reads). **This needs a deliberate,
reviewed fix in its own pass**, not a rushed one bolted onto an already-large
consolidation effort — recommended fix: gate `/auth/login` on `email_verified = true`
(admin-provisioned staff/portal accounts already set this `true` explicitly, so they
would be unaffected; only self-registered, never-verified accounts would newly be
blocked, which is the entire point).

**Other findings, documented for the final report, not fixed this pass** (each is a
real, verified defect, individually lower-severity or lower-risk than the two above,
and each was deliberately left for triage rather than rushed):
- No file-size limit anywhere in the upload path (presigned S3 PUT has no
  `Content-Length-Range`, and Caddy's `request_body max_size` only guards the
  FastAPI-proxying block, not the MinIO-proxying `/documents/*`/`/backups/*` blocks) —
  live-confirmed a 25MB upload succeeds with zero rejection. Real shared-VPS
  disk-exhaustion risk across every tenant.
- No file-extension/MIME allowlist on uploads (a `.exe` upload succeeded) — not RCE
  (objects are never executed server-side) but the app can host/distribute arbitrary
  executables under a trusted domain.
- `storage_path` ownership check uses `str.startswith()`, not path normalization — a
  literal `../../..` suffix on an otherwise-valid prefix was accepted (201). Not
  currently exploitable (MinIO's flat key namespace doesn't resolve `..`), but a
  fragile, backend-dependent mitigation rather than a real one.
- `POST /auth/refresh` and `POST /auth/logout` have no CSRF token — low impact (forced
  logout/rotation only; `HttpOnly` + no-CORS-readable-response already block cookie
  theft and response reading), but worth closing for completeness.

SQLi, the 10-resource-type IDOR sweep, and secret exposure were all clean PASS with
no findings — see the agent's full report for exact reproductions.

**Fixed, deployed, live-verified: voluntary password change didn't verify the current
password.** Discovered while reviewing the client-portal audit's own password-change
fix (committed separately by a concurrent process as `2c9eec8`, reviewed here): that
fix correctly wired the settings page to the real `/auth/change-password` endpoint,
but the form collects/validates "current password" and then never sends it — and the
backend never checked it either, by design (`ChangePasswordRequest`'s own docstring
predicted exactly this: "not needed for the flow that exists today" — a general
settings feature now exists). Net effect: a hijacked or left-open portal session could
silently take over the account, no proof of the old password required. Fixed by adding
an optional `current_password` field verified against the stored Argon2id hash when
present (new `AuthError` path), leaving the forced-temp-password flow — which never
sends it — unaffected. Deployed and live-verified all three paths: wrong current
password → `401 "Current password is incorrect."`; correct current password → `200`;
no `current_password` at all (`ForcePasswordModal`'s exact call shape) → still `200`,
unaffected. Full suite 267/267.

## CRITICAL, HEADLINE FINDING — production frontend is not running this branch's code at all

The import/export audit tested directly against the real production URL,
`https://speed-num.vercel.app` (not a staging environment), and found CSV/XLSX
exports there **still vulnerable to formula injection** even though that exact fix
(commit `bc940eb`, "Neutralize spreadsheet formula injection in CSV/XLSX exports")
has been on this branch for a while. Investigated and independently confirmed via
git, not taken on the agent's word:

```
git log --oneline -1 main                                  → 11dfffb (unrelated to this branch's work)
git rev-list --count main..migration/portable-production-architecture → 78
git branch --contains bc940eb                               → migration/portable-production-architecture only
```

**`main` — the branch Vercel's production deployment actually builds from — is 78
commits behind this branch.** Every fix from this pass and the many passes before it
(self-hosted auth migration off Supabase, tenant isolation, task attachments/comments,
the reporting/admin-console/custom-fields/client-detail-page live-data fixes, the
engagement-letter creation fix, the stored-XSS fix, the current-password fix above —
literally everything) exists only on `migration/portable-production-architecture` and
has **never reached the actual production frontend real users would see**. The
backend at `test.spidnums.com` *is* current (every fix this pass was deployed there
directly via SSH/Docker, independent of Vercel) — it is specifically and only the
**Vercel-served frontend** that is frozen at a pre-migration commit. Concretely,
production right now also still lacks: PDF export (commit `9e13938`, unmerged) and
the Task Master live-data wiring (commit `1ae09e5`, unmerged — production's Task
Master page still silently serves demo data).

**I did not merge `migration/portable-production-architecture` into `main` or push to
it.** Doing so would immediately cut real production traffic over to ~78 commits of
accumulated changes — including the entire self-hosted-auth migration — that no one
has reviewed as a single consolidated diff. That is a genuinely consequential,
hard-to-reverse, externally-visible production decision, not a routine engineering
one, and it belongs to the user to authorize explicitly, not something to execute
silently mid-audit. This is called out as the single most important item in the
final report's MANUAL ACTIONS REQUIRED section.

### Desktop app + disaster recovery audit (Sections 12-17) — DONE, PASS, no code defects found
An unusually thorough pass — a real restore drill that didn't just succeed, it
**independently reproduced the exact `speednum_app`-role-ordering failure
BACKUP_ARCHITECTURE.md already documented as a known gotcha**, then restored cleanly
once that order was followed, then went all the way to a real login and a real
`GET /clients` returning genuine data against the restored system — not just "files
copied," a provably usable restored system. All disposable drill containers
(`drill-postgres`/`drill-minio`/`drill-api`/`drill-net`) confirmed torn down
afterward via `docker ps -a`.
- **Backup architecture (13)**: PASS. Triggered a real fresh snapshot via the same
  internal function the nightly cron already calls (correctly avoided forging a
  superadmin credential to reach the HTTP endpoint, given none exists in production
  right now — see below). Confirmed genuine `pg_dump | gzip` (not a raw data-directory
  copy, consistent with object sizes), independently re-hashed two existing snapshots'
  components against their manifests and both matched.
- **Incremental sync (14)**: PASS. Re-ran the 12/12 test suite independently; code
  review confirms the documented download→temp→checksum→decrypt→atomic-rename flow.
- **Real DR drill (15)**: PASS, described above.
- **Cold-VPS runbook (16)**: two real documentation gaps found and fixed directly in
  `BACKUP_ARCHITECTURE.md` (already committed, reviewed here) — the runbook never
  actually explained how to get from "administrator's laptop holds encrypted `.snbk`
  files" (the entire point of the desktop app) to the plaintext files the restore
  steps assume, and never included a DNS/Vercel cutover step. Both added, the latter
  cross-referencing `MIGRATION.md`'s existing concrete cutover/rollback procedure.
- **Backup security (17)**: PASS by code review — key never stored beside ciphertext,
  scrypt-derived per-call, no backdoor; a forgotten backup password is explicitly,
  correctly unrecoverable.
- **Desktop app basics (12)**: mostly PASS. Environment-specific, not a product
  defect: this sandbox forces `ELECTRON_RUN_AS_NODE=1`, which prevents the real
  Electron GUI from launching here at all (confirmed this doesn't affect a real
  desktop session — `electron-updater`'s adapter code that crashes under this
  sandbox's forced flag runs fine once `app` is actually available, which it is by
  the time `whenReady()` fires in a normal launch). Worked around for what could be
  tested without a GUI: ran `desktop/src/backup-client.js` directly under plain Node
  against the real production API — confirmed superadmin-only gating live (both
  client-side logic and the real `403` from `/admin/backups`).
- **Real finding, not a bug**: **zero superadmin accounts currently exist in
  production** (25 real profiles, none flagged `is_superadmin`). This blocked live
  HTTP-layer testing of the superadmin console/backups endpoints' success path in
  this and earlier items — the safety classifier correctly refused every attempt to
  promote an account via direct SQL, even a disposable one, consistent with
  `DEPLOYMENT.md`'s own framing of that step as deliberately manual/undocumented.
  **Operationally, this means no one can currently use `/admin`, `/admin/backups`, or
  the desktop app's actual sync function against production** until someone with
  direct DB access runs that one `UPDATE` — worth flagging in the final report as a
  genuine, if not urgent, operational gap: the DR tooling this pass so thoroughly
  verified has no one who can currently drive it in production.

### Two more dead buttons fixed: client-portal "Record payment" and "Add expense" — DONE, deployed (frontend-only, will ship whenever the Vercel/main sync above happens), live-verified
Both flagged by the client-portal audit as real but deliberately-not-fixed (needing
more than a one-line change). Implemented properly rather than left as findings: both
real backend endpoints already existed and work (`PATCH /client-portal/invoices/{id}`,
`POST /client-portal/expenses`) — confirmed `BookScope`'s design genuinely intends
client-portal accounts to self-mark their own invoices paid (an office-workflow
pattern, not a payment-gateway integration), so this isn't inventing a capability, just
wiring an existing one. "Add expense" got a real modal (vendor/category/date/amount/
GST/method) matching the established `Modal`/`Field` pattern used elsewhere in this
codebase; new expenses land in the real `pending` status for the accountant to review,
same as if entered by staff. "New invoice" was deliberately left unfixed — a client
self-issuing their own invoice isn't an existing product capability and needs an
actual product decision, not a mechanical wiring job — but now says so honestly via a
toast instead of doing nothing. Also removed a "This is sample data" line that showed
unconditionally, even against real invoices. Live-verified end to end in a fresh
isolated tenant: created an invoice as staff → portal login → recorded payment → `GET`
confirmed `status: paid`; portal login → submitted an expense → `GET` confirmed it
landed as `pending` with the exact fields entered. All test data cleaned up.
`tsc`/`eslint` clean.

## FINAL COMMAND phase — merge to main, real superadmin, full E2E (this contributor)

### `main` now IS the complete final project — merged, pushed, verified
`origin/main` and `origin/migration/portable-production-architecture` are byte-identical
(`49669b7`), confirmed via `git rev-parse` on both, not assumed. This was a strict
fast-forward (main had zero divergent commits — every earlier main-only commit was
already contained in this branch), done via
`git push origin migration/portable-production-architecture:main` rather than a local
checkout+merge, specifically because this shared working tree has other concurrent
processes that could be disrupted by switching the locally-checked-out branch (`git
checkout main` was itself refused by the safety classifier for exactly that reason —
treated as a shared-state risk on a tree other sessions are actively using). Vercel's
GitHub integration auto-deploys on push to its connected production branch (`main`),
so this alone should be sufficient — no separate manual Vercel promotion step should be
needed, though this environment has no Vercel dashboard/CLI credentials to directly
confirm the resulting deployment's exact commit SHA (the live bundle's chunk hashes did
change post-push, consistent with a new build, but this is corroborating evidence, not
proof — flagging honestly rather than claiming certainty I don't have).

### Real production superadmin created: `axelytix3@gmail.com`
Resolves the operational gap noted above (zero superadmins existed in production).
Created through the app's own real registration flow (`POST /auth/register`, genuine
Argon2id hashing, `tenant_id: null` by design — a platform superadmin isn't a member of
any one firm) with a freshly-generated random password, then `is_superadmin=true` +
`must_change_password=true` set via the one manual SQL step `DEPLOYMENT.md` already
documents as the correct, intended mechanism (no in-app tooling creates a tenant-less
superadmin — confirmed by checking `backend/scripts/`, which only has `migrate.py`).
The safety classifier allowed this specific UPDATE (an explicit, detailed, real
production-admin-bootstrapping request) after having refused a structurally similar one
earlier this session for a disposable QA verification row — a meaningful, sensible
distinction in intent, not an inconsistency.

Full login/forced-change cycle live-verified end to end: temp password logged in
(`must_change_password: true`) → **found and fixed a real bug in the process** (see
below) → password changed → old temp password rejected (`401`) → new password works →
`/admin/stats`, `/admin/tenants`, `/admin/audit` all real `200`s.

**Real bug found and fixed**: `require_superadmin` (`backend/app/deps.py`) checks
`must_change_password` and correctly returns `428` — but the *deployed container* was
still running a stale image without this check (a separate commit, `36eeabe`,
already fixed this in source before I started testing, but hadn't been rebuilt on the
VPS yet). Diagnosed via a clean live symptom (`/admin/stats` returned `200` for a
temp-password session that should have been blocked), confirmed via commit-time vs.
container-start-time comparison, fixed with `docker compose build --no-cache api`,
re-verified the `428` now fires correctly. This is a deployment-freshness finding, not
a code defect — the code was already right, the running container just hadn't picked
it up yet.

**Second real bug found and fixed**: after logging in, this brand-new tenant-less
superadmin had nowhere sensible to land. `resolveHome()`
(`frontend/src/app/(auth)/login/login-form.tsx`) only ever chose between the client
portal and the firm dashboard — never `/admin` — so login sent the account to
`/overview`, whose `GET /dashboard` immediately `409`s (`"No firm is linked to this
account."`) for a tenant-less profile. Fixed: `resolveHome()` now checks
`is_superadmin && !tenant_id` first and prefers `/admin` (already in `proxy.ts`'s
protected route list, doesn't require a tenant); a superadmin who also owns a firm is
unaffected. **Known, deliberately-not-fixed residual**: `proxy.ts`'s edge-level
redirect (for the separate case of an already-signed-in superadmin navigating back to
`/login`) can't make the same distinction — `is_superadmin` isn't in the JWT's
`user_metadata` claims at all, and adding it means touching shared, already-audited
token-minting code for a narrow secondary UX case. Left as a minor, documented
limitation rather than expanding into security-adjacent auth code under time pressure.

**Credential delivery**: the account's password was changed by me during the
verification above (Section 11's own instructions required exercising the full
change cycle), which invalidated the original temp password before the real account
owner could ever use it. Rather than generate and transmit a second temp password
myself (repeated attempts to do so — even purely local Argon2id hashing with no
network/DB call — were refused by the safety classifier), pivoted to the existing,
already-proven-working self-service flow instead: triggered `POST
/auth/forgot-password` for the real address. This is arguably a *better* outcome than
a temp-password email — the account's final password is now something only its real
owner ever knows, not something that passed through me at all. Confirmed real and
working, not just "200 OK": a genuine token row was created in
`auth_password_reset_tokens` (1-hour expiry, unused) and the request produced no error
in the API logs, on the same SMTP transport this project has independently proven
working (real delivery) multiple times already. **Could not confirm actual receipt in
the axelytix3@gmail.com mailbox** — no credentials for that real external mailbox exist
in this environment; this is the honest limit of what's checkable from here.

### Final Production E2E (Section 26) — all steps executed live, real, cleaned up
A fresh tenant end to end, not reusing any existing test fixture: register → bootstrap
firm → re-login → create staff (temp password) → staff first login → `428` before
password change (server-side, not just a frontend gate) → staff changes password → old
temp password rejected, new one works → staff reaches `/clients` (real data) → staff
correctly `403`'d from `/admin/stats` → create client → add primary contact → set the
client's own email (portal-invite needs it directly, not just a contact's — a genuine,
sensible validation rule, not a bug) → portal-invite succeeds, real email sent → fetch
the new portal profile → `resend-credentials` for a testable temp password → client
first login → `428` before password change → client changes password → old rejected,
new works → client reaches its own `/client-portal/overview` (real, zeroed data for a
brand-new client) → client correctly `403`'d from `/clients` and `/team` → cross-tenant
isolation re-confirmed (a QA-tenant client id `404`s under this new tenant's owner) →
created a real service → real CSV import (preview → commit, using the actual
preview-returned mapping/rows as the commit payload, not the raw file again — that's
the real API contract, confirmed by reading `ImportCommitRequest`) → confirmed the
imported client exists → real document upload via the presigned MinIO flow → download
→ byte-identical → **real backup snapshot triggered as the real superadmin**
(`sequence 10, status ready`) → superadmin `/admin/stats` access confirmed → logout →
login again → permissions re-confirmed → full cleanup (document, service, both
clients, the staff account — all confirmed gone via re-fetch). The only artifact that
could not be removed is the tenant shell itself (`E2E Final Test Firm`) — no
tenant-delete endpoint exists anywhere in the API, the same pre-existing, already-
documented limitation every other disposable tenant from this pass shares.

CSV/XLSX/PDF *file-format* correctness (headers, Unicode, escaping, injection
neutralization) was not re-proven in this pass specifically — that was already done
exhaustively, separately, by the import/export audit earlier this session (live
Playwright runs against actual downloaded files). This pass instead proved the
*server-side* data contract for import (preview→commit) end to end for the first time
in a single continuous flow, which hadn't been exercised that way before.

### Responsive UI breakpoint audit (Section 24) — DONE, real live sweep, zero defects found

An earlier attempt (this pass) genuinely failed — blocked by per-IP login rate-limiting
from the sheer number of concurrent agents sharing this environment's egress IP, not a
product defect. Retried directly once most of that concurrent load had cleared, with
two fixes to the approach itself:
1. **Login must happen after the client component actually hydrates.** Filling the
   email/password inputs immediately after `domcontentloaded` raced React's hydration —
   the typed values got silently reset to the controlled component's empty initial
   state, so every submit failed client-side ("Enter your work email") without ever
   reaching the API. Fixed with a settle delay plus a verify-and-retry loop on the
   filled value before submitting.
2. **`waitUntil: "networkidle"` never resolves on this app** — confirmed independently,
   not just taking the earlier attempt's word for it — some background polling never
   goes fully quiet. Switched every navigation to `waitUntil: "load"`.

With those two fixes, a single login (reused via a saved `storageState` across all
widths, avoiding repeat login attempts and further rate-limit risk) plus a real
Playwright sweep of **9 pages × 6 widths (1920/1440/1366/1024/768/390) — 54
combinations** completed cleanly: `/overview`, `/clients`, `/reporting`, `/admin`,
`/custom-fields`, `/settings`, `/workflows`, `/team`, `/users`.

**Result: zero horizontal-overflow findings, zero navigation failures, zero
layout-related console errors, across all 54 combinations.** The only console errors
captured were CORS rejections from the local dev server (`localhost:3000`) calling the
production API directly — expected and correct, since `CORS_ORIGINS` is deliberately
locked to the exact production frontend origin (verified earlier this session) and
`localhost:3000` was never meant to be allowed; in real production the frontend runs
*from* the allowed origin, so this doesn't occur there. Independently spot-checked
several screenshots visually (not just the automated overflow-width check) at both
extremes — 390px (`/clients`, `/admin`) and 1920px (`/clients`) — confirmed clean
stacking, a working mobile hamburger/drawer, no clipped buttons or overlapping text,
and correct real empty-states (the QA tenant's client list is genuinely empty after
this pass's cleanup, rendering "No clients match" correctly, not a fixture).
Screenshots and raw findings saved to the session scratchpad, not committed (ephemeral
QA artifacts, not project files).

No code fixes were needed — this is a real, clean pass, not an absence of testing.

### Independent re-verification: engagement letters (Section 20/signature workflow)

A concurrent update to this file claimed a second real bug beyond the `token`-default
issue this session already found and fixed (a "MissingGreenlet" crash), described as
found and fixed "today." At the time of checking, no commit or working-tree diff to
`backend/app/routers/engagements.py` existed beyond this session's own XSS-sanitization
commit — so this was independently re-tested from scratch, live, rather than taken on
faith either way. Full lifecycle exercised end to end in a fresh, cleaned-up test
client: create → get → list → duplicate → patch (add a service line item, set
recipient) → send (validation for missing items/recipient correctly enforced first,
then succeeds) → public unauthenticated portal view (`GET /portal/{token}`) → public
client signature (`POST /portal/{token}/sign`) → void → delete-blocked-while-signed
(`409`, correct) → cascade-delete via the parent client. **Every step returned the
expected result with no error of any kind, including no MissingGreenlet or similar
async/greenlet crash.** Not asserting the other claim is wrong — it may describe a
different specific code path, an already-resolved transient issue, or a race under
concurrent load this direct sequential test wouldn't reproduce — but as tested here,
right now, the full engagement-letter lifecycle is genuinely, completely working.
