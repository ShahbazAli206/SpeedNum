"""Unit tests for the pure state-machine decisions in
app/services/engagement_signing.py — shared by the public token-based sign
flow (routers/portal.py) and the authenticated client-portal one
(routers/client_engagements.py). The DB-touching parts (apply_signature,
apply_decline, serialise_portal_letter) aren't covered here, same reasoning
as test_seats.py: the pure decision is where an off-by-one/wrong-state bug
would actually hide.
"""

from __future__ import annotations

from app.services.engagement_signing import VIEWABLE_STATUSES, can_decline, can_sign

ALL_STATUSES = ("draft", "sent", "viewed", "signed", "declined", "void")


class TestCanSign:
    def test_sent_is_signable(self):
        assert can_sign("sent") is True

    def test_viewed_is_signable(self):
        assert can_sign("viewed") is True

    def test_declined_is_signable_again(self):
        """A recipient who declined can change their mind and sign later."""
        assert can_sign("declined") is True

    def test_already_signed_is_not_signable(self):
        """Re-signing would silently overwrite an executed record."""
        assert can_sign("signed") is False

    def test_draft_is_not_signable(self):
        assert can_sign("draft") is False

    def test_void_is_not_signable(self):
        assert can_sign("void") is False


class TestCanDecline:
    def test_signed_cannot_be_declined(self):
        assert can_decline("signed") is False

    def test_every_other_status_can_be_declined(self):
        for status in ALL_STATUSES:
            if status == "signed":
                continue
            assert can_decline(status) is True


class TestViewableStatuses:
    def test_excludes_draft_and_void(self):
        assert "draft" not in VIEWABLE_STATUSES
        assert "void" not in VIEWABLE_STATUSES

    def test_includes_the_rest(self):
        assert set(VIEWABLE_STATUSES) == {"sent", "viewed", "signed", "declined"}
