# Caseware Integration — Repository Audit (Phase A)

**Status:** Read-only audit. No Caseware code, models, migrations, or UI have been written. This document is the required output of Phase A in `SPEEDNUM_CASEWARE_IMPLEMENTATION_PLAN.md` §4, produced before any Phase B+ work begins.

**Scope:** Confirms/refutes the assumptions in `CASEWARE_WORKFLOW_SPEC.md` and `SPEEDNUM_CASEWARE_IMPLEMENTATION_PLAN.md` against the actual codebase, so later phases build on facts, not the spec's guesses.

---

## 1. Existing database models

`backend/app/models.py` (SQLAlchemy 2.0 `Mapped`/`mapped_column`, all tables `tenant_id`-scoped unless noted):

| Model | File:line | Fields relevant to Caseware work |
|---|---|---|
| `Tenant` | `models.py:85` | `name`, `slug`, `plan`, `seats`, `is_active`, `settings` (JSONB) |
| `Profile` | `models.py:121` | `id` = auth subject UUID; `tenant_id` (nullable), `client_id` (nullable — set = portal user), `role` (owner/admin/member/viewer), `role_id`, `is_superadmin` |
| `Role` / `RolePermission` | `models.py:155` / `:220` | tenant-scoped named roles + `(role_id, permission_key)` grants |
| `Client` | `models.py:250` | **`owner_id`** (`models.py:276`, FK → `profiles.id`) = assigned staff |
| `Task` | `models.py:381` | **`assignee_id`** (`models.py:402`, FK → `profiles.id`), `client_id`, `status`, `task_type` |
| `TaskTimer` | `models.py:413` | per `(task_id, assignee_id)` |
| `Document` | `models.py:572` | `client_id`, `letter_id`, `task_id` (attachments reuse this table), `storage_path`, `mime_type`, `size_bytes`, **`is_client_visible`** (`:596`), `uploaded_by` |
| `EngagementLetter` / `EngagementLetterItem` | `models.py:495` / `:552` | `status` enum, `token`, signing fields |
| `AuditLog` | `models.py:983` | already exists — see §12 |
| `Notification` | `models.py:897` | `profile_id`, `type`, `title`, `body`, `link`, `is_read` |

**Confirms** the spec's actor mapping in `CASEWARE_WORKFLOW_SPEC.md` §2 is accurate as written.

---

## 2. Migration framework

**Not Alembic.** Custom hand-rolled runner: `backend/scripts/migrate.py` applies raw SQL files from `db/migrations/*.sql` once each, tracked in `public.schema_migrations`. Naming: `NNNN_description.sql`, 4-digit zero-padded. Commands: `status | baseline <ver> | apply [--dry-run]`.

Most recent files: `0028_task_timers.sql`, `0028_video_calls.sql`, `0029_timesheet.sql`. **Next Caseware migrations must start at `0030_...`.**

Some statements are Supabase-only and skipped via `MIGRATIONS_SKIP` on plain Postgres — irrelevant to new Caseware tables but worth knowing the mechanism exists.

---

## 3. Authentication / session / tenant derivation

JWT bearer tokens verified in `backend/app/security.py::verify_token`. Auth chain in `backend/app/deps.py`:

- `get_current_user` (`deps.py:111`) loads `Profile` by the token's `user_id`, then derives `tenant` **server-side** from `profile.tenant_id` (`deps.py:127-129`) — never from a request body/query/header.
- The one exception (superadmin impersonation) still derives tenant from a signed JWT claim gated on `profile.is_superadmin`, not a client-supplied value.
- Dependents: `AnyTenantUserDep`, `TenantUserDep` (excludes portal accounts), `require_admin`, `require_owner_or_superadmin`, `require_permission(key)`, `BookScopeDep` (pins portal users to `profile.client_id`).

**Confirms** the plan's §13 "never trust frontend-supplied tenant_id" requirement is already the codebase's existing pattern — a new Caseware router should derive `tenant_id` from `user.tenant_id` exactly like every other router.

---

## 4. Existing permission helpers

`backend/app/permissions.py`:

- `PERMISSION_KEYS`: `clients.view_all`, `clients.manage`, `clients.delete`, `clients.assign`, `services.manage`, `tasks.view_all`, `tasks.manage`, `invoices.view_all`, `invoices.manage`.
- `resolve_permission(...)` / `has_permission(user, key)` — grant lookup, owner/superadmin always pass.
- `is_firm_owner(user)` (`:184`) — `role == "owner" or is_superadmin`. Gates task creation.
- `can_update_task_fields(user, assignee_id, changed_fields)` (`:198`) — non-owner limited to `{"status"}` on their own assigned task.
- `client_owner_clause(user)` (`:228`) — SQLAlchemy filter: `None` if `clients.view_all`, else `Client.owner_id == user.profile.id`. Used by `clients.py`, `services.py`, `workflows.py`.
- `invoice_owner_clause(user)` (`:244`) — same idea for invoices.

**No `document_owner_clause` or equivalent exists.** This is the mechanism §4 of the workflow spec / Phase B of the implementation plan needs to add.

---

## 5. Existing document authorization — gap CONFIRMED

- **`backend/app/routers/client_documents_staff.py`** — every endpoint takes `TenantUserDep` (any active firm staff) and scopes only via `ensure_client_in_tenant(session, user.tenant_id, client_id)` (`backend/app/utils.py:88-93`), which checks **tenant membership only**. `client_owner_clause` is not imported or applied anywhere in this file.
- **`backend/app/routers/task_attachments.py`** — same shape: `_load_task` (`:41-43`) checks tenant only, no assignee/owner check.
- **Confirmed as described in the spec**: a staff `Profile` with a firm role but `clients.view_all = False` and *not* the assigned `Client.owner_id` can still list/upload/download/delete that client's documents and task attachments, because these two routers never apply the same owner-scoping that `clients.py` already uses elsewhere.
- **Contrast case, correctly scoped**: `backend/app/routers/client_documents.py` (the client-portal-facing router) uses `BookScopeDep`, pinned server-side to `Profile.client_id`, plus a `_visible_to_portal` filter (`is_client_visible OR uploaded_by == self`). This is not the router with the gap — the gap is entirely on the firm-staff side.

This matches `CASEWARE_WORKFLOW_SPEC.md` §4 and `SPEEDNUM_CASEWARE_IMPLEMENTATION_PLAN.md` §3/Phase B exactly. **Fixing this is Phase B and is independent of any Caseware product/API decision** — it should proceed regardless of what Caseware discovery finds.

---

## 6. Existing MinIO/S3 service

`backend/app/services/storage.py` dispatches to `storage_s3.py` (boto3, MinIO/S3-compatible) or `storage_supabase.py` per `settings.storage_provider`.

Relevant primitives in `storage_s3.py`:
- `create_upload_url` / `create_download_url` — presigned PUT/GET for the **browser**.
- `delete_object`, `put_object_bytes`, `list_objects`.
- **`get_object_bytes(path, *, bucket)` (`:201`) — server-side download already exists**, currently used only by `services/backup_snapshots.py`. This is the primitive a Caseware document-push job would reuse to stream a `Document`'s bytes server-side into the Caseware API, rather than round-tripping through the browser (satisfies plan §21's requirement).

Config: `S3_ENDPOINT_URL` (internal), `S3_PUBLIC_ENDPOINT_URL` (browser-facing), `S3_BUCKET`, path-style addressing for MinIO.

---

## 7. Existing notification service

`backend/app/services/audit.py::notify(session, *, tenant_id, title, body=None, link=None, type="info", profile_id=None)` — **single-recipient only**, writes one `Notification` row. Callers needing multiple recipients loop and call it once per profile (e.g. `client_messages.py:268-289`). Email is a **separate, explicit** call to `services/email.py` template functions — `notify()` does not send email itself.

**Implication:** a Caseware "document uploaded" or "sync succeeded" notification will need to loop over the recipient set (owner + assigned staff) calling `audit.notify` per profile, and separately call an email template function if email is also wanted — there is no combined "notify these N people, in-app and by email" helper to call once.

---

## 8. Existing task routes

`backend/app/routers/workflows.py`:
- Task creation is owner-only (`:344-345`, raises 403 "Only the company Owner can create tasks.").
- Non-owner update is restricted via `can_update_task_fields` (`:408-413`) to `status` only, only on their own assigned task.
- `delete_task` / `move_task` follow the same owner-or-own-assignee shape.

**Confirms** plan/spec claims about task assignment are accurate; no delta needed here.

---

## 9. Existing client routes — reference pattern for Phase B

`backend/app/routers/clients.py::_owner_scope(user)` (`:47-63`) wraps `client_owner_clause` and is applied to both `list_clients` and `get_client`. **This is the exact pattern Phase B should copy into `client_documents_staff.py` and `task_attachments.py`** — no new authorization primitive needs inventing, just applying the existing one where it's missing.

---

## 10. Environment variable conventions

Pydantic `Settings` (`backend/app/config.py`), each field with an explicit upper-snake `alias=`: `DATABASE_URL`, `AUTH_PROVIDER`, `JWT_PRIVATE_KEY`, `STORAGE_PROVIDER`, `S3_ENDPOINT_URL`, `GOOGLE_CLIENT_ID`/`SECRET`, `PUBLIC_APP_URL`, `CORS_ORIGINS`, etc. A Caseware connection's **global** settings (e.g. `CASEWARE_API_ENABLED`, `CASEWARE_ENCRYPTION_KEY`) would follow this same alias convention — but per-tenant Caseware client id/secret must NOT live here (multi-tenant; see §17 of the implementation plan) — they belong encrypted in the DB, keyed by `tenant_id`.

Frontend: `frontend/.env.example` has only `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SITE_URL`. Everything `NEXT_PUBLIC_*` is baked into the client bundle at build time — **no Caseware secret may ever be a `NEXT_PUBLIC_*` var.** If a public, non-secret value is ever needed client-side it must go through the same build-arg wiring as the two existing vars (`deploy/docker-compose.yml` / `deploy/.env`).

---

## 11. Background job / queue infrastructure

**None.** No Celery/RQ/arq, no Redis (confirmed by absence in `requirements.txt` and a repo-wide grep — the one `redis` mention is a comment explaining why rate limits deliberately use a Postgres table instead). The only background mechanism is an in-process asyncio timer loop, `backend/app/services/scheduler.py`, running inside the API container itself. No `BackgroundTasks` usage found in routers — everything currently awaits inline.

**Implication for Phase F (document sync):** there is no queue to plug a "sync this document to Caseware" job into. Options consistent with existing conventions: (a) a synchronous "sync now" endpoint (matches current style, acceptable for small files given the async S3/HTTP calls involved), or (b) a new `scheduler.py`-style asyncio loop module for retries/large files. Introducing Celery/Redis purely for this feature would be a disproportionate new infrastructure dependency the plan already warns against (§23).

---

## 12. Existing audit logging — EXISTS

`AuditLog` model (`models.py:983`, table `audit_logs`): `tenant_id`, `actor_id`, `actor_email`, `action`, `entity`, `entity_id`, `summary`, `audit_metadata` (JSONB). Write helper `audit.record(session, *, tenant_id, actor_id=None, actor_email=None, action, entity, entity_id=None, summary=None, metadata=None, ip_address=None)` (`services/audit.py:16-41`), already used widely (uploads, deletes, task creation, role changes).

**This already satisfies plan §34's audit-logging requirement structurally** — Caseware events (`caseware_connection_created`, `document_sent_to_caseware`, etc.) should call this existing `audit.record`, not a new logging table.

---

## 13. Existing test structure

`backend/tests/`, pytest, no `pytest-asyncio` — tests are deliberately pure-logic, no live DB (`conftest.py` sets an unroutable `DATABASE_URL` on purpose). Reusable in-memory fixture pattern (`test_task_authz.py:22-32`): construct `Profile` + `Tenant` + `TokenClaims` + `CurrentUser` directly, no DB session, no HTTP client. This is the pattern Phase B/D authorization unit tests should follow.

**Frontend:** no test runner configured at all (no Jest/Vitest/Playwright/Cypress in `package.json`). `e2e/` at the repo root is manual-QA credentials/config for a live deployment, not automated test code. **A Caseware e2e test (plan §41/§42) has no existing framework to slot into — one would need to be introduced from scratch**, which is itself a scope decision, not a given.

---

## 14. Existing Electron architecture

`desktop/` is **not** a web-app wrapper. Per `DESKTOP.md`, it's a purpose-built disaster-recovery tool (backup/restore) with its own static local renderer (`desktop/renderer/index.html`), not a `BrowserWindow` pointed at the Next.js site.

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; `preload.js` exposes a small fixed IPC surface via `contextBridge`.
- **No `<webview>`, no `BrowserView`, no session partitioning anywhere in the codebase.**
- Registers `spidnums://` protocol for a fixed allow-list of update commands only.
- Talks to the same FastAPI backend over HTTPS for auth/backup endpoints only; never touches Postgres/MinIO directly.

**This directly contradicts the workflow spec's §6.3 Option C assumption** ("we already have an Electron desktop build... using a `<webview>`/`BrowserView` with a partitioned session"). **There is no existing webview/embedding infrastructure to extend.** Building "Electron webview + managed Caseware session" would be new architecture from zero, not an extension of `desktop/` — a materially larger lift than the spec implies, and still contingent on Caseware permitting it at all (per implementation-plan §27, this must not be attempted before vendor confirmation regardless).

---

## 15. Existing Integrations UI

`frontend/src/app/(firm)/integrations/` — **not a pure placeholder** as the workflow spec states. `integrations-client.tsx` has real, wired logic for **email** (live transport status via `GET /settings/email`, editable sender name via `PATCH /settings/tenant`, real test-send via `POST /settings/email/test`). Only the **Google Workspace** card is inert placeholder UI (static list, "Setup required" badge, no backend calls).

**No backend surface for "integrations" exists at all** — no `app/routers/integrations.py`, no `Integration` model. A Caseware connection is a clean-slate addition on the backend (new model + router + migration `0030_...`), and on the frontend should be added as a new card in this same file, following its existing `Badge`/`Field`/`Select`/`Button`/`useToast` conventions — not a new integrations area.

---

## 16. Frontend API client conventions (for the future Caseware client module)

Single hand-written `fetch` wrapper, `frontend/src/lib/api.ts` — no axios, no generated client. Typed verb helpers `get/post/patch/del` (+ `publicGet`/`publicPost` for anonymous). Auth token held in-memory only (`lib/auth-client.ts`), attached automatically, with transparent one-shot refresh-and-retry on 401. Errors are a typed `ApiError` with `.status`.

A `frontend/src/lib/caseware.ts` module should be built the same way — functions built on `get/post/patch/del`, no new HTTP client, no new auth plumbing.

**Document upload precedent** (`frontend/src/lib/storage.ts`): presigned-URL 3-step pattern (mint URL → browser PUTs directly to MinIO → register metadata) used consistently across four upload surfaces. Any Caseware-bound document transfer should be **server-to-server** (backend reads via `get_object_bytes`, §6 above, then pushes to Caseware) rather than adding a second browser-side upload leg — consistent with plan §21.

**Task detail page** (`frontend/src/app/(firm)/workflows/[id]/task-detail-client.tsx`) is where a future "Caseware" section (link status, sync list, "Work in Caseware" button) would slot in, alongside the existing Attachments/Comments sections — same `useApi`/`patch`/`post`/toast conventions.

**No iframe/webview precedent anywhere in the repo** (`frontend/` and `desktop/` both grepped clean) — confirms there is no shortcut or existing pattern to lean on; any embedding work is genuinely greenfield and, per the implementation plan, gated on vendor confirmation first.

---

## Summary: spec/plan claims vs. reality

| Claim in spec/plan | Verdict |
|---|---|
| Engagement letters fully built end-to-end | ✅ Confirmed (not re-audited in depth here; not in the critical path of Phase A) |
| Task creation owner-only; staff status-only updates | ✅ Confirmed exactly as described |
| `Client.owner_id` / `Task.assignee_id` model shape | ✅ Confirmed exactly as described |
| Document access gap (staff-side routers don't apply `client_owner_clause`) | ✅ Confirmed — real, exploitable gap today |
| No Caseware integration exists | ✅ Confirmed |
| No iframe/embedded-external-app anywhere in the product | ✅ Confirmed |
| Integrations page is "a shell; only email transport is real" | ⚠️ Partially wrong — email is real and fully wired, not a stub; only the Google Workspace card is inert. Net effect on planning is the same (no integration pattern to copy), but the audit corrects the characterization. |
| "We already have an Electron desktop build" implying webview/session infra reusable for Option C | ❌ **Materially wrong.** `desktop/` is an unrelated disaster-recovery tool with no webview, no `BrowserView`, no session partitioning, and does not load the web app at all. Option C (Electron webview) would be new architecture built from nothing, not an extension of existing code — this changes the effort estimate for that option significantly upward. |
| No queue/background job infra | ✅ Confirmed — none exists; only an in-process asyncio scheduler loop |
| Audit logging needs to be added | ⚠️ Partially wrong — `AuditLog` + `audit.record()` already exist and are widely used; Caseware events should call the existing helper, not a new subsystem |
| Migration framework is presumably Alembic-like | ⚠️ Corrected — it's a custom raw-SQL runner (`db/migrations/*.sql`, `scripts/migrate.py`), not Alembic |

---

## What Phase A deliberately did NOT do

Per the implementation plan's instruction ("Do not modify code in this phase unless necessary to fix an obvious existing security defect"), **no code was changed**, including the confirmed document-authorization gap in §5/§9 above. That gap is real and matches Phase B's charter exactly — it will be fixed in Phase B, with tests, using the existing `client_owner_clause` pattern already proven in `clients.py`. It is flagged here, not patched here.

Nothing in this audit required stopping under §48 of the implementation plan ("Stop conditions") — the repository's actual architecture is knowable and, aside from the Electron correction above, materially matches the spec closely enough to proceed with Phase B (document authorization) immediately.

## What remains blocked

Per the implementation plan §5/§45/§48, **Phase D onward (any Caseware connection/model/API code) remains blocked** until the following are known, none of which can be determined by reading this repository:

1. Exact Caseware product/edition the firm is licensed for (Cloud vs. Working Papers vs. IDEA).
2. Whether that plan includes Cloud API access, and its actual scope (the earlier research in this conversation confirms the *public* Cloud API is practice-management/metadata only — clients, users, groups, permissions, time — not engagement-file content or embedding; this needs confirming against the firm's specific plan, not assumed from generic docs).
3. Whether SSO (OIDC) is enabled on the firm's Caseware tenant, and with which identity provider.
4. Whether iframe embedding / an approved embed mechanism is available at all — nothing found in public Caseware docs suggests this exists; must be confirmed in writing by Caseware, not assumed.
5. Licensing terms for multiple SpeedNum staff acting through one firm's Caseware access.

**Recommendation:** proceed with Phase B (document authorization fix) and Phase C (workflow glue) now, since both are independent of every open Caseware question above. Do not start Phase D until the owner obtains answers to the vendor-confirmation checklist in the implementation plan §45.
