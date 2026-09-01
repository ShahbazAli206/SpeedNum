# Video Calling — E2EE Threat Model & Security Notes

Companion to `spidnums_VIDEO_CALL_IMPLEMENTATION_SPEC.md` (§26, §33.10) and
`VIDEO_CALL_PROGRESS.md`. Read this before touching anything that claims to encrypt calls.

## Current honest status

**End-to-end encryption is NOT enabled, and calls must NOT be described as "end-to-end
encrypted" anywhere in the product.** The spec is explicit (§26): E2EE may not be claimed until
key generation, key *distribution*, and client encryption behaviour are actually implemented
and tested. Only the mechanism is wired; the hard part is deliberately unsolved (see below).

What IS in place:

| Control | Status |
|---|---|
| TLS/HTTPS for all API + signaling traffic | Yes (Caddy) |
| WSS for LiveKit signaling | Yes (`video.spidnums.com`) |
| WebRTC media encrypted in transit (DTLS-SRTP) | Yes — **but hop-by-hop through the SFU, not E2EE** |
| Short-lived, server-authorized LiveKit tokens | Yes (Phase 4) |
| LiveKit API secret never reaches the browser | Yes (Phase 4) |
| Opaque participant/room identifiers | Yes (`profile_<uuid>` / `call_<uuid>`) |
| Server-side calling authorization on every endpoint | Yes (Phase 3, `can_call`/`can_invite_to_call`) |
| Rate limiting on create/invite/token/chat | Yes (Phase 3/4/11) |
| Audit trail (`call_events`) with no media contents | Yes (Phase 2/3) |
| Screen-share confirm-before-share warning | Yes (Phase 9, spec §33.7) |
| **True end-to-end encryption of media** | **NO — scaffolding only** |

### DTLS-SRTP is not E2EE

WebRTC always encrypts media in transit with DTLS-SRTP. But in an SFU topology the server
(LiveKit) terminates that encryption to route streams — so the provider *could*, in principle,
access media. That is the exact gap E2EE closes, and why "the media is encrypted" (true) must
never be marketed as "end-to-end encrypted" (not true here yet).

## The scaffolding that exists

`frontend/src/lib/livekit/e2ee.ts` builds LiveKit's insertable-streams E2EE:
`ExternalE2EEKeyProvider` + the SDK's E2EE Web Worker, enabled via `Room` options +
`room.setE2EEEnabled(true)`. It is:

- **Off by default.** `useCall.connect()` only builds it when passed an `e2eePassphrase`, and
  nothing passes one today.
- **Dynamically imported**, so the E2EE worker never enters the default (non-E2EE) call bundle.
- **Untested** against a live LiveKit server with real media.

## The open problem: key distribution

`ExternalE2EEKeyProvider` takes a shared **passphrase**. For E2EE to be real, every participant
must obtain the same passphrase **without the server ever learning it** — otherwise the server
can derive the key and decrypt, which is not end-to-end.

Approaches, and why each is unfinished:

1. **Server-generated per-call passphrase, delivered in the token response.** Simplest, and
   what the code is shaped for — but the server would know the key, so this is *encryption at
   the SFU boundary*, not E2EE. Only acceptable if the threat model explicitly trusts the
   self-hosted server (which, being self-hosted by the same firm, it arguably can — but then
   say *that*, not "E2EE").
2. **Out-of-band passphrase** (participants type/share a code). True E2EE, poor UX, and needs a
   secure side channel the product doesn't have.
3. **Per-participant key exchange** (each publishes a public key; keys wrapped per recipient).
   Real E2EE, real work — a proper design task, not a config flag.

**Decision required before enabling anything:** which trust model the product actually wants,
stated plainly to users. Until then, E2EE stays off and unclaimed.

## What to do before turning E2EE on

1. Choose and implement a key-distribution model (above), and write down its trust assumptions.
2. Test with ≥3 real participants across browsers that encrypted media decodes correctly and
   that a participant without the key genuinely cannot decode.
3. Confirm the E2EE Web Worker bundles and loads under this Next.js build (Turbopack) — the
   dynamic `new Worker(new URL("livekit-client/e2ee-worker", import.meta.url))` is unverified
   here.
4. Only then add any "encrypted call" indicator (spec §33.11), and only with copy that matches
   the actual trust model.

## Data-at-rest posture (spec §33.3, §33.5)

Deliberately minimal, by design:

- **No recording, no stored media, no screenshots** (spec §29, §33.1) — live media is
  transient. Nothing in the backend persists audio/video/screen frames.
- **Chat** is the one thing that becomes data-at-rest (`call_messages`). Retention is meant to
  be configurable and swept (spec §33.2) — the table has no expiry column on purpose; an
  application-level sweep is the intended mechanism (not yet built — Phase 11 landed
  persistence, retention is a follow-up).
- **`call_events`** holds who/what/when for audit, never media contents, never tokens/keys
  (enforced by what the router writes — see `routers/calls.py`).
- LiveKit tokens and the TURN shared secret are never logged and never persisted.
