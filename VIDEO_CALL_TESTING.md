# Video Calling — Test & Performance Plan

Maps `spidnums_VIDEO_CALL_IMPLEMENTATION_SPEC.md` §30 to what's automated versus what needs a
live environment (a running LiveKit + coturn, real browsers, real networks, the real VPS).
Companion to `VIDEO_CALL_PROGRESS.md`.

## What is automated (runs today, no live services)

**Authorization matrix (§30 "Authorization") — `backend/tests/test_calls_authorization.py`.**
17 tests exercising `can_call` / `can_invite_to_call` directly — the security boundary — with a
database-free fake session (the suite's convention). Covers every allow case (client→assigned
staff / owner, owner→staff / client / platform, platform→owner) and every rejection
(cross-tenant, non-assigned staff, staff↔staff, platform→non-owner, platform→client,
client↔client, self, inactive, and an unauthorized mid-call invite).

Run:

```bash
cd backend
python -m pytest tests/test_calls_authorization.py -q      # 17 tests
python -m pytest -q                                        # full suite (465), no regressions
```

Everything else in §30 needs live media/network/hardware and is a manual runbook below — it
cannot be meaningfully faked.

## Functional checklist (§30 "Functional") — manual, needs a deployed stack

Do these with two or more real browser sessions once LiveKit + coturn are deployed (see
`DEPLOYMENT.md`'s "Video calling" section) and the frontend is pointed at them.

- [ ] 1:1 video call connects both ways
- [ ] 1:1 audio-only call (start with camera off)
- [ ] Accept / decline / missed (let it ring past `CALL_RINGING_TIMEOUT_SECONDS`) / hang up
- [ ] Mic mute-unmute; camera on-off — both reflected on the other side and in the participant list
- [ ] Device selection: switch mic / camera / speaker mid-call
- [ ] Screen share: entire screen, a window, a browser tab; confirm-before-share warning shows first
- [ ] Quality selector: Auto / 360 / 720 / 1080 — verify a lower pick visibly caps the sent layer
- [ ] Chat: send both ways, appears instantly (data channel), survives a reload (persistence)
- [ ] Add participant mid-call → invitee rings, accepts, joins the existing room
- [ ] Remove participant (as initiator/moderator)
- [ ] Group call: 3+ participants, grid layout, active-speaker highlight

## Network conditions (§30 "Network") — manual, needs traffic shaping

Use the browser devtools throttling, a real mobile hotspot, and a firewall that blocks UDP.

- [ ] Good Wi-Fi — baseline
- [ ] Poor Wi-Fi (throttle) — video degrades before audio; connection indicator drops to Poor
- [ ] Mobile hotspot; high latency; injected packet loss
- [ ] VPN
- [ ] **UDP fully blocked** — call still connects via TURN/TCP then TURN/TLS (this is the whole
      reason coturn on 3478/tcp + 5349/tls exists; the single most important network test)
- [ ] Wi-Fi → cellular handoff mid-call → LiveKit reconnects (indicator shows "Reconnecting…")
- [ ] Kill Wi-Fi briefly, restore → call recovers rather than ending
- [ ] Hysteresis: quality shouldn't oscillate 720↔360 rapidly under borderline bandwidth

Note the honest gaps recorded in `VIDEO_CALL_PROGRESS.md`: the poor-network *policy* is
LiveKit's adaptiveStream/dynacast/simulcast (configured in `lib/livekit/room.ts`) plus the
low-data toggle — verify it behaves as the spec's §6 priority order intends (keep connected →
protect audio → drop video quality), and tune if it doesn't.

## Performance benchmarking (§30 "Performance") — manual, on the real KVM 4

**No concurrent-call capacity is promised — it must be measured on the actual Hostinger KVM 4**
(spec §9, §30). Do NOT publish a capacity number until measured.

Ramp participants and record CPU / RAM / bandwidth (ingress+egress) / packet loss / reconnects /
active rooms / active participants at each step:

- [ ] 2 participants
- [ ] 4 participants
- [ ] 6 participants
- [ ] 8 participants
- [ ] 10 participants

While running:

```bash
docker stats speednum-livekit speednum-coturn    # live CPU/RAM/network
docker logs -f speednum-livekit                   # room/participant lifecycle, reconnects
```

Record where quality/stability first degrades — that, not a theoretical number, is the capacity
of this box. If it's short of the target, the architecture already anticipates moving LiveKit to
its own VPS without an app redesign (spec §9, and the `network_mode: host` split in
`deploy/docker-compose.yml` keeps that clean).

## E2EE testing (§26, §33.10)

Deferred and gated — see `VIDEO_CALL_E2EE.md`. E2EE is off and unclaimed; before it may be
turned on, a key-distribution model must be chosen and the "encrypted media only decodes with
the key" behaviour tested with ≥3 participants.

## Definition-of-done reporting (spec §32)

When the manual runbook has been executed on the real stack, fill in the spec §32 report items
(files changed, migrations, Docker/env/DNS/firewall changes, endpoints, security implementation,
test results, performance results, known limitations, rollback). The static half of that report
already lives in `VIDEO_CALL_PROGRESS.md`; the test/performance results are what the runbook
above produces.
