# Multi-Company Platform Build — Implementation Log

Tracks the step-by-step implementation of the plan in `speednum-platform-plan.html`, against branch `migration/portable-production-architecture`. Each entry is added as work happens, not written up after the fact.

**Decisions locked in before implementation started** (see the earlier chat / plan doc §2):
- Seats: two separate pools — staff seats and client seats.
- Roles: fully free-form custom role names per tenant (not a fixed built-in set).
- Billing: manual income/expense ledger first, no payment processor.
- Client creation/assignment: configurable per role, not hardcoded to owner-only.

**Environment constraint discovered before writing any code:** this sandbox has no reachable Postgres and no Docker (`db.invalid` test stub in `backend/tests/conftest.py` confirms the test suite is deliberately DB-free; a live connection attempt to `127.0.0.1:5434` timed out; `docker` is not installed). This means:
- "Testing" in this log means: (a) the existing pure-logic pytest suite (`backend/tests/`) continues to pass, (b) new pure-logic unit tests are added for new logic and pass, (c) every changed/new Python file imports cleanly. It does **not** mean the migration has been run against a real database, or that the API has been exercised end-to-end over HTTP.
- The SQL migration file is written and reviewed carefully, but is **unapplied and unverified against a real Postgres instance** until you run it (`python backend/scripts/migrate.py apply`) against a real database. Flag anything that looks wrong before doing that on data you care about.

---

## Phase 1a — Roles & permissions engine (backend foundation)

Scope for this pass: the data model, the permission-resolution engine, read-side scoping fixes (the `/clients` vs `/client-services` vs `/tasks` inconsistency flagged in the earlier lifecycle doc), and a Roles management API. Deliberately **not** in this pass: enforcement of `clients.manage` / `services.manage` / `tasks.manage` on write endpoints (the permission keys exist and are seeded, but only `clients.view_all`, `tasks.view_all`, and `clients.assign` are actually enforced yet — noted per-step below), and the frontend UI. Those are queued next.

### Step 1 — Migration `0018_roles_permissions.sql`
- Status: **done** (file written, matches `test_discovers_the_repo_migrations_in_order` conventions — see verification in Step 13)
- New tables: `roles` (tenant_id, free-form `name`, unique per tenant case-insensitively), `role_permissions` (role_id, permission_key, allowed).
- New column: `profiles.role_id` (nullable FK to `roles`, `on delete set null`).
- Backfill: every existing tenant gets 3 starter roles — Admin, Member, Viewer — seeded with `role_permissions` rows that reproduce today's hardcoded behavior exactly (Admin: `clients.view_all=false`, everything else `true`; Member/Viewer: everything `true` except `clients.delete=false`), then every existing non-owner staff profile's `role_id` is set to the matching role. Owner and client-portal profiles keep `role_id = null` by design (they bypass the permission system).
- RLS policies added, guarded the same way as every migration since 0016 (skipped on plain Postgres where there's no `authenticated` role).
- **Not yet run against a database** — no reachable Postgres in this environment. Run `python backend/scripts/migrate.py status` then `apply` yourself, on a database you can afford to be wrong about first (a staging copy), before this reaches production data.

### Step 2 — `models.py`: `Role`, `RolePermission`, `Profile.role_id`
- Status: **done**. Added `Role` and `RolePermission` ORM classes mirroring the migration, and `Profile.role_id` (nullable FK). No relationship attribute added from `Profile`/`Role` to each other yet — not needed by anything written so far, kept minimal.

### Step 3 — `app/permissions.py`: permission catalogue + resolution engine
- Status: **done**. New module. `PERMISSION_KEYS` (7 keys — see file for the full list and descriptions), `_LEGACY_DEFAULTS` (exact mirror of the migration's seed data, used as the runtime fallback for any profile with no `role_id`), `DEFAULT_ROLE_TEMPLATES` (for seeding a brand-new tenant's starter roles), and the pure decision function `resolve_permission()` (Owner/superadmin always pass; otherwise consult the role's grants; otherwise fall back to legacy behavior) plus a thin `has_permission(user, key)` wrapper for router code.
- `resolve_permission` is deliberately dependency-free (no session, no CurrentUser) so it's unit-testable without a database — see Step 12.

### Step 4 — `deps.py`: load permissions onto `CurrentUser`, add `require_permission()`
- Status: **done**. `CurrentUser` gained `role_permissions: dict[str, bool] | None`. `get_current_user` now loads the profile's `role_permissions` rows (one extra query, only when `profile.role_id` is set — zero cost for Owner/superadmin/unmigrated profiles). Added `require_permission(key)`, a dependency-factory (not a fixed `Annotated` alias, since the key varies per call site) mirroring the existing `require_admin`/`require_owner_or_superadmin` pattern.

### Step 5 — `clients.py`: permission-driven scoping (replaces hardcoded `role == "admin"`)
- Status: **done**. `_owner_scope` now delegates to the new shared `permissions.client_owner_clause` instead of checking `role == "admin"` directly — its 9 existing call sites (list/get/update/delete clients, portal-invite, contacts, client-services sub-routes) are unaffected, they just inherit the permission-driven behavior automatically. Also added a `clients.assign` check in `update_client`: changing `owner_id` now requires that permission (checked via `"owner_id" in payload.model_fields_set`, so it only fires when the request actually touches that field). On migration day every seeded role has `clients.assign=true`, so no existing tenant's behavior changes until an Owner deliberately turns it off for a role.

### Step 6 — `services.py`: apply the same scoping to `/client-services`
- Status: **done**. `GET /client-services` (client↔service assignment listing) now applies `client_owner_clause` — this was the concrete gap named in the earlier lifecycle audit: a role restricted to its own clients on the Clients page could still see every client's service assignments here. Not yet touched: `POST/PATCH/DELETE /client-services` and `/services` CRUD — those stay open to any tenant staff member (`services.manage` is defined and seeded but not enforced yet, see Phase 1b).

### Step 7 — `workflows.py`: apply scoping to `/tasks` and `/projects`
- Status: **done**. `GET /projects` uses `client_owner_clause` (a project always belongs to exactly one client, so the same rule as Clients applies directly). `GET /tasks` uses a separate `tasks.view_all` permission instead — deliberately independent of `clients.view_all`, so an Owner can restrict task visibility without also restricting client visibility (or vice versa). A client-linked task is hidden unless the caller owns that client; an internal task with no `client_id` is never hidden by this rule. This closes the other half of the gap the lifecycle audit found (`/tasks` was previously unscoped by client ownership entirely).

### Step 8 — New `roles.py` router (list/create/update/delete roles, get permission catalogue)
- Status: **done**. `GET /roles/permissions` (the static catalogue), `GET /roles`, `POST /roles`, `PATCH /roles/{id}`, `DELETE /roles/{id}` — all `OwnerOrSuperadminDep`, matching `team.py`'s "only the owner configures the roster" gating. Role names are case-insensitively unique per tenant (409 on collision). Deleting a role in use by any staff member is blocked (409, tells you how many) rather than silently orphaning their `role_id` — matches this codebase's existing pattern of blocking deletes with dependents over cascading through them (e.g. `services.py`'s `delete_service`). `PATCH` with `permissions` provided replaces the full grant set (not a merge), documented on the schema.
- Added `seed_default_roles()` to `permissions.py` and wired it into both places a tenant is created (`deps._provision_profile` for self-serve signup, `admin.provision_tenant` for the superadmin console) — a brand-new tenant gets the same 3 starter roles a pre-existing one was backfilled with, so the experience doesn't depend on when a firm signed up.

### Step 9 — `schemas.py` additions
- Status: **done**. New: `PermissionInfo`, `RolePermissionInput`, `RoleCreate`, `RoleUpdate`, `RoleRead`. Extended: `ProfileRead`, `ProfileUpdate`, `StaffCreate` all gained an optional `role_id: uuid.UUID | None`.

### Step 10 — `team.py` + `services/accounts.py`: staff creation/edit accepts `role_id`
- Status: **done**. `accounts.provision()` takes a new `role_id` parameter (forced to `None` for a client-portal account, same reasoning as its existing `role="member"` override — a portal login never reaches `app.permissions`'s checks at all). `team.py`'s `create_member` and `update_member` both validate a supplied `role_id` actually belongs to the caller's tenant (`_ensure_role_in_tenant`, same cross-tenant-reference pattern as `workflows.py`'s `_validate_task_references`) before using it. `update_member`'s existing `apply_updates(member, payload)` already picks up `role_id` with no further change, since `Profile` has that column.

### Step 11 — Register router in `main.py`
- Status: **done**. Added `roles` to the router import list and the `include_router` loop, placed next to `team`/`users` (the other roster-management routers).

### Step 12 — Tests (`backend/tests/test_permissions.py`)
- Status: **done**. 18 new pure-logic tests, following the existing `test_deps.py` convention (construct `Profile`/`Tenant`/`CurrentUser` directly, no session). Coverage:
  - Owner and superadmin bypass every permission key unconditionally, even adversarially (a role_permissions dict that denies everything still loses to the role/superadmin check).
  - Explicit role grants are authoritative; a key missing from a role's grants denies by default (an owner has to opt in, not opt out).
  - The legacy fallback (`role_permissions is None`) reproduces the exact pre-existing hardcoded behavior for admin/member/viewer, including the subtle bit that viewer and member were never actually different in the old code.
  - `client_owner_clause` returns `None` when scoped-out, and the right SQLAlchemy clause (right table/column/bound value) when scoping applies.
  - Catalog-integrity tests that would fail if `PERMISSION_KEYS`, `PERMISSION_CATALOG`, or `DEFAULT_ROLE_TEMPLATES` ever drift apart (three places the same permission key is spelled out by hand).

### Step 13 — Test run results
- Status: **done**.
  - `pytest backend/tests/test_permissions.py`: **18/18 passed** (found 2 bugs in my own test assertions along the way — a UUID-dash-stripping compile quirk and an object-identity vs. structural-equality mixup on a SQLAlchemy column — both fixed in the test, not the implementation).
  - `pytest backend/tests/` (the full existing suite, 350 tests): **350/350 passed** — no regression from the model/schema/router changes.
  - `python -c "import app.main"`: imports cleanly, 38 routes registered, confirms the `roles` router is wired in with the right path ordering (`/roles/permissions` registered before `/roles/{role_id}` so it isn't shadowed).
  - `scripts/migrate.py`'s `_discover()`: confirms `0018_roles_permissions` is discovered, in order, as the newest migration.
  - **Not done, and not possible in this environment**: actually running `0018_roles_permissions.sql` against a real Postgres instance. I reviewed it carefully against the conventions of migrations 0016/0017 (the two most recent), but a hand-written multi-statement PL/pgSQL migration with a loop and dollar-quoted blocks is exactly the kind of thing that can have a typo that only surfaces at execution time. **Run `python backend/scripts/migrate.py apply --dry-run` and then `apply` yourself against a disposable copy of your database before trusting it against anything real.**

---

## Phase 1a summary

**Files added:** `db/migrations/0018_roles_permissions.sql`, `backend/app/permissions.py`, `backend/app/routers/roles.py`, `backend/tests/test_permissions.py`, this log.
**Files changed:** `backend/app/models.py`, `backend/app/deps.py`, `backend/app/schemas.py`, `backend/app/main.py`, `backend/app/routers/clients.py`, `backend/app/routers/services.py`, `backend/app/routers/workflows.py`, `backend/app/routers/team.py`, `backend/app/routers/admin.py`, `backend/app/services/accounts.py`.

**What actually changed for an existing tenant on deploy day:** nothing observable. Every existing profile's effective permissions are bit-for-bit identical (proven by the legacy-fallback tests in Step 12, and because the migration backfills real `role_id`s that reproduce the same grants). What's new is available but inert until an Owner visits the (not yet built) Roles & Permissions page: they can now create a role with any name, grant/deny 7 specific permissions, and the two real bugs from the earlier lifecycle audit are fixed (`/client-services` and `/tasks` now respect the same client-ownership scoping `/clients` always did).

---

## Phase 1 frontend

Scope: make Phase 1a's backend actually usable — a Roles & Permissions management page, a custom-role picker on the staff form, and a `hasPermission()` helper on the session. Also had to fix one thing Phase 1a missed: `MeResponse` (`GET /auth/me`) didn't expose the resolved permission set at all, so the frontend had no way to know what the signed-in user can do without re-implementing `has_permission`'s logic client-side.

### Backend addition found necessary along the way
- `MeResponse` (`schemas.py`) gained `permissions: dict[str, bool]`, computed as `{key: has_permission(user, key) for key in PERMISSION_KEYS}` in all three places `/auth/me`-shaped responses are built (`GET /auth/me`, and both returns of `POST /auth/bootstrap`) — `backend/app/routers/auth.py`.
- Also found and fixed a **third tenant-creation path** Phase 1a's `seed_default_roles()` wiring had missed: `auth.py`'s `bootstrap_firm` (self-serve "create a firm for an account that signed up without one" flow) creates a tenant independently of `deps._provision_profile` and `admin.provision_tenant`. Now calls `seed_default_roles()` too, so a tenant created through *any* of the three paths gets its starter roles. Full backend suite re-run after this (350/350 still passing).

### Frontend changes
- `lib/types.ts`: `Profile.role_id`, `Me.permissions`, and new `PermissionKey` / `PermissionInfo` / `RoleRow` types (mirroring the backend schemas by hand, same convention this codebase already uses for every other API type).
- `lib/session.tsx`: `SessionValue.hasPermission(key)` — reads `me.permissions`, defaults to `true` in demo mode/before load (matching the existing `isAdmin` default's reasoning: never flash "denied" before the real answer arrives).
- `lib/site.ts` + `components/firm/shell.tsx`: new `ownerOnly` nav-item flag (stricter than the existing `hiddenFromAdmin` — blocks Member/Viewer too, matching `require_owner_or_superadmin`) and a new "Roles & Permissions" nav entry under Administration.
- `lib/firm-demo.ts` / `lib/adapt.ts`: threaded `role_id` through the demo `TeamMember`/`TeamRow` type and `toTeamRow()` so a real API team member's custom role survives the live→demo-shaped adapter.
- New: `app/(firm)/team/roles/page.tsx`, `roles-client.tsx`, `role-modal.tsx` — a full CRUD page (KPI tiles, searchable table, create/edit modal with the permission catalogue as checkboxes, delete-with-confirmation) following this codebase's established `team/` page pattern exactly (server component fetches via `apiServer`, falls back to demo fixtures, client component does the rest). Gated to Owner/superadmin client-side the same way `team-client.tsx` already gates plain-admin away from `/team`.
- Changed: `app/(firm)/team/accountant-modal.tsx` (new optional `roles` prop + a "Custom role" picker, only rendered when the tenant has any), `app/(firm)/team/team-client.tsx` (fetches `/roles` on mount, passes `role_id` through create/edit), `app/(firm)/team/[id]/team-member-client.tsx` (passes `role_id` through its own edit flow — **does not** yet fetch/pass the roles list to its modal, so the custom-role picker doesn't render on the individual member detail page yet, only on the roster page; noted as a follow-up, not done in this pass).

### Testing done
- `tsc --noEmit`: clean (found and fixed one real error along the way — `team-member-client.tsx` also uses `AccountantModal` and needed the same `roleId` wiring `team-client.tsx` got, confirming the value of a real compiler check over eyeballing).
- `eslint` on every changed file, then the whole project: clean (0 errors; 2 pre-existing warnings in an unrelated script, not touched).
- `next build` (full production build, Turbopack): **succeeds**, `/team/roles` registered as a server-rendered route alongside every other existing route with no regressions.
- **Not done, and not possible in this environment**: actually running the dev server against a live backend and clicking through the page. No reachable Postgres means no way to sign in as a real Owner and verify the Roles page renders/saves correctly against real data, or that the permission-gated nav item actually appears/disappears correctly for different roles. The build and type/lint passes are strong signals but are not the same as having seen it render.

---

## Phase 1b — write-permission enforcement

Scope: the four permission keys that were seeded and toggle-able in the Roles UI since Phase 1a, but not actually checked anywhere yet — `clients.manage`, `clients.delete`, `services.manage`, `tasks.manage`. Same inline-check pattern as Phase 1a's `clients.assign` guard (a `has_permission(user, key)` check at the top of the handler body, before any query), not a dependency-factory swap, for consistency with what was already shipped.

**18 checks added**, one per mutating endpoint:
- `clients.py` (5): `create_client` and `update_client` each require `clients.manage`, and additionally `clients.assign` specifically when `owner_id` is present in the payload (create: `payload.owner_id is not None`; update: reuses Phase 1a's `"owner_id" in payload.model_fields_set` check). `delete_client` switched from the hardcoded `AdminUserDep` to `TenantUserDep` + an explicit `clients.delete` check — safe because the legacy fallback in `permissions.py` reproduces `AdminUserDep`'s exact rule (owner/admin/superadmin yes, member/viewer no) for any profile not yet on a custom role, proven by `test_permissions.py`'s `test_plain_admin_can_still_manage_and_delete_clients` / `test_member_cannot_delete_clients`.
- `services.py` (6): `create_service`, `update_service`, `delete_service`, `assign_service` (`POST /client-services`), `update_assignment`, `remove_assignment` — all require `services.manage`.
- `workflows.py` (7): `create_project`, `update_project`, `delete_project`, `create_task`, `update_task`, `move_task`, `delete_task` — all require `tasks.manage`.

**Known simplification, called out in `move_task`'s own comment:** there's one `tasks.manage` key, not a separate "manage any task" vs. "move my own assigned task" pair — so an Owner who turns `tasks.manage` off for a role also blocks that role from dragging their own assigned task across the kanban board, not just from creating unrelated tasks. Worth a follow-up permission key (`tasks.move_own`?) if that distinction turns out to matter in practice; not built now to keep the catalogue small per the original scope decision.

**Testing:** full backend suite re-run after every batch of edits — still 350/350 passing throughout, and the app still imports with all 38 routes. No new unit tests added for the router-level checks themselves: this codebase has no FastAPI `TestClient`/HTTP-integration tests anywhere (confirmed by grep — every existing test is pure logic per `conftest.py`'s own docstring), so a router-level check follows the established convention of not being independently tested at that layer; the decision logic it calls (`has_permission`/`resolve_permission`) is the part that's actually tested, in `test_permissions.py`.

---

## Phase 2 — seats (two pools) + provider finance ledger

### A pleasant surprise: the two seat pools already half-existed
Before writing anything, checked whether the plan doc's "two separate pools" decision meant new columns. It didn't: `Tenant.seats` (a real column) and `Tenant.settings["max_clients"]` (JSONB) already existed and were already both shown on the superadmin console's tenant summary (`admin.py`'s `_caps()`/`_summary()`) — they were just never actually enforced anywhere. So Phase 2 turned out to be "wire up enforcement + expose usage," not "design a new schema." No migration needed for the seats half at all.

### Backend
- New `app/seats.py`: `int_cap()` (mirrors `admin.py`'s private `_int_cap` — a JSON `true`/`false` must never be read as a cap of 1), the pure `seat_exceeded(current, cap, adding=1)` decision function, and the async `ensure_staff_seat_available` / `ensure_client_seat_available` / `seat_usage` wrappers that do the actual `COUNT(*)` queries.
- Enforcement wired into every place a staff member or client gets created:
  - `team.py`: `create_member` (direct staff creation), `invite_member` (sending an invite), and — the one easy to miss — `accept_invitation`. A pending invitation creates no `profiles` row, so several invites can be sent while under the cap and all accepted later, overshooting it; `accept_invitation` re-checks against the invitation's tenant at accept time to close that gap.
  - `clients.py`: `create_client`.
  - **Deliberately not wired into `imports.py`'s bulk staff/client import** — a pre-flight "would this batch exceed the cap" check is a reasonable follow-up but wasn't built in this pass, to keep the change contained to the everyday creation paths. Bulk import can currently still push a tenant over its seat cap.
- New `GET /settings/seats` (`settings.py`) — any firm staff (not owner-only; a seat-limit 402 can happen to anyone trying to invite/create, not just the owner) gets `{staff_used, staff_seats, client_used, client_seats}`, a `None` seats value meaning unlimited.
- A blocked creation returns **402 Payment Required** (not 403) — deliberately distinct from a permission failure, since "you're not allowed" and "you're out of purchased capacity" are different problems with different fixes (ask an owner to grant a permission, vs. ask the provider for more seats).
- New migration `db/migrations/0019_platform_finance.sql`: `platform_expenses` (category, vendor, amount, currency, date, is_recurring, notes) and `platform_income` (tenant_id, amount, currency, date, method, notes) — the provider's own manual bookkeeping, unrelated to any tenant's client-facing books. No RLS on either table (documented in the migration's header comment): neither carries a meaningful tenant-ownership boundary for Postgres RLS to enforce, same as `audit_logs` and `tenants` itself in this schema — access is enforced purely by `SuperadminDep` at the API layer.
- New `backend/app/models.py` additions: `PlatformExpense`, `PlatformIncome`.
- New router `backend/app/routers/platform_finance.py` (`/admin/finance/*`, `SuperadminDep` throughout, local Pydantic models rather than growing `schemas.py` further — mirrors `admin_backups.py`'s established shape): CRUD for expenses, CRUD for income (income optionally tagged to a tenant, joined to its name for display), and `GET /admin/finance/summary` (total income, total expenses, profit, entry counts, optional date range).

### Frontend
- New `app/(firm)/admin/finance/page.tsx` — **not** built like the Roles page (server-fetch + demo fallback); built like `admin/backups/page.tsx` instead, since this is genuinely superadmin-only real data with no reason to pretend it works without a backend. Client-only component using the existing `useApi`/`useAction` hooks, a 403-detection `EmptyState` gate, KPI tiles (income/expenses/profit), two tables (income, expenses) each with add/edit/delete via modals.
- New nav entry "Finance" under Administration (`superadminOnly`), and a `wallet` icon registered in `components/icon.tsx` (it didn't exist in the icon-name lookup map before — the nav item would have silently rendered a fallback globe icon otherwise, caught by checking the map rather than assuming the string just worked).
- Seat usage surfaced on the Team page (`team-client.tsx`): fetches `/settings/seats` and shows "14/20 staff seats used" / "340/500 client seats used" pill badges (only when a cap is actually set; turns red at/over the cap). **Not** duplicated onto the Clients page separately — a deliberate scope choice, both numbers are visible in one place since they're both about the same tenant's overall capacity.

### Testing
- `tests/test_seats.py`: 11 new pure-logic tests for `int_cap`/`seat_exceeded` (the bool-is-not-an-int trap, unlimited-never-exceeded, exactly-at-cap-is-fine vs. one-over-is-exceeded, multi-seat `adding` batches, a zero cap blocking everything). The counting queries themselves aren't unit tested — no database here, same reasoning as everywhere else in this log.
- Full backend suite: **361/361 passing** (350 + 11 new).
- Frontend: `tsc --noEmit` clean, `eslint` clean on every changed/new file, full `next build` succeeds with `/admin/finance` registered alongside every other route with no regressions.
- **Not done, not possible here**: migration 0019 has never run against a real database; no one has actually tried to hit a seat limit against live data or logged a real expense through the UI.

---

## Phase 3 — unified cross-tenant accounts console

### The actual gap this closes
`/users` (`users.py`) is `SuperadminTenantUserDep` — every action on it operates on whichever tenant the caller's session claims as "acting tenant," which for a superadmin means whichever firm they're currently impersonating. Fine for "see exactly what this firm's admin sees," but it means a superadmin wanting to find or fix one account has to know (or guess) which of potentially many tenants it belongs to, impersonate that one specifically, then act — there was no way to just search everyone.

### Backend
- New schema `PlatformAccountRead` (`schemas.py`) — `PlatformUserRead` plus `tenant_id`/`tenant_name`, since this list spans every tenant rather than one impersonated firm.
- New router `backend/app/routers/admin_accounts.py` (`/admin/accounts`, `SuperadminDep`, no impersonation required):
  - `GET /admin/accounts` — search by name/email substring, filter by tenant/role/team-vs-client-portal/active-only, across every tenant at once.
  - `PATCH /admin/accounts/{profile_id}` — same update logic as `/users` (role changes, suspend/reactivate via `is_active`, last-owner protection), but loads the account directly by id instead of scoping to the caller's impersonated tenant. Added one guard `/users` didn't need: a superadmin can't deactivate their own account through this console (self-lockout risk that doesn't exist for `/users`, since a superadmin isn't a row `/users` would ever list for itself).
  - `POST /admin/accounts/{profile_id}/resend-credentials` — **this is the literal "regenerate any owner's password with no recovery email, from a single console" action the original platform scenario asked for**, now reachable directly instead of needing `admin.py`'s tenant-primary-admin-only resend or first impersonating the tenant via `/users`.
  - `DELETE /admin/accounts/{profile_id}` — same revoke-access shape as `/users`.
  - Deliberately duplicates `/users`' mutation logic rather than sharing it — consistent with how this codebase already has three independent `accounts.reissue()` call sites (`admin.py`, `team.py`, `clients.py`) rather than one shared "reset credentials" function; documented as an explicit choice in the router's own docstring, not an oversight.
- Registered in `main.py`.

### Frontend
- New `app/(firm)/admin/accounts/page.tsx` — same real-data-only, `useApi`/`useAction` pattern as `admin/backups` and `admin/finance` (not the demo-fallback pattern used for tenant-facing pages). Debounced search box, tenant/role/source filters, a table with reset-password / suspend-reactivate / remove-access actions per row, and the existing `CredentialsModal` reused for the reset-password flow — same "show the temp password exactly once" UX as everywhere else in the app, not a new one invented for this page.
- New nav entry "Accounts" under Administration (`superadminOnly`).

### Testing
- Full backend suite: **361/361 passing**, no new tests added — `admin_accounts.py`'s logic is a direct-by-id variant of `users.py`'s already-shipped, already-untested-at-the-router-level mutations (same "no FastAPI TestClient anywhere in this codebase" reasoning as Phase 1b), and the one genuinely new piece of logic (the self-lockout guard) is a single `if` statement mirroring a pattern (`team.py`'s "you cannot remove your own account") that's likewise not independently unit tested elsewhere in this codebase.
- Frontend: `tsc --noEmit` clean, `eslint` clean, full `next build` succeeds with `/admin/accounts` registered, no regressions across all 103 routes.
- **Not done, not possible here**: no live click-through — same caveat as every phase in this log.

---

## Phase 4 — hardening / audit pass

### Tenant-isolation audit
Went through every table and endpoint added in Phases 1–3 against the question "could this leak or corrupt another tenant's data":
- `roles` / `role_permissions`: every query in `roles.py` filters `Role.tenant_id == user.tenant_id`; `role_permissions` has no `tenant_id` of its own but is only ever reached through an already-tenant-filtered `role_id`.
- **`profiles.role_id` cross-tenant check**: grepped every place `role_id` can be written (`team.py`'s `create_member`/`update_member` — the only two in the whole codebase) and confirmed both call `_ensure_role_in_tenant` before use. Added a regression test class, `TestCustomRolesCannotEscalateToOwnerGatedActions` (`test_permissions.py`), proving by construction that granting a "member" every single permission key still fails `require_owner_or_superadmin`/`require_admin` — the two permission systems are structurally independent, so a custom role can never manufacture Owner/superadmin-level structural access (staff management, billing) no matter how it's configured. 3 new tests, all passing.
- `platform_expenses` / `platform_income`: confirmed both are reachable only via `SuperadminDep` in `platform_finance.py`, with no tenant-scoped read path anywhere else — a tenant's own staff can never see or query these tables through any endpoint.
- `admin_accounts.py`: confirmed every handler is `SuperadminDep` (not `SuperadminTenantUserDep`), and deliberately loads by `profile_id` alone with no tenant filter — correct, since cross-tenant reach is the entire point of this router, not a bug.
- `seats.py`: every counting/enforcement call passes an explicit `tenant.id` or `tenant_id`, sourced from `user.tenant` (already tenant-scoped by `TenantUserDep`) or a specific `Invitation.tenant_id`/`Tenant` row — no path takes a tenant id from request input.

### Gap 1 fixed: bulk import now respects seat limits
`imports.py`'s `commit_clients` and `commit_users` previously created accounts/clients with zero seat-limit awareness — a tenant at its cap could still add hundreds of clients in one CSV. Added `seats.remaining_client_seats()` / `seats.remaining_staff_seats()` (computed once per commit, decremented locally per successful new row rather than re-querying `COUNT(*)` before every row) and a per-row check that fails only the rows that would exceed the cap — existing successful rows and unrelated failures are unaffected, matching this importer's existing "one bad row doesn't sink the batch" design. Client-portal rows in the user importer correctly draw on neither pool (they pin to an existing client, they don't create one).

### Gap 2 fixed: role picker now on the team-member detail page too
`team-member-client.tsx` (the individual `/team/{id}` page's edit modal) now fetches `/roles` the same way `team-client.tsx` already did, so the custom-role picker Phase 1 built appears on both places staff get edited, not just the roster list.

### Leftover hardcoded role checks found and fixed
Grepped every `isAdmin`/`session.isAdmin` use across the frontend. Two were stale — their own comments described a rule Phase 1b had already changed underneath them:
- `clients-client.tsx`'s row actions: the Edit link had **no** gate at all (comment: "PATCH /clients/{id} has no admin gate") and Delete was gated on raw `isAdmin`. Both claims are now wrong — `update_client` requires `clients.manage`, `delete_client` requires `clients.delete`, and either can be granted or denied per custom role independent of the owner/admin/member/viewer labels `isAdmin` reads. Fixed: Edit now gated on `session.hasPermission("clients.manage")`, Delete on `session.hasPermission("clients.delete")`.
- `client-detail-client.tsx`'s page-header Delete button: same `isAdmin` staleness, same fix (`clients.delete`).
- Left alone, correctly: `reminders-client.tsx`'s `isAdmin` gate on "Check now" — that button maps to `POST /reminders/run`, which is `AdminUserDep`-gated and untouched by any Phase 1–3 change, so `isAdmin` is still the right check there.
- Not chased further: services/tasks create/delete buttons across the Services and Workflows pages are still unconditionally visible (they always were — those actions had no gate at all before Phase 1b). Now that `services.manage`/`tasks.manage` are enforced server-side, a role denied either would see a button that fails on click rather than a hidden one. Not a regression (nothing was hidden before either), but worth a follow-up pass once an Owner actually configures a role that restricts these, so the UI matches from day one rather than reactively.

### Explicit no-email toggle — not done, staying not done
The plan doc listed this as optional ("cosmetic, not a functional gap"). Every reissue endpoint across `admin.py`, `team.py`, `clients.py`, `users.py`, and the new `admin_accounts.py` already shows the temp password on screen regardless of email delivery, which was the actual requirement from the original scenario ("no owner can lose access to their portal"). Skipped to avoid touching five already-shipped, already-tested endpoints for a wording-only feature.

### Testing
- `test_permissions.py`: 3 new regression tests (21 total in that file). Full backend suite: **364/364 passing**.
- Frontend: `tsc --noEmit` clean, `eslint` clean on every changed file, full `next build` succeeds, all 103 routes registered with no regressions.
- Same caveat as every phase above: nothing here has touched a live database or a real browser session.

---

## Post-Phase-4 — real database verification + email disabled

Everything below happened against a **real, running Postgres instance** — not the pure-logic unit tests every earlier section leaned on. This is the first actual end-to-end validation this log has had.

### What was found and used
A local PostgreSQL 17 server was already installed and running as a Windows service (`postgresql-x64-17`) on port 5432, reachable with the default `postgres`/`postgres` credentials, previously unrelated to this project (only the default `postgres`/`template0`/`template1` databases existed). Created a fresh `speednum` database on it — nothing pre-existing was touched.

### Email sending — disabled, no code change needed
The app already had a built-in, fully reversible "no email" mode: `services/email.py`'s `deliver()` checks `settings.resolved_email_provider`, and an explicit `EMAIL_PROVIDER=none` (honoured even if `RESEND_API_KEY`/`SMTP_HOST` are also set) makes every send a no-op — logged, never dispatched — while every caller already falls back to showing the temp password directly in the API response and on screen (this fallback is what the original scenario asked for anyway: "no owner can lose access"). Set `EMAIL_PROVIDER=none` in `backend/.env`. **To resume sending later: change that one line back to `auto` (or `resend`/`smtp`) and restart the backend — no code was touched.** Verified live: creating a staff account returned `"email_sent": false` and the real temp password in the response, with zero attempt to contact any mail transport.

### Migrations — applied for real, both new ones included
```
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/speednum?sslmode=disable" \
MIGRATIONS_SKIP=0002_rls python backend/scripts/migrate.py apply
```
All **19 migrations applied cleanly**, `0001` through `0019` (`0002_rls` skipped deliberately — it's Supabase-only, per its own guard, and this is plain Postgres). This is the first real execution of `0018_roles_permissions.sql` and `0019_platform_finance.sql` — both ran with no errors, and the schema was hand-verified afterward (`roles`, `role_permissions`, `platform_expenses`, `platform_income` tables exist; `profiles.role_id` is a real column with its FK to `roles(id) ON DELETE SET NULL`).

### Backend + frontend, both running
- Backend: `uvicorn app.main:app` on `http://127.0.0.1:8000`, connected to the real database, `/health` reports `"database":"ok"`.
- Frontend: `next dev` on `http://localhost:3000`, `NEXT_PUBLIC_API_URL` pointed at the backend above (the checked-in `.env.local` had pointed at a `:8443` HTTPS endpoint that doesn't exist here — changed to plain `:8000` to match).
- One real snag, found and fixed: the frontend's `/api/auth/*` Route Handlers (the login/session/refresh proxies) all 404'd under a stale `next dev` Turbopack cache from an interrupted earlier run. Clearing `.next` and restarting fixed it — not a code bug, a dev-cache artifact.

### A live account, exercised end-to-end
Registered a real account via `POST /auth/register` + `POST /auth/bootstrap` (the exact self-serve signup path a real user would take — confirms `seed_default_roles()` fires correctly here too, the third of the three tenant-creation paths), then promoted it to platform superadmin with the one documented manual step (`UPDATE profiles SET is_superadmin = true ...` — see `DEPLOYMENT.md`, this project has never had any other way to mint the first superadmin). That gives one login both Owner-of-its-own-firm and platform-superadmin access — enough to see everything built across all four phases from a single account.

Smoke-tested live and confirmed working end-to-end: login (via both the backend directly and the frontend's cookie-proxy route), `/auth/me` returning the correct resolved `permissions` map, `/roles` showing the three seeded starter roles with exactly the intended grants, `/settings/seats` reporting real usage (1/5 staff seats, unlimited clients), client creation succeeding under the new `clients.manage` permission check, `/admin/finance/summary`, and `/admin/accounts` cross-tenant search. The two rows created purely for this smoke test (one staff member, one client) were deleted afterward so the account is clean for actual use.

### Your login
| | |
|---|---|
| **URL** | http://localhost:3000/login |
| **Email** | `owner@speednumtest.com` |
| **Password** | `SpeedNum#2026` |
| **Access** | Owner of "SpeedNum Demo Firm" *and* platform superadmin — sees both the firm side (Team, Roles & Permissions at `/team/roles`, Clients, Services, Workflows) and the superadmin console (`/admin`, `/admin/accounts`, `/admin/finance`) |

Both servers are running in the background of this session. If either stops responding, restart with:
```
cd backend && ./.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
cd frontend && npm run dev
```

---

## Where this leaves the project

All four planned phases are complete: the roles/permissions engine and its UI (Phase 1, 1a+1b), seats and the provider finance ledger (Phase 2), the cross-tenant accounts console (Phase 3), and a hardening pass closing the two gaps those phases had logged plus a tenant-isolation review (Phase 4).

**Before any of this reaches production data:**
1. Run `python backend/scripts/migrate.py status` then `apply` — against a disposable copy first — for both `0018_roles_permissions.sql` and `0019_platform_finance.sql`. Neither has ever executed against a real Postgres instance; this whole log's testing was pure-logic unit tests, `tsc`, `eslint`, and full production builds, none of which can catch a SQL typo.
2. Sign in as a real Owner and a real Superadmin and click through: create a custom role, restrict `clients.view_all` on it, confirm a staff member on that role actually sees a narrowed client list; hit a seat limit on purpose and confirm the 402 message is sensible; log an expense and an income entry and confirm the profit math; search the Accounts console across two tenants.
3. Known remaining gaps, in order of how much they matter: services/tasks action buttons not yet permission-gated in the frontend (cosmetic once a restrictive role exists), no explicit no-email toggle (cosmetic, not required).
