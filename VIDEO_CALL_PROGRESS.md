# Video Call Feature — Implementation Progress Tracker

**Spec:** [spidnums_VIDEO_CALL_IMPLEMENTATION_SPEC.md](spidnums_VIDEO_CALL_IMPLEMENTATION_SPEC.md) (root of repo) — this is the implementation contract. Every phase below maps to that spec's §31 phase list.

**This file is the resumable state for this feature.** If a session is interrupted or hits a limit, read this file first — it says exactly what's done, what decisions were already made (so they aren't re-litigated), and what the next unstarted step is. Update it at the end of every phase, before moving to the next one.

All commits for this feature use the `video-call:` message prefix so they're easy to isolate from unrelated work in `git log`.

---

## How to resume in a new session

1. Read this file top to bottom — especially "Current status" and "Decisions log" below.
2. `git log --oneline --grep="^video-call:"` to see exactly what's landed.
3. Pick up at the phase marked `IN PROGRESS` or the first `NOT STARTED`.
4. Keep following the spec file — this tracker doesn't repeat its requirements, only records what was decided/done and why.

---

## Current status

**Phase 0 (repository analysis) — DONE.**
**Phase 1 (LiveKit + coturn infrastructure) — DONE**, with one explicitly-unverified step (see below).
Next up: **Phase 2 (database models/migrations)**.

---

## Phase 0 — Repository analysis (spec §31)

### Corrections to the spec's stack description

The spec (§1) says the frontend is on Vercel via `NEXT_PUBLIC_API_URL`. That was true when `ARCHITECTURE.md` was last fully updated, but two later commits (`66e6c36`, `b28705e`) moved the frontend to a **self-hosted Docker container on the same Hostinger VPS** (`deploy/docker-compose.yml`'s `frontend` service, image `speednum-frontend`, reverse-proxied by Caddy at `www.spidnums.com` → `speednum-frontend:3000`). `ARCHITECTURE.md` itself is stale on this point. Everything else in the spec's stack description matches the repo as of this analysis.

### Auth / authorization model (`backend/app/deps.py`, `backend/app/permissions.py`)

- `CurrentUser` (deps.py) wraps `profile` (a `Profile` row), `tenant` (`Tenant | None`), JWT claims, and `role_permissions`. Key properties: `.id`, `.tenant_id` (raises 409 if unlinked), `.is_admin`.
- Roles live on `Profile.role` — `owner | admin | member | viewer` (`USER_ROLES` in `models.py`) — plus two booleans: `Profile.is_superadmin` (platform operator) and `Profile.client_id` (set = this is a client-portal login, not staff).
- Relevant dependency aliases to reuse (not reinvent) for the calls router:
  - `TenantUserDep` — firm staff only (rejects portal accounts)
  - `AnyTenantUserDep` — firm staff OR client-portal account, same tenant
  - `BookScopeDep` / `ClientScopeDep` — tenant+client scoping (portal accounts auto-pinned to their own client, staff can pass `?client_id=`)
  - `OwnerOrSuperadminDep` — owner or platform superadmin
  - `SuperadminDep` — platform superadmin only
- `app/permissions.py` is the existing pattern for centralized authorization helpers (`has_permission`, `client_owner_clause`, `invoice_owner_clause`) — this is where `can_call()` / `can_invite_to_call()` belong, per spec §10, not duplicated per-router.

### Calling-matrix mapping (spec §10) confirmed against real schema

| Spec term | Actual model |
|---|---|
| "assigned staff member" | `Profile` where `Profile.id == Client.owner_id` for that client |
| "company Owner" | `Profile.role == "owner"` (and `Profile.client_id is None`) within the tenant |
| "staff member" | any `Profile` in the tenant with `client_id is None` |
| "client" | any `Profile` with `client_id` set, scoped to the tenant via `Client.tenant_id` |
| "platform/superadmin" | `Profile.is_superadmin == True` |
| tenant boundary | `Profile.tenant_id` / `Client.tenant_id` — superadmin is the only cross-tenant caller, and only reaches a tenant's Owner(s), never its staff/clients directly |

This exactly mirrors the two existing messaging features, which are the closest analog in the codebase:
- `backend/app/routers/client_messages.py` — client ↔ (assigned staff ∪ every Owner), tenant-scoped, flat thread.
- `backend/app/routers/support.py` — company Owner ↔ platform superadmin, cross-tenant by design, `OwnerOrSuperadminDep` / `SuperadminDep`.

`can_call(caller, target)` and `can_invite_to_call(caller, target, call)` should reproduce these same two rules rather than invent new ones.

### Notifications (spec §20, §26 — reuse, don't rebuild)

`backend/app/routers/notifications.py` + `backend/app/services/audit.py::notify()` is a **poll-based** feed (`Notification` table: `tenant_id`, `profile_id` [null = tenant-wide broadcast], `type`, `title`, `body`, `link`, `is_read`). `GET /notifications/unread-count` is the cheap poll the frontend bell already hits on a timer. There is **no push/WebSocket layer anywhere in the backend today** — confirmed via search, zero matches for `websocket`/`socket.io`.

Consequence for call ringing (spec §20): the spec forbids building a custom WebSocket signaling layer, and says to reuse the existing notification system. The realistic reading: `audit.notify()` creates the "incoming call" notification row same as any other notification (for the bell/inbox), **and** LiveKit's own realtime data channel (already mandated for chat, §16) is the low-latency path once a room exists — but a callee who hasn't joined a room yet can't receive a LiveKit data message. This means the frontend's "am I being called right now" signal will need to poll a lightweight `GET /calls?status=ringing` (or similar) on a short interval while a user is active in the app, backed by the same `Notification` row for the persistent/offline case. This is a real product constraint worth flagging back to the spec author, not a decision to make silently — recorded here so it doesn't get lost, revisit at Phase 20 (incoming calls) with the actual polling interval / UX tradeoff.

### Rate limiting (spec §27 — reuse, don't rebuild)

`backend/app/services/rate_limit.py` is a Postgres-backed fixed-window limiter (table: `rate_limit_hits`, migration `0008_rate_limits.sql`) — a deliberate choice over Redis/in-process because `WEB_CONCURRENCY=4` means 4 separate processes. Two ready-made dependency factories: `rate_limit_by_ip(name, limit, window_seconds)` (unauthenticated endpoints) and `rate_limit_by_tenant(name, limit, window_seconds)` (authenticated). Call-initiation/invite/token endpoints should use `rate_limit_by_tenant`, keyed distinctly per action (e.g. `"calls.create"`, `"calls.invite"`, `"calls.token"`).

### Database migration conventions (`db/migrations/`)

- Sequential `NNNN_description.sql`, next free number is **`0028`**. Latest existing: `0027_client_message_attachments.sql`.
- Every migration ends with a guarded RLS block: `if to_regrole('authenticated') is null then raise notice ... skip end if` — kept **even though the VPS target has no `authenticated` role and RLS is a no-op there**, because the codebase still supports the Supabase-Postgres rollback path (`AUTH_PROVIDER=supabase`/`STORAGE_PROVIDER=supabase`) where it matters. New call tables should follow this exact pattern (see `0023_support_messages.sql`, `0026_invoicing_and_bills.sql` for the template) even though authorization is actually enforced in `deps.py`/`permissions.py`, not by RLS.
- `backend/app/models.py` mirrors the SQL by hand (`"""SQLAlchemy models mirroring db/migrations/0001_schema.sql."""`) — every new table needs a matching `Base` subclass added there, using the existing `pg_enum()` helper for Postgres enum columns and `_uuid_pk()` for the PK pattern.
- Applied via `backend/scripts/migrate.py` (`status` / `baseline` / `apply`), mounted read-only into the `migrate` compose service from `../db/migrations`.

### Docker Compose / Caddy / env conventions (`deploy/`)

- `deploy/docker-compose.yml`: services `postgres`, `minio`, `minio-init`, `api`, `frontend`, `migrate` (profile `tools`, not part of `up`). Two networks: `web` (external, shared with the host's pre-existing Caddy container) and `internal` (project-local, Postgres-only, never gets a host port).
- Two separate env files, both gitignored: `deploy/.env` (compose-level `${VAR}` interpolation — shared secrets like Postgres/MinIO passwords) and `deploy/api.env` (passed straight through as the `api` container's `env_file:` — everything else). `backend/app/config.py` is the single `pydantic-settings` `Settings` class that reads `api.env`'s vars — new LiveKit/TURN config belongs there, following the existing `Field(default=..., alias="ENV_VAR_NAME")` style.
- `deploy/Caddyfile.example` lives outside this repo's own compose project (it's the VPS's pre-existing shared Caddy) — checked in here only as the documented source of truth, applied with `scp` + `caddy validate` + `caddy reload`. Current handled hosts: `www.spidnums.com` (frontend), `spidnums.com`/`syedi.spidnums.com` (redirects), `test.spidnums.com` (API + MinIO presigned paths, staging domain still in active use — `api.spidnums.com` is prepared but commented out, blocked on a DNS record this environment can't create). A new `video.spidnums.com` block follows the same shape.
- Public ports today: only 22/80/443 (UFW). Everything else Docker-internal. LiveKit's UDP media range and coturn will be the first ports this VPS has ever needed to expose beyond that — must be called out explicitly in DEPLOYMENT.md and not silently assumed open.
- No `latest` tags are used for `api`/`frontend` images (both build from the repo's own Dockerfiles); `postgres:16` and pinned MinIO release tags are the existing precedent for pinning third-party images — LiveKit/coturn images must follow the same pinned-tag convention (spec §28 asks for this too).

### Frontend conventions (`frontend/src/`)

- Next.js 16 App Router, route groups: `(auth)`, `(firm)` [staff-side authenticated app], `(marketing)`, plus `dashboard/*` [client-portal pages], `app/api/auth/*` [the BFF routes that mint first-party cookies].
- `frontend/src/lib/api.ts`: a single `api<T>(path, options)` fetch wrapper — auto-attaches the bearer token (`currentAccessToken()`), retries once on 401 after a silent refresh, normalizes FastAPI's error shape into `ApiError`. Any call-related frontend API calls should go through this, not a bespoke fetch.
- `frontend/src/components/` is organized by feature area (`auth/`, `dashboard/`, `firm/`, `support/`, etc.) — `components/calls/` (spec §24) fits this pattern directly.
- Frontend has its own `AGENTS.md` (`frontend/AGENTS.md`, auto-generated by `next dev`) warning that this Next.js version has breaking changes from training data — **read `frontend/node_modules/next/dist/docs/` before writing any frontend code**, not before now. Flagged here so Phase 5 doesn't skip it.

### File-change plan (what will actually change, by phase)

**Phase 1 — Infra (no application code touched):**
- `deploy/docker-compose.yml` — add `livekit` and `coturn` services (pinned images), new compose network exposure for the UDP media range
- `deploy/livekit.yaml.example` (new) — LiveKit server config template
- `deploy/turnserver.conf.example` (new) — coturn config template
- `deploy/api.env.example` — add `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_PUBLIC_WS_URL`
- `deploy/.env.example` — add the shared LiveKit key/secret (compose-level, mirrors `POSTGRES_APP_PASSWORD`'s pattern)
- `deploy/Caddyfile.example` — add `video.spidnums.com` block
- `backend/app/config.py` — new `Settings` fields for the above
- `backend/requirements.txt` — add `livekit-api`
- `DEPLOYMENT.md` — new section (appended, not rewritten) documenting the VPS firewall/DNS steps

**Phase 2 — Data model:**
- `db/migrations/0028_video_calls.sql` (new) — `call_sessions`, `call_participants`, `call_invitations`, `call_events`, `call_messages` (spec §12–16), enums, indexes, guarded RLS block
- `backend/app/models.py` — matching SQLAlchemy classes + enum tuples

**Phase 3 — Authorization + core API:**
- `backend/app/permissions.py` — `can_call()`, `can_invite_to_call()`
- `backend/app/schemas.py` — request/response Pydantic models for calls/participants/invitations/events
- `backend/app/routers/calls.py` (new) — create/list/get/accept/decline/cancel/end, participants list/invite/remove (spec §17; chat endpoints deferred to Phase 11)
- `backend/app/main.py` — register `calls.router`

**Phase 4 — LiveKit tokens:**
- `backend/app/services/livekit_tokens.py` (new) — identity/room naming (`profile_<uuid>` / `call_<uuid>`, spec §19), short-lived token minting via `livekit-api`
- `POST /calls/{id}/token` added to `calls.py`

**Phase 5+ — Frontend, quality/adaptation, poor-network handling, screen share, group calls, chat, E2EE, testing** — file plan will be refined at each phase per spec §24; expect `frontend/package.json` (`livekit-client`, `@livekit/components-react`), `frontend/src/lib/livekit/`, `frontend/src/components/calls/*`, and the hooks listed in spec §24.

---

## Decisions log

Record anything decided that isn't spelled out verbatim in the spec, so it's never re-decided differently later.

- **Frontend deployment target for this feature**: build against the actual current deployment (self-hosted Docker on the VPS), not the spec's stale Vercel assumption. No spec requirement depends on Vercel specifically, so this is a correction, not a deviation.
- **Ringing delivery**: `Notification` row (existing system, per spec §20) for persistence/inbox + badge; a short-interval poll on `GET /calls?status=ringing` (exact endpoint/shape to be finalized at Phase 3) for near-real-time ringing while the app is open, since there is no pre-room channel to push a LiveKit data message through. LiveKit realtime data only covers in-room signaling (chat, etc.) once a participant has actually joined.
- **Migration number**: next call-feature migration is `0028_video_calls.sql`.
- **RLS block**: included in the new migration for consistency with every migration since `0016`, even though it's a no-op on the current VPS target (no `authenticated` role) — matches existing precedent exactly, not a new judgment call.

---

## Phase log

### Phase 0 — Repository analysis — **DONE**
See findings above. No code modified, per spec §31 ("do not modify code yet").

### Phase 1 — LiveKit + coturn infrastructure — **DONE**

Verified LiveKit's current (v1.13.6) self-hosting config schema and coturn integration against
LiveKit's own `config-sample.yaml` and deployment docs before writing anything (not from
memory alone — this ecosystem moves fast and getting `rtc.turn_servers` vs. the embedded
`turn:` block wrong would have been a silent, hard-to-debug mistake). Confirmed:

- `rtc.turn_servers[]` (host/port/protocol/secret/ttl) is how LiveKit points at an *external*
  TURN server (our coturn) — distinct from the top-level `turn:` block, which configures
  LiveKit's *own* embedded TURN server (left `enabled: false`, per the spec's explicit
  "self-hosted coturn" decision, not LiveKit's built-in one).
- `LIVEKIT_KEYS` env var (format `"key: secret"`) is a real, documented alternative to a
  `keys:` block in the yaml file — used so the API key/secret never has to be written to disk
  in `livekit.yaml` at all, only passed as an env var interpolated from `deploy/.env`.
- Pinned versions: `livekit/livekit-server:v1.13.6` (current stable as of this writing),
  `coturn/coturn:4.17.2` (current stable). Both should be bumped deliberately, not silently,
  when actually deploying — check for newer stable tags first.

**Files changed** (all infrastructure/config — no application logic):
- `deploy/docker-compose.yml` — added `livekit` and `coturn` services, both `network_mode: host`
  (not the `web`/`internal` networks everything else uses); added `LIVEKIT_API_KEY`/`_SECRET`
  to the `api` service's environment; updated the stale header comment (it still said "four
  services" and didn't mention `frontend`, which predates this work)
- `deploy/livekit.yaml.example` (new), `deploy/turnserver.conf.example` (new)
- `deploy/.env.example` — `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `TURN_SHARED_SECRET`
- `deploy/api.env.example` — `LIVEKIT_URL`, `CALL_RINGING_TIMEOUT_SECONDS`
- `deploy/Caddyfile.example` — `video.spidnums.com` block; documented (not resolved) how Caddy
  reaches a host-networked LiveKit container
- `backend/app/config.py` — `livekit_url`/`livekit_api_key`/`livekit_api_secret`/
  `call_ringing_timeout_seconds` Settings fields + `livekit_is_configured` property
- `backend/app/main.py` — boots-time warning when LiveKit isn't configured in production
  (same pattern as the existing JWT/email/CORS warnings)
- `backend/requirements.txt` — `livekit-api>=1.2,<2.0`
- `.gitignore` — `deploy/livekit.yaml`, `deploy/turnserver.conf` (real secret-bearing configs;
  `.example` versions are tracked, matching the existing `api.env`/`api.env.example` split)
- `DEPLOYMENT.md` — new "Video calling (LiveKit + coturn)" section: DNS, coturn's own TLS cert
  (Caddy doesn't cover it — not an HTTP host), UFW firewall rules, step-by-step deploy, monitoring

**⚠️ Not verified — needs hands-on confirmation on the real VPS before this is actually deployed:**
`livekit`/`coturn` use `network_mode: host` (the documented-correct pattern for WebRTC's large
UDP port range — Docker's per-published-port iptables/proxy overhead is prohibitive otherwise),
which means the container has no presence on the `web` bridge network the VPS's existing Caddy
uses to reach `speednum-api`/`speednum-frontend` by container name. `Caddyfile.example`
documents two candidate ways to bridge that gap (`host.docker.internal` via `extra_hosts` on
Caddy's own compose config, or the Docker bridge gateway IP) but **neither has been tested
against the actual host** — I have no SSH access to it from this environment. This is the one
piece of Phase 1 that needs a human (or a future session with VPS access) to actually try both
and confirm which one works, before `video.spidnums.com` will really route traffic. Flagged
here and in `DEPLOYMENT.md` so it isn't quietly assumed to work.

Also not yet done (deliberately deferred, not forgotten): actually running `docker compose up`
against these services (no Docker daemon in this environment), obtaining real DNS records/TLS
certs, and opening the UFW rules — all of that is real-VPS deploy work, tracked in
`DEPLOYMENT.md`'s new section, not something to fake here.

### Phase 2 — Database models/migrations — NOT STARTED

### Phase 2 — Database models/migrations — NOT STARTED

### Phase 3 — Call authorization and APIs — NOT STARTED

### Phase 4 — LiveKit token generation — NOT STARTED

### Phase 5 — Basic 1:1 audio/video — NOT STARTED

### Phase 6 — Simulcast + Adaptive Stream + Dynacast — NOT STARTED

### Phase 7 — Quality selector + connection indicator — NOT STARTED

### Phase 8 — Poor-network handling + reconnection + audio-only fallback — NOT STARTED

### Phase 9 — Device controls + screen sharing — NOT STARTED

### Phase 10 — Group calling + participant invitations — NOT STARTED

### Phase 11 — Realtime call chat + persistence — NOT STARTED

### Phase 12 — E2EE + security hardening — NOT STARTED

### Phase 13 — Full network/performance testing — NOT STARTED

---

## Environment variables introduced by this feature (running list)

| Variable | File | Purpose |
|---|---|---|
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | `deploy/.env` | Shared secret between `livekit` and `api` services |
| `TURN_SHARED_SECRET` | `deploy/.env` | Shared secret between `coturn` and `livekit` (short-lived TURN credential minting) |
| `LIVEKIT_URL` | `deploy/api.env` | Public `wss://` URL returned to frontend clients |
| `CALL_RINGING_TIMEOUT_SECONDS` | `deploy/api.env` | Default `30`, per spec §20 |

## Migrations added by this feature (running list)

_None yet — next up in Phase 2: `db/migrations/0028_video_calls.sql`._

## Known limitations (running list, per spec §32/definition of done)

- Caddy → LiveKit reachability (host-networked container) is documented but **not verified**
  against the real VPS — see Phase 1 log above.
- No infrastructure has actually been deployed/run yet — config and compose definitions only.

## Next step

Start Phase 2: `db/migrations/0028_video_calls.sql` (`call_sessions`, `call_participants`,
`call_invitations`, `call_events`, `call_messages` — spec §12–16) plus the matching
`backend/app/models.py` SQLAlchemy classes.
