"""Video calling: call lifecycle, participants and mid-call invitations.

Reachable by three account kinds — firm staff, a client-portal login, and
the platform superadmin (CallableUserDep, deps.py) — because the calling
matrix (spidnums_VIDEO_CALL_IMPLEMENTATION_SPEC.md §10) spans all three:
client<->assigned-staff-or-Owner, Owner<->staff/client, and Owner<->platform.

Every authorization decision is centralized in app/permissions.py's
can_call/can_invite_to_call — this router never re-derives the matrix
itself, only enforces "does this row belong to the caller" scoping and
calls those two functions before creating/joining/inviting.

LiveKit itself (not this file) owns WebRTC signaling, media and realtime
in-room data — see deploy/docker-compose.yml's `livekit` service and
VIDEO_CALL_PROGRESS.md. This router is call bookkeeping only: who's allowed
in a call, its lifecycle, and the audit trail. Token generation (minting the
short-lived LiveKit credential a client actually connects with) is a
separate endpoint added in Phase 4, not here.
"""

from __future__ import annotations

import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, update

from ..config import settings
from ..deps import CallableUserDep, SessionDep
from ..models import CallEvent, CallInvitation, CallParticipant, CallSession, Profile
from ..permissions import can_call, can_invite_to_call
from ..schemas import (
    CallCreate,
    CallInvitationRead,
    CallInviteCreate,
    CallParticipantRead,
    CallSessionRead,
    CallTokenRead,
    Ok,
)
from ..services import audit, livekit_tokens
from ..services.rate_limit import rate_limit_by_tenant
from ..utils import ensure_found, now_utc, read

router = APIRouter(prefix="/calls", tags=["calls"])

# Terminal call_sessions.status values — once here, an endpoint should never
# silently keep mutating the row (used by end_call to avoid re-"ending" an
# already-cancelled/declined/missed call).
_TERMINAL_CALL_STATUSES = ("ended", "cancelled", "declined", "missed", "failed")
_OPEN_PARTICIPANT_STATUSES = ("invited", "ringing", "joined")

_call_create_rate_limit = rate_limit_by_tenant("calls-create", limit=30, window_seconds=3600)
_call_invite_rate_limit = rate_limit_by_tenant("calls-invite", limit=60, window_seconds=3600)
# Token requests are hit on every (re)connect and reconnect attempt, so this
# window is much looser than create/invite — but still bounded per the spec's
# "rate-limit token requests" requirement (§27).
_call_token_rate_limit = rate_limit_by_tenant("calls-token", limit=120, window_seconds=3600)

# call_sessions.status values from which a participant may still (re)join and
# therefore fetch a token. A ringing call is joinable (that's how the caller
# and an accepting callee both get in); a terminal one never is.
_JOINABLE_CALL_STATUSES = ("ringing", "accepted")


def _room_name(call_id: uuid.UUID) -> str:
    """Opaque room identifier (spec §19) — no email/name/tenant name, ever."""
    return f"call_{call_id}"


def _resolve_call_tenant_id(caller: Profile, invitees: list[Profile]) -> uuid.UUID | None:
    """The single company tenant a call is scoped to (mirrors
    support_threads.tenant_id — always the *company* side, never the
    platform's own). The caller's own tenant, unless the caller is the
    platform superadmin, in which case it's the (one) non-platform
    invitee's tenant. can_call() has already confirmed every invitee here
    is either all in the caller's own tenant, or — the superadmin-caller
    case — a company Owner, so this never has to reconcile conflicting
    tenants for a call that was actually allowed to be created."""
    if not caller.is_superadmin:
        return caller.tenant_id
    for target in invitees:
        if not target.is_superadmin:
            return target.tenant_id
    return None


async def _read_call(session: SessionDep, call_id: uuid.UUID) -> CallSessionRead:
    call = await session.get(CallSession, call_id)
    ensure_found(call, "Call")
    rows = (
        await session.execute(
            select(CallParticipant, Profile.full_name, Profile.email)
            .join(Profile, Profile.id == CallParticipant.profile_id)
            .where(CallParticipant.call_session_id == call_id)
            .order_by(CallParticipant.invited_at)
        )
    ).all()
    participants = [
        read(CallParticipantRead, participant, full_name=name, email=email)
        for participant, name, email in rows
    ]
    return read(CallSessionRead, call, participants=participants)


async def _expire_stale_ringing(session: SessionDep, user) -> None:
    """Lazy missed-call expiry: there is no background sweep for this yet
    (unlike services/scheduler.py's reminder sweep) — a still-"ringing" call
    past CALL_RINGING_TIMEOUT_SECONDS flips to "missed" the next time this
    caller touches a call-reading endpoint. Known v1 limitation: a call
    nobody ever looks at again stays "ringing" in the database forever —
    acceptable for now, see VIDEO_CALL_PROGRESS.md if that turns out to
    matter enough to add a proper scheduler sweep."""
    cutoff = now_utc() - timedelta(seconds=settings.call_ringing_timeout_seconds)
    stale = (
        await session.scalars(
            select(CallSession)
            .join(CallParticipant, CallParticipant.call_session_id == CallSession.id)
            .where(
                CallParticipant.profile_id == user.profile.id,
                CallSession.status == "ringing",
                CallSession.started_at < cutoff,
            )
        )
    ).all()
    for call in stale:
        call.status = "missed"
        call.ended_at = now_utc()
        session.add(CallEvent(call_session_id=call.id, event_type="call_missed"))
    if stale:
        await session.flush()


async def _ensure_participant(session: SessionDep, call_id: uuid.UUID, user) -> CallSession:
    call = await session.get(CallSession, call_id)
    ensure_found(call, "Call")
    is_participant = await session.scalar(
        select(CallParticipant.id).where(
            CallParticipant.call_session_id == call_id,
            CallParticipant.profile_id == user.profile.id,
        )
    )
    if is_participant is None:
        # 404, not 403 — same "don't confirm a call exists to a non-
        # participant" reasoning as client_messages.py's attachment lookups.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Call not found")
    return call


async def _get_my_participant(session: SessionDep, call_id: uuid.UUID, profile_id: uuid.UUID) -> CallParticipant:
    participant = await session.scalar(
        select(CallParticipant).where(
            CallParticipant.call_session_id == call_id, CallParticipant.profile_id == profile_id
        )
    )
    return ensure_found(participant, "Participant")


@router.post("", response_model=CallSessionRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(_call_create_rate_limit)])
async def create_call(payload: CallCreate, session: SessionDep, user: CallableUserDep) -> CallSessionRead:
    """Start a call. Every invitee is checked against can_call individually
    — a caller can never widen who they're allowed to reach by bundling a
    disallowed target into a group invite list."""
    invitee_ids = {pid for pid in payload.invitee_profile_ids if pid != user.profile.id}
    if not invitee_ids:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "A call needs at least one other participant.")

    invitees = (await session.scalars(select(Profile).where(Profile.id.in_(invitee_ids)))).all()
    if len(invitees) != len(invitee_ids):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "One or more invitees could not be found.")

    for target in invitees:
        if not await can_call(session, user, target):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"You are not allowed to call {target.full_name or target.email}.",
            )

    # Real tenant-isolation guard: a call's non-platform participants must
    # all belong to the same company. (Whether a company Owner should be
    # allowed to pull the platform superadmin into the same room as their
    # own staff is a separate, not-yet-decided product question for group
    # calls — Phase 10 — and is deliberately not blocked here; this check
    # only prevents genuinely cross-tenant calls, e.g. staff from two
    # different companies in one room, which would be a real violation.)
    non_platform_tenants = {t.tenant_id for t in invitees if not t.is_superadmin}
    if not user.profile.is_superadmin:
        non_platform_tenants.add(user.profile.tenant_id)
    if len(non_platform_tenants) > 1:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "A call can only span one company's participants.")

    tenant_id = _resolve_call_tenant_id(user.profile, invitees)

    call = CallSession(
        tenant_id=tenant_id,
        room_name="pending",
        initiator_profile_id=user.profile.id,
        call_type=payload.call_type,
        status="ringing",
    )
    session.add(call)
    await session.flush()  # need call.id for the room name and every child row below
    call.room_name = _room_name(call.id)

    # The initiator's own row starts "invited" like everyone else's — it
    # flips to "joined" the same way any participant's does, at token-fetch
    # time (Phase 4). No special-casing here keeps the state machine to one
    # rule for every participant.
    session.add(CallParticipant(call_session_id=call.id, profile_id=user.profile.id, role="initiator", status="invited"))
    session.add(CallEvent(call_session_id=call.id, actor_profile_id=user.profile.id, event_type="call_created"))

    caller_name = user.profile.full_name or user.profile.email
    for target in invitees:
        session.add(CallParticipant(call_session_id=call.id, profile_id=target.id, role="participant", status="ringing"))
        session.add(
            CallInvitation(
                call_session_id=call.id,
                inviter_profile_id=user.profile.id,
                invitee_profile_id=target.id,
                status="pending",
            )
        )
        session.add(
            CallEvent(
                call_session_id=call.id,
                actor_profile_id=user.profile.id,
                event_type="call_ringing",
                event_metadata={"invitee_profile_id": str(target.id)},
            )
        )
        if tenant_id is not None:
            await audit.notify(
                session,
                tenant_id=tenant_id,
                profile_id=target.id,
                type="incoming_call",
                title=f"Incoming {payload.call_type} call from {caller_name}",
                link=f"/calls/{call.id}",
            )

    await session.flush()
    return await _read_call(session, call.id)


@router.get("", response_model=list[CallSessionRead])
async def list_calls(
    session: SessionDep,
    user: CallableUserDep,
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[CallSessionRead]:
    """Calls the caller is/was a participant in — never anyone else's, even
    within the same tenant (mirrors client_messages.py's "only your own
    thread" scoping)."""
    await _expire_stale_ringing(session, user)

    stmt = (
        select(CallSession)
        .join(CallParticipant, CallParticipant.call_session_id == CallSession.id)
        .where(CallParticipant.profile_id == user.profile.id)
    )
    if status_filter:
        stmt = stmt.where(CallSession.status == status_filter)
    calls = (await session.scalars(stmt.order_by(CallSession.created_at.desc()).limit(limit))).all()
    return [await _read_call(session, call.id) for call in calls]


@router.get("/{call_id}", response_model=CallSessionRead)
async def get_call(call_id: uuid.UUID, session: SessionDep, user: CallableUserDep) -> CallSessionRead:
    await _expire_stale_ringing(session, user)
    await _ensure_participant(session, call_id, user)
    return await _read_call(session, call_id)


@router.post("/{call_id}/token", response_model=CallTokenRead, dependencies=[Depends(_call_token_rate_limit)])
async def create_call_token(call_id: uuid.UUID, session: SessionDep, user: CallableUserDep) -> CallTokenRead:
    """Mint the short-lived LiveKit token this caller connects to the room
    with (spec §18). This IS the definitive "join" transition (see
    VIDEO_CALL_PROGRESS.md Phase 3): fetching a token is what flips the
    caller's own participant row to `joined`, for the initiator and every
    invitee alike.

    Enforces spec §18's checklist server-side: authenticated (CallableUserDep),
    call exists and the caller belongs to it (_ensure_participant), the call
    is still joinable, the caller hasn't declined/been removed, and the LiveKit
    identity is derived from the authenticated profile here — never taken from
    the client. The API secret never leaves the server (services/livekit_tokens)."""
    await _expire_stale_ringing(session, user)
    call = await _ensure_participant(session, call_id, user)
    if call.status not in _JOINABLE_CALL_STATUSES:
        raise HTTPException(status.HTTP_409_CONFLICT, "This call is no longer joinable.")

    participant = await _get_my_participant(session, call_id, user.profile.id)
    if participant.status in ("declined", "removed"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You are no longer part of this call.")

    now = now_utc()
    if participant.status != "joined":
        participant.status = "joined"
        participant.joined_at = now
        session.add(
            CallEvent(call_session_id=call.id, actor_profile_id=user.profile.id, event_type="participant_joined")
        )
        # A non-initiator getting a token while the call is still ringing is
        # the same thing as accepting it — connect == answer. The initiator
        # joining their own outgoing call does NOT flip it to accepted (nobody
        # has picked up yet), so the ringing state the callee's UI keys on is
        # preserved.
        if call.status == "ringing" and participant.role != "initiator":
            call.status = "accepted"
            call.connected_at = now
            session.add(
                CallEvent(call_session_id=call.id, actor_profile_id=user.profile.id, event_type="call_accepted")
            )
        await session.execute(
            update(CallInvitation)
            .where(
                CallInvitation.call_session_id == call.id,
                CallInvitation.invitee_profile_id == user.profile.id,
                CallInvitation.status == "pending",
            )
            .values(status="accepted", responded_at=now)
        )
        await session.flush()

    try:
        token = livekit_tokens.create_call_token(
            profile_id=user.profile.id,
            display_name=user.profile.full_name or user.profile.email,
            room_name=call.room_name,
        )
    except livekit_tokens.LiveKitNotConfigured as exc:
        # 424, matching storage.py's "a required backing service isn't
        # configured" convention — not a 500, so the cause is unambiguous.
        raise HTTPException(status.HTTP_424_FAILED_DEPENDENCY, str(exc)) from exc

    return CallTokenRead(
        token=token,
        livekit_url=settings.livekit_url,
        room_name=call.room_name,
        identity=livekit_tokens.participant_identity(user.profile.id),
    )


@router.post("/{call_id}/accept", response_model=CallSessionRead)
async def accept_call(call_id: uuid.UUID, session: SessionDep, user: CallableUserDep) -> CallSessionRead:
    await _expire_stale_ringing(session, user)
    call = await _ensure_participant(session, call_id, user)
    participant = await _get_my_participant(session, call_id, user.profile.id)
    if participant.status not in ("invited", "ringing"):
        raise HTTPException(status.HTTP_409_CONFLICT, "This call can no longer be accepted.")
    if call.status not in ("ringing", "accepted"):
        raise HTTPException(status.HTTP_409_CONFLICT, "This call is no longer active.")

    now = now_utc()
    participant.status = "joined"
    participant.joined_at = now
    if call.status == "ringing":
        call.status = "accepted"
        call.connected_at = now
    session.add(CallEvent(call_session_id=call.id, actor_profile_id=user.profile.id, event_type="call_accepted"))
    await session.execute(
        update(CallInvitation)
        .where(
            CallInvitation.call_session_id == call.id,
            CallInvitation.invitee_profile_id == user.profile.id,
            CallInvitation.status == "pending",
        )
        .values(status="accepted", responded_at=now)
    )
    await session.flush()
    return await _read_call(session, call.id)


@router.post("/{call_id}/decline", response_model=CallSessionRead)
async def decline_call(call_id: uuid.UUID, session: SessionDep, user: CallableUserDep) -> CallSessionRead:
    await _expire_stale_ringing(session, user)
    call = await _ensure_participant(session, call_id, user)
    participant = await _get_my_participant(session, call_id, user.profile.id)
    if participant.status not in ("invited", "ringing"):
        raise HTTPException(status.HTTP_409_CONFLICT, "This call can no longer be declined.")

    now = now_utc()
    participant.status = "declined"
    session.add(CallEvent(call_session_id=call.id, actor_profile_id=user.profile.id, event_type="call_declined"))
    await session.execute(
        update(CallInvitation)
        .where(
            CallInvitation.call_session_id == call.id,
            CallInvitation.invitee_profile_id == user.profile.id,
            CallInvitation.status == "pending",
        )
        .values(status="declined", responded_at=now)
    )

    # If every non-initiator participant has now declined and nobody ever
    # joined, the call as a whole is declined — not just this one leg.
    if call.status == "ringing":
        remaining = await session.scalar(
            select(func.count(CallParticipant.id)).where(
                CallParticipant.call_session_id == call.id,
                CallParticipant.role != "initiator",
                CallParticipant.status.in_(_OPEN_PARTICIPANT_STATUSES),
            )
        )
        if remaining == 0:
            call.status = "declined"
            call.ended_at = now
    await session.flush()
    return await _read_call(session, call.id)


@router.post("/{call_id}/cancel", response_model=CallSessionRead)
async def cancel_call(call_id: uuid.UUID, session: SessionDep, user: CallableUserDep) -> CallSessionRead:
    """The initiator withdraws a call nobody has answered yet — distinct
    from `end`, which stops an already-connected call."""
    call = await _ensure_participant(session, call_id, user)
    if call.initiator_profile_id != user.profile.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the caller can cancel this call.")
    if call.status != "ringing":
        raise HTTPException(status.HTTP_409_CONFLICT, "This call can no longer be cancelled.")

    now = now_utc()
    call.status = "cancelled"
    call.ended_at = now
    session.add(
        CallEvent(
            call_session_id=call.id,
            actor_profile_id=user.profile.id,
            event_type="call_ended",
            event_metadata={"reason": "cancelled"},
        )
    )
    await session.flush()
    return await _read_call(session, call.id)


@router.post("/{call_id}/end", response_model=CallSessionRead)
async def end_call(call_id: uuid.UUID, session: SessionDep, user: CallableUserDep) -> CallSessionRead:
    """Leave the call (spec §22's "leave/end call" control). Ends it for
    everyone once nobody is left joined, or immediately if the caller is the
    initiator/a moderator hanging up on behalf of the whole call."""
    call = await _ensure_participant(session, call_id, user)
    participant = await _get_my_participant(session, call_id, user.profile.id)

    now = now_utc()
    if participant.status == "joined":
        participant.status = "left"
        participant.left_at = now
        session.add(CallEvent(call_session_id=call.id, actor_profile_id=user.profile.id, event_type="participant_left"))

    if call.status not in _TERMINAL_CALL_STATUSES:
        still_joined = await session.scalar(
            select(func.count(CallParticipant.id)).where(
                CallParticipant.call_session_id == call.id, CallParticipant.status == "joined"
            )
        )
        if still_joined == 0 or participant.role in ("initiator", "moderator"):
            call.status = "ended"
            call.ended_at = now
            if call.connected_at is not None:
                call.duration_seconds = int((now - call.connected_at).total_seconds())
            session.add(CallEvent(call_session_id=call.id, actor_profile_id=user.profile.id, event_type="call_ended"))
    await session.flush()
    return await _read_call(session, call.id)


@router.get("/{call_id}/participants", response_model=list[CallParticipantRead])
async def list_participants(call_id: uuid.UUID, session: SessionDep, user: CallableUserDep) -> list[CallParticipantRead]:
    await _ensure_participant(session, call_id, user)
    rows = (
        await session.execute(
            select(CallParticipant, Profile.full_name, Profile.email)
            .join(Profile, Profile.id == CallParticipant.profile_id)
            .where(CallParticipant.call_session_id == call_id)
            .order_by(CallParticipant.invited_at)
        )
    ).all()
    return [read(CallParticipantRead, participant, full_name=name, email=email) for participant, name, email in rows]


@router.post(
    "/{call_id}/participants/invite",
    response_model=CallInvitationRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_call_invite_rate_limit)],
)
async def invite_participant(
    call_id: uuid.UUID, payload: CallInviteCreate, session: SessionDep, user: CallableUserDep
) -> CallInvitationRead:
    """Add an authorized participant to an active call (spec §21, §33.8).
    Never trusts the frontend-supplied invitee_profile_id — can_invite_to_call
    re-verifies both that the caller is actually in this call and that the
    calling matrix allows them to reach this specific target."""
    call = await _ensure_participant(session, call_id, user)
    target = await session.get(Profile, payload.invitee_profile_id)
    ensure_found(target, "Profile")
    if not await can_invite_to_call(session, user, target, call):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You are not allowed to invite this person into this call.")

    existing = await session.scalar(
        select(CallParticipant).where(
            CallParticipant.call_session_id == call.id, CallParticipant.profile_id == target.id
        )
    )
    if existing is not None and existing.status in _OPEN_PARTICIPANT_STATUSES:
        raise HTTPException(status.HTTP_409_CONFLICT, "This person is already in the call.")

    now = now_utc()
    if existing is not None:
        existing.status = "ringing"
        existing.invited_at = now
        existing.left_at = None
    else:
        session.add(CallParticipant(call_session_id=call.id, profile_id=target.id, role="participant", status="ringing"))

    invitation = CallInvitation(
        call_session_id=call.id,
        inviter_profile_id=user.profile.id,
        invitee_profile_id=target.id,
        status="pending",
    )
    session.add(invitation)
    session.add(
        CallEvent(
            call_session_id=call.id,
            actor_profile_id=user.profile.id,
            event_type="participant_invited",
            event_metadata={"invitee_profile_id": str(target.id)},
        )
    )
    await session.flush()

    inviter_name = user.profile.full_name or user.profile.email
    if call.tenant_id is not None:
        await audit.notify(
            session,
            tenant_id=call.tenant_id,
            profile_id=target.id,
            type="incoming_call",
            title=f"{inviter_name} is inviting you to a call",
            link=f"/calls/{call.id}",
        )
    return read(CallInvitationRead, invitation)


@router.delete("/{call_id}/participants/{profile_id}", response_model=Ok)
async def remove_participant(call_id: uuid.UUID, profile_id: uuid.UUID, session: SessionDep, user: CallableUserDep) -> Ok:
    """Only the initiator or a moderator may remove someone else — use
    `end` to remove yourself."""
    call = await _ensure_participant(session, call_id, user)
    me = await _get_my_participant(session, call_id, user.profile.id)
    if me.role not in ("initiator", "moderator"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the call's initiator or a moderator can remove a participant.")
    if profile_id == user.profile.id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Use end to remove yourself from a call.")

    target_participant = await session.scalar(
        select(CallParticipant).where(
            CallParticipant.call_session_id == call.id, CallParticipant.profile_id == profile_id
        )
    )
    ensure_found(target_participant, "Participant")

    now = now_utc()
    target_participant.status = "removed"
    target_participant.left_at = now
    session.add(
        CallEvent(
            call_session_id=call.id,
            actor_profile_id=user.profile.id,
            event_type="participant_removed",
            event_metadata={"profile_id": str(profile_id)},
        )
    )
    await session.flush()
    return Ok(message="Removed from the call")
