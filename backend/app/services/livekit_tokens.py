"""Mint short-lived LiveKit room-access tokens (implementation spec §18-19).

The one place the LiveKit API secret is ever used. The secret signs a JWT
here, server-side; it is NEVER returned to a client and NEVER logged — the
token endpoint hands the browser only the resulting signed token, the public
WebSocket URL and the room name (routers/calls.py).

Identity and room names are opaque (spec §19): `profile_<uuid>` / `call_<uuid>`,
never an email/real name/tenant name. The room name is already stored on
call_sessions.room_name (set by routers/calls.py::create_call); the identity
is derived here from the authenticated profile id and is what LiveKit reports
as the participant identity, so the frontend can map a LiveKit participant
back to a SpidNums profile without any PII crossing the wire.
"""

from __future__ import annotations

import datetime
import uuid

from ..config import settings


class LiveKitNotConfigured(RuntimeError):
    """Raised when a token is requested but LIVEKIT_* env vars are unset — the
    router turns this into an HTTP 424 (same 'a dependency isn't configured'
    shape storage.py uses when MinIO/Supabase Storage is missing), rather than
    a 500, so the operator sees a clear cause."""


def participant_identity(profile_id: uuid.UUID) -> str:
    """Opaque LiveKit identity for a profile (spec §19). Stable per profile so
    the same person reconnecting keeps one identity in the room."""
    return f"profile_{profile_id}"


def profile_id_from_identity(identity: str) -> uuid.UUID | None:
    """Inverse of participant_identity — used by any future LiveKit webhook
    handler to map a room event back to a profile. Returns None for anything
    not in the expected shape rather than raising."""
    if not identity.startswith("profile_"):
        return None
    try:
        return uuid.UUID(identity[len("profile_") :])
    except ValueError:
        return None


def create_call_token(
    *,
    profile_id: uuid.UUID,
    display_name: str,
    room_name: str,
    can_publish: bool = True,
) -> str:
    """Sign a room-join token for `profile_id` in `room_name`.

    `can_publish` is threaded through for a future audio-only/viewer mode
    (spec §6's audio-only fallback can be expressed as can_publish for audio
    tracks only, refined in Phase 8) — defaults True for an ordinary
    participant. `can_publish_data` is always on: LiveKit's realtime data
    channel is how in-call chat is delivered (spec §16).

    Import is function-local so the rest of the app (and its test suite) does
    not hard-depend on livekit-api being installed unless a token is actually
    minted — mirrors how storage_s3.py defers its boto3 import.
    """
    if not settings.livekit_is_configured:
        raise LiveKitNotConfigured(
            "LiveKit is not configured (LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET)."
        )

    from livekit import api  # noqa: PLC0415 - deferred on purpose, see docstring

    grants = api.VideoGrants(
        room_join=True,
        room=room_name,
        can_publish=can_publish,
        can_subscribe=True,
        can_publish_data=True,
        # Let a participant update their own metadata (mute state, etc.) but
        # never room_admin/room_create — a client token must never be able to
        # administer the room or mint further access.
        can_update_own_metadata=True,
    )
    return (
        api.AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
        .with_identity(participant_identity(profile_id))
        .with_name(display_name)
        .with_ttl(datetime.timedelta(seconds=settings.livekit_token_ttl_seconds))
        .with_grants(grants)
        .to_jwt()
    )
