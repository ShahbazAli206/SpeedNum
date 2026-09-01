# Video Calling — Security Review Brief (for external review)

Paste this whole document into ChatGPT (or share with a security reviewer) and ask it to assess
security, privacy, and Canadian data-protection concerns. Context and a suggested prompt are at
the bottom.

This describes a **self-hosted video-calling feature** added to an existing accounting-practice
SaaS ("SpidNums") used by Canadian accounting firms and their clients. No third-party/cloud
video provider is used. There is **no AI** in this feature.

---

## 1. Stack

- **Frontend:** Next.js 16 (React 19, TypeScript), served from the same VPS.
- **Backend:** Python 3.12, FastAPI, SQLAlchemy (async), PostgreSQL 16.
- **Auth (pre-existing):** self-hosted — Argon2id password hashing, Ed25519-signed JWT access
  tokens (15 min), rotating hashed refresh tokens in httpOnly cookies. No Supabase/Auth0/Clerk.
- **Video media server:** **LiveKit** (open-source SFU), self-hosted in Docker.
- **NAT/firewall traversal:** **coturn** (open-source STUN/TURN), self-hosted in Docker.
- **Reverse proxy / TLS:** Caddy (auto-HTTPS).
- **Hosting:** single Hostinger VPS in [FILL IN REGION — must be confirmed for CRA/PIPEDA
  data-residency claims], Docker Compose. Everything is on one server the firm controls.
- **Media transport:** WebRTC, DTLS-SRTP encrypted in transit (hop-by-hop through the SFU).

## 2. Who can call whom (authorization model)

Roles: **firm Owner**, **staff** (admin/member/viewer), **client** (portal login), **platform
super-admin**. Every rule is enforced **server-side** (never trusted from the browser) by a
central `can_call(caller, target)` function. Tenancy = each firm is a "tenant"; data is isolated
per tenant.

Allowed (and their reverse, so a callee can answer):
- Client → their assigned staff member, or any Owner in their firm.
- Owner → any staff member or any client in their firm; or the platform super-admin.
- Platform super-admin → any firm Owner (the only cross-tenant path).

Explicitly rejected: cross-tenant calls (one firm to another firm's people), staff↔staff,
client↔client, platform→non-owner, self-calls, calls to deactivated accounts. Mid-call
invitations run the **same** check again server-side (`can_invite_to_call`), and a caller must
already be a joined participant to invite anyone. **17 automated tests cover this matrix; the
full backend suite (465 tests) passes.**

## 3. Features / functionality

**Calling:** 1:1 and group video or audio calls; outgoing ring; incoming ring (accept/decline);
missed-call after a 30s timeout; cancel; hang up. Ringing is delivered by polling + the app's
existing in-app notification feed (no separate push system).

**In-call controls:** mic mute/unmute, camera on/off, speaker/mic/camera device selection,
screen sharing (whole screen / window / tab) with a **mandatory "you're about to share your
screen — hide sensitive info" warning before sharing starts**, leave/end.

**Quality & network resilience:** user quality selector (Auto / 360p / 720p / 1080p, interpreted
as a *ceiling*, not forced); LiveKit simulcast + adaptive-stream + dynacast so quality follows
the network; automatic reconnection on network drop; a "low-data mode" that drops video and
keeps audio; a connection-quality indicator (Excellent/Good/Fair/Poor/Reconnecting).

**Group features:** grid / spotlight / 1:1 layouts; participant list; add-participant mid-call
(re-authorized server-side); remove-participant (initiator/moderator).

**In-call chat:** live text over LiveKit's data channel, **persisted** to the database for
history.

**No recording of any kind** — no audio, video, or screen recording; live media is transient
and never stored.

## 4. Data model — what is stored at rest (PostgreSQL)

**This is the key section for breach/CRA analysis: what personal/financial data actually lands
on disk.** Migration `0028_video_calls.sql`. Five tables:

- **call_sessions** — one row per call: tenant id, room name, who started it, type
  (audio/video), status, start/connect/end timestamps, duration. *No media, no content.*
- **call_participants** — who was in a call: call id, profile id, role, status, joined/left
  timestamps.
- **call_invitations** — who invited whom to a call, and the response status.
- **call_events** — append-only audit trail: event type (call_created, call_accepted,
  participant_joined/left/removed, call_ended, etc.), actor, small structured metadata (e.g.
  `{"reason": "timeout"}`). **Never media contents, never tokens/secrets.**
- **call_messages** — in-call chat text: call id, sender, message text, timestamps
  (created/edited/deleted).

**NOT stored anywhere:** audio, video, screen-share frames, raw WebRTC packets, LiveKit access
tokens, TURN credentials. Live media flows through the LiveKit SFU in real time and is discarded
— it is never written to disk or to object storage.

**The only call data at rest that could contain confidential/financial info is: (a) in-call
chat text (`call_messages`), and (b) whatever is inferable from call metadata (who spoke to whom,
when, how long).**

## 5. Security controls in place

- All traffic over HTTPS/WSS (TLS). WebRTC media is DTLS-SRTP encrypted in transit.
- Server-side authorization on **every** call/token/invite/chat endpoint (Section 2).
- Strict per-firm (tenant) isolation; the only cross-tenant path is platform-admin ↔ Owner.
- **LiveKit room-join tokens are short-lived, minted server-side, scoped to one specific room,
  and the LiveKit API secret is never sent to the browser or logged.**
- **Opaque identifiers** inside LiveKit — participants are `profile_<uuid>`, rooms are
  `call_<uuid>`; no names, emails, or firm names are put into LiveKit identities/room names.
- **coturn uses short-lived, per-session HMAC credentials** (a shared secret mints time-limited
  TURN logins) — no fixed TURN username/password.
- Rate limiting on call creation, invitations, token requests, and chat (per firm).
- Append-only audit trail (`call_events`) of security-relevant events, with **no media contents
  and no secrets**.
- Screen-share confirmation warning before any sharing begins.
- No recording, no automatic screenshots, no stored media (data-minimization by design).

## 6. Endpoints (all require a valid access token; all authorize server-side)

`POST /calls` (start), `GET /calls`, `GET /calls/candidates` (who I may call), `GET /calls/{id}`,
`POST /calls/{id}/token` (mint LiveKit join token — this is also the "join" action),
`POST /calls/{id}/accept|decline|cancel|end`, `GET /calls/{id}/participants`,
`POST /calls/{id}/participants/invite`, `DELETE /calls/{id}/participants/{profile_id}`,
`GET /calls/{id}/chat`, `POST /calls/{id}/chat`.

## 7. Known gaps / open decisions (please review these too)

1. **End-to-end encryption (E2EE) is built but OFF and unclaimed.** Media is encrypted in transit
   (DTLS-SRTP) but the SFU terminates that encryption to route it — so it is *not* end-to-end.
   True E2EE scaffolding exists (LiveKit insertable-streams) but is disabled because the
   key-distribution/trust model hasn't been decided. **We do not describe calls as
   "end-to-end encrypted."** Question for review: given CRA-sensitive financial discussions, is
   transit encryption + a trusted self-hosted SFU acceptable, or is true E2EE required?
2. **Chat retention:** chat text is persisted with no automatic expiry/deletion yet. A
   configurable retention + auto-delete sweep is planned but **not built**. Question: what
   retention policy and deletion workflow are needed for Canadian compliance?
3. **Data residency:** the whole stack (Postgres, LiveKit, coturn, backups, logs) is on one VPS
   whose physical region must be confirmed before any "Canadian data residency" claim.
4. **No LiveKit server-side webhook verification of join/leave** — participant status is inferred
   from the app's own API calls, not confirmed by LiveKit. (Product-accuracy, minor security
   relevance.)
5. Not yet run against a live server/browser — this is code + automated logic tests only;
   real-world behaviour is unverified.

## 8. Regulatory context for the reviewer

- Users are **Canadian accounting firms and their clients**; calls may discuss confidential
  **financial and tax information**.
- Relevant frameworks: **PIPEDA** (federal private-sector privacy), provincial equivalents, and
  **CRA** security expectations where a firm handles CRA "Protected A/B" information under a CRA
  contract/requirement. (Note: not every firm is automatically subject to every CRA contractor
  requirement — but the design should not obstruct secure handling.)
- Design intent: **collect as little call data as possible, keep live media transient, never
  record, and protect every participant through server-side authorization.**

---

### Suggested prompt to paste along with this document

> The document below describes a self-hosted video-calling feature for a Canadian
> accounting-practice web app. Clients and accountants may discuss confidential tax/financial
> information on these calls. Please review it for: (1) security vulnerabilities or weaknesses;
> (2) privacy/data-protection concerns under Canadian law (PIPEDA and CRA security
> expectations); (3) data-breach exposure — what data is at risk and how to reduce it;
> (4) whether transit encryption through a self-hosted SFU is sufficient or whether true
> end-to-end encryption is needed; (5) what retention/deletion, consent, notice, and audit
> controls I should add before going to production in Canada. Point out anything missing. I am
> not a security expert, so please be concrete and prioritize.
