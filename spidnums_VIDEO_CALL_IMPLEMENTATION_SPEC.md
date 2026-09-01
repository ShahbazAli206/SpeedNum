# SpeedNum — Production Video Calling Implementation Specification

## Purpose

Implement a production-grade, self-hosted video calling feature in the existing SpeedNum project.

This document is the implementation contract. **Read the existing repository first and do not modify code until the architecture and affected files are understood.**

The primary goals are:

1. Very low latency and minimal interruption.
2. Excellent video quality.
3. Adaptive quality for poor/unstable networks.
4. User-selectable 360p / 720p / 1080p.
5. Secure, tenant-scoped calling.
6. 1:1 and small-group calls.
7. In-call chat.
8. Mic/camera/speaker controls.
9. Screen sharing.
10. Ability for an authorized participant to invite another authorized company member/client during a call.
11. Prefer fully self-hosted/free software; no per-minute managed video provider.

---

## 1. Existing project — preserve this architecture

Current stack:

- Frontend: Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4
- Backend: Python 3.12, FastAPI, SQLAlchemy 2.0 async, asyncpg, Pydantic v2
- Database: PostgreSQL 16
- Object storage: self-hosted MinIO
- Authentication: self-hosted; Argon2id passwords, Ed25519-signed JWT access tokens, rotating hashed refresh tokens in httpOnly cookies
- Infrastructure: Docker Compose
- Reverse proxy: Caddy
- Hosting: Hostinger KVM 4
- Existing realtime layer: none
- Existing messaging is REST/poll based

Do not replace existing authentication, authorization, PostgreSQL, MinIO, Docker or Caddy architecture.

Do not introduce Supabase, Auth0, Clerk or a managed video provider.

The existing role/tenant authorization model is the source of truth.

---

# 2. Video architecture — mandatory decision

Use:

- Self-hosted LiveKit SFU
- Self-hosted coturn TURN
- FastAPI for business authorization and LiveKit token generation
- PostgreSQL for call state/history
- `livekit-client`
- `@livekit/components-react`
- Python `livekit-api`

Do NOT build custom WebRTC signaling.

Do NOT build a custom FastAPI WebSocket signaling layer.

LiveKit must handle:

- WebRTC signaling
- media transport
- SFU routing
- ICE
- reconnection
- simulcast
- adaptive stream
- Dynacast
- participant state
- realtime data/text

FastAPI remains responsible for:

- authentication
- tenant authorization
- deciding who can call whom
- creating calls
- invitations
- token generation
- call bookkeeping
- notifications
- persistence

---

# 3. Quality and network philosophy

The system must NOT be designed around "always force 1080p."

The priority is:

1. Keep the call connected.
2. Preserve clear/stable audio.
3. Minimize latency.
4. Preserve stable FPS.
5. Use the highest video resolution the network can actually sustain.

If network conditions deteriorate, reduce video quality before sacrificing audio or ending the call.

Use LiveKit:

- Simulcast
- Adaptive Stream
- Dynacast
- automatic reconnection
- ICE/TURN fallback

Default user mode:

**Auto**

Normal target:

**720p**

Maximum:

**1080p**

Minimum:

**360p**

---

# 4. Video quality selector

The UI must provide:

- Auto
- 360p
- 720p
- 1080p

Important semantics:

Selecting 1080p means:

> "Allow up to 1080p."

It must NOT mean:

> "Force 1080p even when the network cannot sustain it."

The system may still downgrade the stream when bandwidth is insufficient.

For receiving remote video, use LiveKit's quality controls appropriately rather than recreating camera tracks whenever a user changes the quality setting.

---

# 5. Simulcast and adaptation

Enable:

- simulcast
- adaptiveStream
- dynacast

Publish appropriate quality layers.

The implementation should support approximately:

- 360p
- 720p
- 1080p

Do not unnecessarily send 1080p to tiny participant thumbnails.

Use Adaptive Stream so video subscriptions follow the size/visibility of the rendered video element.

Use Dynacast so unused layers are not continuously transmitted.

If codec choice is configurable, prioritize broad browser compatibility initially (VP8/H.264). Do not make AV1 a requirement for v1.

---

# 6. Poor-network behavior

When bandwidth or connection quality becomes poor:

1. Reduce video layer.
2. Reduce video FPS if necessary.
3. Stop unnecessary high-resolution layers.
4. Preserve audio.
5. Keep the connection alive.
6. Show a connection-quality indicator.
7. Offer or automatically switch to audio-only if video becomes unusable.

Do not repeatedly oscillate:

`720 → 360 → 720 → 360`

Use hysteresis:

- downgrade quickly when degradation is clear
- upgrade only after sustained stability

Add a **Low Data Mode** that favors lower video resolution/FPS and audio stability.

---

# 7. Connection-quality UI

Show a small indicator:

- Excellent
- Good
- Fair
- Poor
- Reconnecting

When expanded, show available diagnostics such as:

- RTT/latency
- packet loss
- jitter
- current video quality
- FPS
- codec

Use LiveKit's connection-quality/statistics APIs where available.

---

# 8. Connectivity and TURN

Self-host:

- LiveKit
- coturn

Support, in order where applicable:

1. ICE/UDP
2. TURN/UDP
3. ICE/TCP
4. TURN/TLS

The implementation must be tested behind:

- normal home Wi-Fi
- mobile hotspot
- VPN
- UDP-blocking/corporate-style firewall

LiveKit's production deployment currently uses:

- 7880 for API/WebSocket behind TLS termination
- 7881 for ICE/TCP
- 50000-60000 UDP for WebRTC media by default
- optional UDP mux on 7882
- TURN as configured

Do not route WebRTC UDP media through Caddy.

Keep PostgreSQL, MinIO and internal application services private.

---

# 9. VPS architecture

Initial deployment may run on the existing Hostinger KVM 4.

Structure Docker Compose so LiveKit can later move to a separate video VPS without redesigning the application.

Initial:

Application + LiveKit + TURN on current VPS.

Future:

Application VPS
+
Video/LiveKit VPS

Do not promise a fixed concurrent-call capacity. Measure actual capacity on the real VPS.

Monitor:

- CPU
- RAM
- network ingress
- network egress
- packet loss
- active rooms
- active participants
- reconnects

---

# 10. Calling permissions

Existing calling matrix:

### Client can call

- assigned staff member (`clients.owner_id`)
- any company Owner in the client's tenant

### Company Owner can call

- any staff member in their tenant
- any client in their tenant
- SpeedNum platform/superadmin

### Platform/superadmin can call

- any company Owner

Use the project's existing authorization dependencies and tenant-scope mechanisms.

Do not duplicate authorization logic in the frontend.

Create centralized backend checks such as:

`can_call(caller, target)`

and:

`can_invite_to_call(caller, target, call)`

Every call/token/invitation endpoint must perform server-side authorization.

---

# 11. Call model

Do not model calls as permanently limited to caller + callee.

A call is a session with multiple participants.

Recommended entities:

- `call_sessions`
- `call_participants`
- `call_invitations`
- `call_events`
- `call_messages`

---

# 12. `call_sessions`

Fields:

- id UUID
- tenant_id UUID nullable where platform calls require it
- room_name
- initiator_profile_id
- call_type (`audio`, `video`)
- status
- started_at
- connected_at
- ended_at
- duration_seconds
- created_at
- updated_at

Statuses:

- ringing
- accepted
- declined
- missed
- cancelled
- ended
- failed

Use appropriate indexes and foreign keys.

---

# 13. `call_participants`

Fields:

- id UUID
- call_session_id
- profile_id
- role
- status
- invited_at
- joined_at
- left_at
- created_at

Roles:

- initiator
- participant
- moderator

Statuses:

- invited
- ringing
- joined
- declined
- left
- removed

---

# 14. `call_invitations`

Fields:

- id UUID
- call_session_id
- inviter_profile_id
- invitee_profile_id
- status
- created_at
- responded_at

Statuses:

- pending
- accepted
- declined
- expired
- cancelled

---

# 15. `call_events`

Persist important lifecycle/audit events:

- call_created
- call_ringing
- call_accepted
- call_declined
- call_missed
- participant_invited
- participant_joined
- participant_left
- participant_removed
- call_ended

Fields:

- id
- call_session_id
- actor_profile_id
- event_type
- metadata JSONB
- created_at

Do not log secrets, LiveKit tokens or E2EE keys.

---

# 16. `call_messages`

Fields:

- id UUID
- call_session_id
- sender_profile_id
- message
- created_at
- edited_at
- deleted_at

Use LiveKit realtime data/text for immediate delivery and PostgreSQL for persistence/history.

Do not use polling for in-call chat.

Use reliable delivery for chat.

---

# 17. Backend API

Follow the project's existing API naming conventions. Conceptually implement:

- `POST /api/calls`
- `GET /api/calls`
- `GET /api/calls/{call_id}`
- `POST /api/calls/{call_id}/accept`
- `POST /api/calls/{call_id}/decline`
- `POST /api/calls/{call_id}/cancel`
- `POST /api/calls/{call_id}/end`
- `POST /api/calls/{call_id}/token`
- `GET /api/calls/{call_id}/participants`
- `POST /api/calls/{call_id}/participants/invite`
- `DELETE /api/calls/{call_id}/participants/{profile_id}`
- `GET /api/calls/{call_id}/chat`
- `POST /api/calls/{call_id}/chat`

Do not blindly create these paths if the project has a different established convention.

---

# 18. LiveKit token endpoint

The token endpoint must verify:

1. existing SpeedNum authentication
2. call exists
3. user belongs to the call
4. user is authorized for the tenant
5. call is still joinable
6. participant identity matches the authenticated profile

Only then generate a short-lived LiveKit token.

Return only:

- LiveKit WebSocket URL
- token
- room identifier if needed by the client

Never return LiveKit API secrets.

Never expose LiveKit API secrets to frontend code.

---

# 19. Participant identity and room names

Use opaque IDs.

Example:

`profile_<UUID>`

Room:

`call_<UUID>`

Do NOT use:

- email addresses
- phone numbers
- real names
- tenant/company names

inside LiveKit identity or room names.

---

# 20. Incoming calls

Implement:

- outgoing ringing
- incoming ringing
- accept
- decline
- cancel
- missed call
- hang up

Initial ringing timeout:

30 seconds

Reuse the existing notification system.

Do not create a separate notification architecture.

---

# 21. Add participant during call

Authorized participants must be able to invite another authorized:

- staff member
- client
- owner

during an active call.

Flow:

`Add participant`
→ FastAPI gets authorized candidates
→ user selects candidate
→ backend re-checks authorization
→ invitation created
→ notification sent
→ invitee accepts
→ backend issues LiveKit token
→ invitee joins existing room

Never allow the frontend to invite arbitrary profile IDs without backend validation.

---

# 22. Call controls

Implement:

- microphone mute/unmute
- camera on/off
- speaker volume control
- microphone device selection
- camera device selection
- speaker/output selection where browser supports it
- screen sharing
- leave/end call
- video quality selector
- participant list
- chat

---

# 23. Screen sharing

Support:

- entire screen
- window
- browser tab where supported

Screen share should be a separate track/control from camera.

Keep architecture extensible for future recording, but do NOT implement recording in v1.

---

# 24. Frontend structure

Use a clean structure similar to:

`components/calls/`

- `CallWindow`
- `IncomingCall`
- `OutgoingCall`
- `VideoGrid`
- `VideoTile`
- `CallControls`
- `ParticipantList`
- `InviteParticipant`
- `CallChat`
- `QualitySelector`
- `ConnectionIndicator`
- `DeviceSelector`
- `ScreenShareButton`

Hooks:

- `useCall`
- `useCallParticipants`
- `useCallQuality`
- `useCallChat`
- `useMediaDevices`

Keep LiveKit-specific implementation isolated under something like:

`lib/livekit/`

---

# 25. Group-call UI

Support:

- 1:1 layout
- grid layout
- active-speaker/speaker layout
- local preview
- participant thumbnails
- participant list

Do not send unnecessarily high-resolution video to small thumbnails.

Use Adaptive Stream and selective subscription appropriately.

---

# 26. Security

Security requirements:

- existing JWT authentication
- server-side call authorization
- strict tenant isolation
- short-lived LiveKit tokens
- room-specific permissions
- TLS/WSS
- WebRTC encryption
- LiveKit E2EE for media/data where implemented and verified
- rate limiting
- audit events
- no secrets in frontend
- no secrets in logs
- opaque participant/room IDs

Implement E2EE carefully.

Do not hardcode encryption keys.

Do not claim E2EE is complete until the actual key-generation, key-distribution and client encryption behavior have been tested.

Document the E2EE threat model.

---

# 27. Rate limiting

Protect:

- call initiation
- repeated calls to same target
- invitations
- token requests

Prevent call spam/abuse.

Use the project's existing rate-limiting approach if one exists.

---

# 28. Docker/infrastructure

Add production-pinned LiveKit and coturn services.

Do not use unpinned `latest` for production unless the project explicitly chooses that strategy.

Use secure environment variables for:

- LiveKit API key
- LiveKit API secret
- LiveKit URL
- TURN configuration
- E2EE configuration

Do not commit secrets.

Use a dedicated video hostname such as:

`video.<domain>`

and TURN hostname such as:

`turn.<domain>`

Follow the project's existing Caddy/DNS conventions.

---

# 29. Do not overbuild v1

Do NOT implement initially:

- recording
- transcription
- AI summaries
- virtual backgrounds
- beauty filters
- PSTN/phone calling
- cloud recording

Focus on stable secure video calling first.

---

# 30. Testing requirements

Test:

### Functional

- 1:1 video
- 1:1 audio
- accept/decline
- missed call
- hangup
- mute/unmute
- camera on/off
- device selection
- screen sharing
- 360p
- 720p
- 1080p
- Auto
- chat
- add participant
- remove participant
- group calls

### Authorization

- valid client → assigned staff
- valid client → owner
- valid owner → staff
- valid owner → client
- valid owner → platform
- valid platform → owner
- invalid cross-tenant call
- unauthorized participant invitation
- unauthorized room token
- expired token

### Network

- good Wi-Fi
- poor Wi-Fi
- mobile hotspot
- high latency
- packet loss
- VPN
- UDP unavailable
- TURN/UDP
- TURN/TCP
- TURN/TLS
- Wi-Fi → cellular network change
- reconnect after temporary network failure

### Performance

Benchmark on the actual Hostinger KVM 4.

Test at least:

- 2 participants
- 4 participants
- 6 participants
- 8 participants
- 10 participants

Measure:

- CPU
- RAM
- bandwidth
- packet loss
- reconnects
- active rooms
- active participants

Do not claim capacity until measured.

---

# 31. Implementation phases

Do not implement everything in one uncontrolled change.

### Phase 0 — Repository analysis

Read:

- authentication
- authorization dependencies
- profiles
- clients
- notifications
- messaging
- database migrations
- Docker Compose
- Caddy
- environment configuration
- frontend component conventions

Then report the exact files/modules that should change.

Do not modify code yet.

### Phase 1

LiveKit + coturn infrastructure.

### Phase 2

Database models/migrations.

### Phase 3

Call authorization and APIs.

### Phase 4

LiveKit token generation.

### Phase 5

Basic 1:1 audio/video.

### Phase 6

Simulcast + Adaptive Stream + Dynacast.

### Phase 7

Auto/360/720/1080 quality + connection indicator.

### Phase 8

Poor-network handling + reconnection + audio-only fallback.

### Phase 9

Device controls + screen sharing.

### Phase 10

Group calling + participant invitations.

### Phase 11

Realtime call chat + persistence.

### Phase 12

E2EE + security hardening.

### Phase 13

Full network/performance testing.

---

# 32. Definition of done

Do not mark the feature complete until:

- authorized calls work
- unauthorized calls fail server-side
- tenant isolation is verified
- incoming ringing works
- accept/decline works
- audio/video are stable
- quality selector works
- Auto adaptation works
- poor network degrades video before audio
- reconnect works
- TURN fallback works
- group calls work
- participant invitation works
- chat works
- chat persistence works
- screen sharing works
- LiveKit secrets never reach frontend
- E2EE is actually implemented and tested
- rate limiting exists
- audit events exist
- Docker deployment works
- TLS works
- firewall is correct
- no secrets are logged
- actual VPS performance has been measured

Before declaring completion, report:

1. files changed
2. migrations added
3. Docker changes
4. environment variables
5. DNS/Caddy changes
6. firewall ports
7. API endpoints
8. security implementation
9. test results
10. performance results
11. known limitations
12. rollback/deployment instructions

---


# 33. Canada Privacy, Security & CRA-Sensitive-Information Requirements

## Important scope clarification

SpeedNum's video-calling feature is **not automatically a CRA-regulated video system** merely because Canadian accounting firms use it.

However, customers may use SpeedNum to discuss or display confidential financial/tax information. Therefore the feature must be designed with strong privacy and security controls.

The following requirements are product/security requirements for the implementation. They are not a substitute for Canadian legal advice.

## 33.1 No recording in v1

Do not implement:

- call recording
- automatic recording
- server-side audio recording
- server-side video recording
- automatic screen recording

Live media should be transient.

Do not persist raw audio/video/screen-share streams.

This significantly reduces the amount of sensitive information stored by SpeedNum.

If recording is introduced in a future release, it must be treated as a separate privacy-sensitive feature with:

- clear notice before recording starts
- purpose disclosure
- appropriate consent flow
- access controls
- retention policy
- deletion workflow
- audit logging
- privacy-policy updates

The Office of the Privacy Commissioner of Canada treats recorded customer calls as personal information and requires appropriate handling, including purpose/notice/consent and retention safeguards where PIPEDA applies.

## 33.2 In-call chat

Chat is different from live audio/video because it can become persistent data.

Use LiveKit realtime data for immediate delivery.

If PostgreSQL persistence is enabled:

- store only what is required
- associate messages with the call and authenticated sender
- enforce tenant authorization
- implement configurable retention
- automatically delete expired messages
- never place access tokens, secrets or encryption keys into chat
- audit administrative access where appropriate

Do not keep call chat indefinitely by default.

Recommended initial product behavior:

`Realtime chat: enabled`

`Persistent chat history: enabled only according to configured retention`

`Retention: configurable`

## 33.3 Data minimization

Do not permanently store:

- video streams
- audio streams
- screen-share streams
- raw WebRTC packets
- LiveKit access tokens
- TURN credentials longer than necessary
- E2EE keys in plaintext
- unnecessary network diagnostics
- unnecessary device information

Store only the minimum call metadata needed for product functionality, support and auditing.

## 33.4 Canadian privacy principles

The implementation should support the privacy principles applicable to the customer's deployment, including:

- accountability
- identifying purposes
- consent where required
- limiting collection
- limiting use/disclosure/retention
- safeguards
- openness
- access/correction workflows where applicable

The product should have a clear privacy notice explaining what call-related information SpeedNum processes and why.

Do not claim "PIPEDA compliant" in product copy merely because these technical controls exist. Legal applicability can vary by organization and province.

## 33.5 CRA Protected A / Protected B distinction

CRA's published security requirements are specifically important when an organization is handling **CRA Protected A or Protected B information under CRA-related requirements/contracts**.

Do not assume that every SpeedNum customer automatically becomes subject to every CRA contractor security requirement.

Nevertheless, the video architecture should avoid creating unnecessary barriers to secure handling of sensitive information.

CRA's current published guidance treats live voice, video and live screen sharing as transient information/data in motion in the stated CRA context, while chat, recording, screenshots and file sharing can create data-at-rest concerns.

Therefore:

- live media should remain transient in v1
- no recording
- no automatic screenshots
- no automatic screen capture
- no automatic file capture from calls
- chat persistence must be explicitly controlled
- users must not be allowed to assume that SpeedNum is a CRA-authorized storage system merely because it is self-hosted

## 33.6 Data residency

The application team must explicitly document:

- physical location of the Hostinger VPS
- LiveKit server location
- TURN server location
- PostgreSQL location
- MinIO location
- backups location
- log-storage location
- monitoring/observability location

Do not make a product claim such as "Canadian data residency" unless all relevant production data paths actually satisfy that claim.

If a customer has a contractual requirement that sensitive data remain in Canada, verify the physical/data-processing locations before onboarding that customer.

## 33.7 Screen-sharing warning

Before the browser begins screen sharing, show a warning such as:

> You're about to share your screen. Make sure confidential or sensitive information that should not be visible to other participants is hidden.

Do not automatically start screen sharing.

The user must explicitly select and approve the browser's screen/window/tab sharing prompt.

## 33.8 Participant authorization

Participant invitations are security-sensitive.

Before every invitation:

1. authenticate the caller
2. load the call
3. verify the caller belongs to the call
4. verify tenant relationship
5. run `can_invite_to_call(caller, target, call)`
6. create invitation
7. notify target
8. only issue LiveKit credentials after acceptance/authorization

Never trust a frontend-provided target profile ID.

Never allow arbitrary cross-tenant invitations.

## 33.9 Auditability

Persist security-relevant call events such as:

- call created
- call accepted
- call declined
- participant invited
- participant joined
- participant removed
- participant left
- call ended

Do not record the media contents as part of the audit trail.

Where administrative access to sensitive call metadata exists, ensure the access is authenticated and appropriately logged.

## 33.10 Encryption

Use:

- HTTPS
- WSS
- WebRTC DTLS-SRTP
- short-lived LiveKit tokens
- server-side authorization
- E2EE where implemented and tested

Do not describe the system as "end-to-end encrypted" until the actual LiveKit E2EE implementation has been configured, key management has been implemented, and the client behavior has been tested.

Document the E2EE threat model.

## 33.11 Security UX

Add visible indicators where useful:

- encrypted/secure call indicator
- microphone status
- camera status
- screen-sharing status
- participant list
- connection status

Users should always be able to see when:

- their microphone is muted
- their camera is disabled
- they are sharing their screen

## 33.12 Future recording requirement

If recording is requested later, stop and design a separate feature before implementation.

The future recording design must define:

- who can record
- who can see recordings
- recording consent
- participant notification
- storage location
- encryption at rest
- retention period
- deletion
- download permissions
- audit trail
- legal/privacy review

Do not add a hidden recording mechanism to the v1 LiveKit implementation.

---

# 34. Canada Compliance Pre-Production Checklist

Before Canadian production deployment, verify:

- [ ] Privacy policy covers calling
- [ ] Call metadata collection is documented
- [ ] Chat collection/retention is documented
- [ ] No v1 recording exists
- [ ] No automatic screenshots exist
- [ ] No automatic screen capture exists
- [ ] Data locations are documented
- [ ] Backups and logs are included in data-location review
- [ ] Tenant isolation has been penetration-tested
- [ ] Cross-tenant invitation attempts are rejected
- [ ] LiveKit tokens are short-lived
- [ ] LiveKit API secrets never reach browsers
- [ ] TURN credentials are not long-lived application secrets
- [ ] E2EE has been tested if enabled
- [ ] TLS/WSS is enforced
- [ ] Database access is private
- [ ] MinIO remains private
- [ ] Call/chat retention is configurable
- [ ] Expired chat data is deleted
- [ ] Security events are auditable
- [ ] Screen-sharing warning is present
- [ ] Rate limiting is enabled
- [ ] Security incident/breach response process exists
- [ ] Canadian privacy counsel has reviewed the production/privacy posture where required
- [ ] Any customer-specific CRA contractual/security requirements have been separately reviewed

---

# 35. Revised Product-Security Principle

For Canadian deployment, the primary principle is:

**Collect as little call data as possible, keep live media transient, protect every participant through server-side authorization, and never sacrifice call security merely to improve convenience.**

The product should provide high-quality real-time communication without turning every call into a permanent database record.


## Important implementation principle

Do not make "1080p at all costs" the objective.

The objective is:

**the highest quality that the user's current network can sustain while keeping the call connected, audio clear, and latency low.**

The implementation should favor graceful degradation over disconnection.
