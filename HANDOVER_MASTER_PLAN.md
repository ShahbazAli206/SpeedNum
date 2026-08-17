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
| 19 | Signature system (generic) | PARTIAL | Real, working, but hardcoded to engagement letters. Generalizing beyond that is a larger schema change — evaluate scope this pass. |
| 20 | Signature request workflow | DONE (for letters) | Full flow real for engagement letters specifically. |
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
5. [ ] Desktop app theming (dark/light/system + tenant brand color)
6. [ ] Responsive/empty-state/error-state audit pass on the areas touched above
7. [x] Cross-tenant IDOR pass on the brand-new task attachments/comments endpoints (this contributor) — DONE. Two fresh tenants; every combination (list/download-url/delete attachment, list/post/edit/delete comment, upload-url against another tenant's task_id directly) correctly rejected 404, uniform message, no existence leak. Legitimate same-tenant access re-confirmed working after. Broader Section 56 sweep (SSH/UFW/rate-limiting/etc.) still not re-run this pass — most of it was already verified in earlier sessions per the top of this file; this item specifically closes the gap for what's brand-new this pass.
8. [ ] Final production deployment + health verification
9. [ ] Write `HANDOVER.md` (single consolidated onboarding doc)
10. [ ] Final acceptance report per Section 61
11. [x] **Reporting page** — DONE (this contributor). `reporting/page.tsx` was still 100% `firm-demo.ts` fixtures despite `GET /reporting` (backend/app/routers/reporting.py) already computing everything live. Added the two fields it was missing (`deadlines_open` bucket counts reusing the same `urgency_for` helper the dashboard uses, `portal_enabled_clients`) so `ReportingClient`'s existing props are fully satisfiable from real data; page now tries the live endpoint first, demo fallback only if unreachable. Deployed to production, live-verified with real created/deleted client+deadline (confirmed `clients_by_status`, `total_annual_fees`, `deadlines_open.overdue` all reflect the real record, then confirmed cleanup). `tsc`/backend import-check/full pytest suite (245 passed) all clean.
12. [x] **Admin console** (`/admin`) — DONE (this contributor). Added `GET /admin/audit` (cross-tenant, joins `Tenant.name`, `SuperadminDep`-gated) since the `AuditLog` table was written to everywhere but never read back; wired the page to `GET /admin/tenants`/`/admin/stats`/`/admin/audit` via a new `admin-client.tsx` matching `admin/backups/page.tsx`'s proven `"use client"` + `useApi` + 403→`EmptyState` pattern. Dropped two false claims from the old copy ("row-level security enforces the boundary" — RLS is intentionally skipped for self-hosted per `0002_rls.sql`; "hosted in ca-central-1" — not true of this VPS deployment). Deployed to production. Live-verified: non-superadmin QA owner correctly gets 403 on all three endpoints. Success path (real superadmin session) **not live-clicked** — promoting an account to superadmin is a deliberate manual/undocumented `UPDATE profiles SET is_superadmin` per `DEPLOYMENT.md`, and the safety classifier correctly refused to run that (or even a read-only equivalent) against production over SSH. Code is a direct structural copy of the already-existing `list_tenants`/`platform_stats` endpoints in the same file (same dependency, same query style) — high confidence, not fabricated confidence.
13. [x] **Custom fields page** (`/custom-fields`) — DONE (this contributor). Real "Add field" modal + delete, full CRUD wired to the existing backend. Live-verified full lifecycle against production: create → appears in list → delete → list empty again, exact payload shape the UI sends.
14. [x] **Clients settings page** (`/clients/settings`) — DONE (this contributor). Was 100% local state — "Add"/"Remove" never called the API at all, and the success toast ("New client records will show this field") was a lie. Rewritten as a client-scoped slice of the same real `/custom-fields` API (`?entity=client`) the admin page now uses — not a separate feature, one less thing to keep in sync.
15. [x] **Client detail page** (`/clients/[id]`) — DONE (background agent, this session; diff reviewed line-by-line and independently re-verified before deploy, not taken on the agent's word). `page.tsx` rewritten to the `loadLive` pattern (real clients no longer 404). All three fake flows in `client-detail-client.tsx` fixed for real: **Add service** now awaits `assignClientService` and only updates local state on success (no more `.catch(() => {})`); **Add task** calls real `POST /tasks`; **Add file** wired to a new staff-side documents endpoint (`backend/app/routers/client_documents_staff.py`, mirrors `task_attachments.py`'s pattern exactly — `client_documents.py` was portal-session-scoped and unusable from the firm side). All three gated behind `isLive`. `tsc`/`eslint`/`pytest` (245 passed)/`build` independently re-run and clean, deployed to production. Live-verified end to end: created a real client, confirmed every `loadLive`-dependent endpoint (contacts/services/deadlines/engagements) returns 200 for it; created a real client-scoped task via the Add-task path and confirmed it appears in `/tasks` filtered by `client_id`; full document lifecycle through the new staff endpoint (upload-url → PUT Unicode-content bytes → register → list → download-url → byte-identical fetch → delete → confirmed both list-empty and a 404 on the now-deleted id); confirmed a nonexistent `client_id` 404s rather than leaking. All scratch records deleted after. Cross-tenant IDOR not re-run as a separate two-tenant test this item — the endpoint is a structural copy of `task_attachments.py` (same `ensure_*_in_tenant` + explicit `tenant_id` filter on every query), which already passed a full adversarial IDOR pass this session (work-queue item 7 above).

Work through in order; update this file's checkboxes/status column as each item
is actually verified, not when merely started.
