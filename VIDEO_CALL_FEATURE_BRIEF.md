# Video Call Feature — Technical Brief

Context for planning a video-calling feature in SpeedNum. Written to hand to another
AI/engineer for architecture/implementation planning — current stack + requirement +
library options only.

## 1. Current Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 — deployed on Vercel |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2.0 (async), asyncpg, Pydantic v2 — deployed as a Docker container (uvicorn, 4 workers) |
| Database | PostgreSQL 16, self-hosted in Docker on the same VPS |
| Object storage | MinIO (S3-compatible), self-hosted in Docker, private bucket, presigned URLs |
| Auth | Self-hosted (no Supabase/Auth0/Clerk). Argon2id password hashing, EdDSA (Ed25519)-signed JWT access tokens (15 min), rotating hashed refresh tokens in httpOnly cookies |
| Hosting | One Hostinger VPS (4 vCPU), Docker Compose (`api`, `postgres`, `minio`, `migrate` services), Caddy as the sole public reverse proxy (auto TLS) |
| Public ports today | 22 (SSH), 80/443 (Caddy) only — everything else (Postgres, MinIO, API) is Docker-internal, no host ports published |
| Real-time infra today | **None.** Existing "messaging" features (client↔firm chat, company-owner↔platform support chat) are plain REST/poll-based — there is no WebSocket endpoint anywhere in the backend yet |

The project has consistently moved *away* from managed/third-party backends (dropped
Supabase for Postgres/Auth/Storage, all self-hosted now) — worth keeping in mind when
picking a video vendor: a fully managed video API is a philosophical step backward for
this codebase, even though it'd ship faster.

## 2. Calling Requirement (who can call whom)

This is a **permissioned, tenant-scoped call graph**, not open calling. Existing role
model already encodes exactly the relationships needed:

- **Tenant ("company")** — an accounting firm using SpeedNum. Staff have `profiles.role`
  ∈ `owner`, `admin`, `member`, `viewer`.
- **Client** — a tenant's own customer. Has a portal login (`profiles.client_id` set),
  and optionally one assigned staff member (`clients.owner_id`).
- **Platform ("firm owner")** — SpeedNum itself, operated by super-admin users
  (`profiles.is_superadmin`).

Requested calling matrix:

| Caller | Allowed callee(s) |
|---|---|
| Client | their assigned staff member (`clients.owner_id`), or any company Owner in that tenant |
| Company Owner | any staff member in their tenant, or any client of their tenant |
| Company Owner | the platform (SpeedNum super-admin) |
| Platform (super-admin) | any company Owner |

This mirrors the access rules already implemented for text messaging in
`backend/app/routers/client_messages.py` (client ↔ assigned-staff-or-Owner) and
`backend/app/routers/support.py` (company Owner ↔ platform super-admin) — same
authorization boundaries, just for a call instead of a message. The existing scope
dependencies (`backend/app/deps.py`: `BookScopeDep`, `ClientScopeDep`,
`OwnerOrSuperadminDep`, `SuperadminDep`) already express these boundaries and should
gate call initiation/token-minting the same way.

## 3. What Has to Be Built (nothing below exists yet)

- **Signaling** — a way for two parties to exchange call-setup info (offer/answer/ICE
  or equivalent) and to ring/notify the callee in real time.
- **Media transport** — actual audio/video stream between the two browsers (WebRTC).
- **NAT traversal** — STUN, and TURN relay for the (common) case where a direct
  peer-to-peer path isn't reachable.
- **Call bookkeeping** — a Postgres table for call sessions (caller, callee, status,
  timestamps), tenant-scoped like every other table in `db/migrations`.
- **Incoming-call UX** — real-time "ringing" push to the callee (ties into the existing
  `backend/app/routers/notifications.py`), plus accept/decline/hang-up frontend UI.
- **Authorization** — enforce the calling matrix above server-side before a call can
  connect; never trust the client to self-report who it's allowed to call.

## 4. Architecture Options

### A. Self-hosted SFU — **LiveKit** (best fit for this stack)
Open-source, self-hostable via Docker — drops into the existing `deploy/docker-compose.yml`
pattern on the same VPS. Handles signaling *and* media routing itself (SFU), so no
hand-rolled WebRTC signaling is needed.
- Backend only needs to authorize the call (per the matrix above) and mint a short-lived
  LiveKit access token — one new FastAPI endpoint, reusing the existing JWT identity.
- New infra: `livekit-server` Docker service (+ built-in or separate TURN), a Caddy
  route for its signaling port, and an open UDP port range in the VPS firewall.

### B. Raw WebRTC + custom signaling
- FastAPI's native WebSocket support for signaling (offer/answer/ICE exchange) — new
  code, since there's currently zero WebSocket infra in the backend.
- `coturn` (self-hosted STUN/TURN) as its own Docker service.
- Frontend uses the browser's native WebRTC APIs directly.
- Full control, but you own reconnection, glare handling, and any future group-call
  logic yourself.

### C. Managed video API (fallback, not the project's usual direction)
Twilio Video, Daily.co, Agora, Vonage, Stream Video, 100ms, Zoom Video SDK. Fastest to
ship, per-minute billing, and media leaves the VPS — inconsistent with this project's
established self-hosted-everything pattern, but worth naming as the "ship it this week"
option.

**Recommendation:** LiveKit self-hosted (Option A) if 1:1 (and eventually small-group)
calls are enough — it's the closest fit to how this project already runs Postgres/MinIO
itself. Fall back to a managed API only if time-to-ship outweighs the self-hosting
preference.

## 5. Libraries by Option

**If LiveKit (A):**
- Backend (Python): `livekit-api` (server SDK — mint room access tokens, manage rooms)
- Frontend (TS/React): `livekit-client` (core WebRTC client), `@livekit/components-react`
  (prebuilt video/audio UI components + hooks)
- Infra: `livekit/livekit-server` Docker image; `coturn` optional if not using LiveKit's
  built-in TURN

**If raw WebRTC (B):**
- Backend: FastAPI's built-in `WebSocket` support (no new package) for signaling
- Infra: `coturn` Docker image for STUN/TURN
- Frontend: native `RTCPeerConnection` / `getUserMedia` browser APIs (no package
  required), optionally a thin helper like `simple-peer`

**If managed (C):**
- One vendor's JS client SDK + server SDK (e.g. `twilio-video` + `twilio` server SDK) —
  no self-hosted media infra required

## 6. Data Model (Postgres, tenant-scoped)

New migration in `db/migrations`, e.g.:
- `call_sessions`: `id`, `tenant_id`, `caller_profile_id`, `callee_profile_id`, `status`
  (`ringing` / `accepted` / `declined` / `missed` / `ended`), `started_at`, `ended_at`,
  `room_name` (or provider room/token reference)

## 7. Security Notes

- Authorize server-side against the calling matrix in §2 before minting any call
  token or accepting a signaling connection.
- WebRTC media is DTLS-SRTP encrypted peer-to-peer/through the SFU by default — no
  extra encryption work needed there.
- Rate-limit call-initiation endpoints to prevent call spam/harassment across roles.

## 8. VPS/Infra Changes Needed

- New Docker Compose service(s): `livekit-server` (+ `coturn` if used) on the same
  `internal`/`web` network split the existing services use.
- New Caddy route for the signaling port's TLS termination (same pattern as the
  existing API route).
- UFW: open the UDP media port range — today only 22/80/443 are open.
- Capacity: video relay is far heavier on bandwidth/CPU than the current REST traffic —
  worth sizing the VPS once real concurrent-call volume is expected.
