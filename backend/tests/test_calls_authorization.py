"""The calling-permission matrix (spidnums_VIDEO_CALL_IMPLEMENTATION_SPEC.md
§10, §30) — the security boundary for the whole video-calling feature.

Exercises app.permissions.can_call / can_invite_to_call directly with a fake
AsyncSession, the same database-free convention the rest of this suite uses
(test_client_messages.py, test_permissions.py). can_call touches the DB only in
the client↔assigned-staff branch (one Client lookup); every other branch is
pure, so a tiny stub session is enough.

This is the §30 "Authorization" test list made executable:
  valid client → assigned staff / owner; owner → staff / client / platform;
  platform → owner; and the rejections — cross-tenant, non-assigned staff,
  staff↔staff, platform → non-owner, self, inactive, and an unauthorized
  mid-call invite.
"""

from __future__ import annotations

import asyncio
import uuid

from app.deps import CurrentUser
from app.models import Client, Profile
from app.permissions import can_call, can_invite_to_call
from app.security import TokenClaims


def _run(coro):
    return asyncio.run(coro)


# One shared tenant for the intra-tenant cases; a second for the cross-tenant
# rejection.
TENANT_A = uuid.uuid4()
TENANT_B = uuid.uuid4()


def _profile(
    *,
    role: str = "member",
    is_superadmin: bool = False,
    client_id: uuid.UUID | None = None,
    tenant_id: uuid.UUID | None = TENANT_A,
    is_active: bool = True,
) -> Profile:
    return Profile(
        id=uuid.uuid4(),
        email="p@example.com",
        full_name="P",
        role=role,
        is_superadmin=is_superadmin,
        client_id=client_id,
        tenant_id=tenant_id,
        is_active=is_active,
    )


def _caller(profile: Profile) -> CurrentUser:
    claims = TokenClaims(user_id=str(profile.id), email=profile.email, role=None, metadata={}, raw={})
    tenant = None
    return CurrentUser(profile=profile, tenant=tenant, claims=claims)


class _Session:
    """Stand-in AsyncSession. `get` answers the Client lookup can_call makes for
    the client↔staff branch; `scalar` answers can_invite_to_call's "is the
    caller already a joined participant" probe. Both return whatever the test
    seeds, defaulting to None."""

    def __init__(self, *, client: Client | None = None, joined_participant=None):
        self._client = client
        self._joined = joined_participant

    async def get(self, model, pk):  # noqa: ARG002 - signature mirrors AsyncSession.get
        return self._client

    async def scalar(self, _stmt):
        return self._joined


# --------------------------------------------------------------------------- #
# can_call — the allow cases                                                   #
# --------------------------------------------------------------------------- #
class TestCanCallAllowed:
    def test_client_to_assigned_staff(self):
        staff = _profile(role="member")
        client = _profile(client_id=uuid.uuid4())
        client_row = Client(id=client.client_id, tenant_id=TENANT_A, legal_name="C", owner_id=staff.id)
        assert _run(can_call(_Session(client=client_row), _caller(client), staff)) is True

    def test_client_to_owner(self):
        owner = _profile(role="owner")
        client = _profile(client_id=uuid.uuid4())
        # Owner branch never looks the client up — no Client row needed.
        assert _run(can_call(_Session(), _caller(client), owner)) is True

    def test_owner_to_staff(self):
        owner = _profile(role="owner")
        staff = _profile(role="member")
        assert _run(can_call(_Session(), _caller(owner), staff)) is True

    def test_owner_to_client(self):
        owner = _profile(role="owner")
        client = _profile(client_id=uuid.uuid4())
        # Owner-to-client: the staff side is an owner, so it short-circuits True
        # without a Client lookup.
        assert _run(can_call(_Session(), _caller(owner), client)) is True

    def test_owner_to_platform(self):
        owner = _profile(role="owner")
        platform = _profile(is_superadmin=True, tenant_id=None, role="member")
        assert _run(can_call(_Session(), _caller(owner), platform)) is True

    def test_platform_to_owner(self):
        platform = _profile(is_superadmin=True, tenant_id=None, role="member")
        owner = _profile(role="owner")
        assert _run(can_call(_Session(), _caller(platform), owner)) is True


# --------------------------------------------------------------------------- #
# can_call — the reject cases                                                  #
# --------------------------------------------------------------------------- #
class TestCanCallRejected:
    def test_cross_tenant_is_rejected(self):
        owner_a = _profile(role="owner", tenant_id=TENANT_A)
        staff_b = _profile(role="member", tenant_id=TENANT_B)
        assert _run(can_call(_Session(), _caller(owner_a), staff_b)) is False

    def test_client_to_non_assigned_staff_is_rejected(self):
        staff = _profile(role="member")
        client = _profile(client_id=uuid.uuid4())
        # Client row owned by SOMEONE ELSE, not this staff member.
        client_row = Client(id=client.client_id, tenant_id=TENANT_A, legal_name="C", owner_id=uuid.uuid4())
        assert _run(can_call(_Session(client=client_row), _caller(client), staff)) is False

    def test_staff_to_staff_is_rejected(self):
        a = _profile(role="member")
        b = _profile(role="member")
        assert _run(can_call(_Session(), _caller(a), b)) is False

    def test_platform_to_non_owner_staff_is_rejected(self):
        platform = _profile(is_superadmin=True, tenant_id=None, role="member")
        staff = _profile(role="member")
        assert _run(can_call(_Session(), _caller(platform), staff)) is False

    def test_platform_to_client_is_rejected(self):
        platform = _profile(is_superadmin=True, tenant_id=None, role="member")
        client = _profile(client_id=uuid.uuid4())
        assert _run(can_call(_Session(), _caller(platform), client)) is False

    def test_client_to_client_is_rejected(self):
        a = _profile(client_id=uuid.uuid4())
        b = _profile(client_id=uuid.uuid4())
        assert _run(can_call(_Session(), _caller(a), b)) is False

    def test_self_call_is_rejected(self):
        owner = _profile(role="owner")
        assert _run(can_call(_Session(), _caller(owner), owner)) is False

    def test_inactive_target_is_rejected(self):
        owner = _profile(role="owner")
        staff = _profile(role="member", is_active=False)
        assert _run(can_call(_Session(), _caller(owner), staff)) is False


# --------------------------------------------------------------------------- #
# can_invite_to_call — must be a joined participant AND pass can_call          #
# --------------------------------------------------------------------------- #
class TestCanInviteToCall:
    def test_non_participant_caller_cannot_invite(self):
        owner = _profile(role="owner")
        staff = _profile(role="member")
        call = _fake_call()
        # joined_participant None => caller isn't in the call => reject before
        # can_call is even consulted.
        assert _run(can_invite_to_call(_Session(joined_participant=None), _caller(owner), staff, call)) is False

    def test_participant_caller_inviting_allowed_target(self):
        owner = _profile(role="owner")
        staff = _profile(role="member")
        call = _fake_call()
        session = _Session(joined_participant=uuid.uuid4())  # caller is joined
        assert _run(can_invite_to_call(session, _caller(owner), staff, call)) is True

    def test_participant_caller_inviting_disallowed_target_is_rejected(self):
        # A plain staff caller (joined) still can't invite another plain staff
        # member — can_invite_to_call defers to can_call, which forbids it.
        a = _profile(role="member")
        b = _profile(role="member")
        call = _fake_call()
        session = _Session(joined_participant=uuid.uuid4())
        assert _run(can_invite_to_call(session, _caller(a), b, call)) is False


def _fake_call():
    from types import SimpleNamespace

    return SimpleNamespace(id=uuid.uuid4(), tenant_id=TENANT_A)
