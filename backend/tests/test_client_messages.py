"""Unit tests for the client-portal messaging helpers.

The product rule is strict: a client's message reaches only the people serving
that client — the company Owner(s) and the client's assigned staff (owner_id) —
and never any other colleague. `_staff_recipients` is where that set is built,
so these lock its shape (including the two dedupe/edge cases). The DB-bound
scoping of the endpoints themselves is exercised end-to-end on deploy; this is
the pure logic pulled out so it can be checked without a database, matching the
suite's convention (see test_deps.py, test_dashboard.py).
"""

from __future__ import annotations

import asyncio
import uuid
from types import SimpleNamespace

from app.routers.client_messages import _PREVIEW_LEN, _preview, _staff_recipients


class _Scalars:
    def __init__(self, items):
        self._items = items

    def all(self):
        return list(self._items)


class _Session:
    """Stand-in for AsyncSession — _staff_recipients only ever calls scalars()
    once (the company-Owner lookup), so returning the seeded owners is enough."""

    def __init__(self, owners):
        self._owners = owners

    async def scalars(self, _stmt):
        return _Scalars(self._owners)


def _run(coro):
    return asyncio.run(coro)


class TestPreview:
    def test_short_body_is_unchanged(self):
        assert _preview("Hello there") == "Hello there"

    def test_long_body_is_truncated_with_ellipsis(self):
        body = "x" * (_PREVIEW_LEN + 50)
        out = _preview(body)
        assert len(out) == _PREVIEW_LEN
        assert out.endswith("...")

    def test_empty_body_with_attachments_falls_back_to_attachment_count(self):
        assert _preview("", 1) == "📎 1 attachment"
        assert _preview("", 3) == "📎 3 attachments"

    def test_empty_body_and_no_attachments_is_blank(self):
        assert _preview("") == ""


class TestStaffRecipients:
    def test_owner_and_assigned_staff_both_notified(self):
        owner, staff = uuid.uuid4(), uuid.uuid4()
        client = SimpleNamespace(owner_id=staff)
        got = _run(_staff_recipients(_Session([owner]), uuid.uuid4(), client))
        assert got == {owner, staff}

    def test_assigned_staff_who_is_also_owner_is_not_duplicated(self):
        owner = uuid.uuid4()
        client = SimpleNamespace(owner_id=owner)
        got = _run(_staff_recipients(_Session([owner]), uuid.uuid4(), client))
        assert got == {owner}

    def test_unassigned_client_notifies_only_the_owners(self):
        owner = uuid.uuid4()
        client = SimpleNamespace(owner_id=None)
        got = _run(_staff_recipients(_Session([owner]), uuid.uuid4(), client))
        assert got == {owner}

    def test_other_staff_are_never_included(self):
        owner, assigned, bystander = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        client = SimpleNamespace(owner_id=assigned)
        got = _run(_staff_recipients(_Session([owner]), uuid.uuid4(), client))
        assert bystander not in got
        assert got == {owner, assigned}
