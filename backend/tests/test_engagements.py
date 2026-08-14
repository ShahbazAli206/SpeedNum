"""Unit tests for the pure-logic pieces of the engagement-letters router.

No DB-backed test harness exists yet for any router in this repo (see
test_portal_invite.py / test_deadlines.py) — consistent with that, this only
exercises functions with no database or network dependency.
"""

from __future__ import annotations

from app.routers.engagements import _share_url


def test_share_url_points_at_the_public_engagement_route():
    url = _share_url("abc123")
    assert url.endswith("/engagement/abc123")
    # Must not regress to the old, unrelated /portal-login client-portal route.
    assert "/portal/" not in url


def test_share_url_strips_a_trailing_slash_on_the_base():
    from app.config import settings

    original = settings.public_app_url
    try:
        settings.public_app_url = "https://app.example.com/"
        assert _share_url("tok") == "https://app.example.com/engagement/tok"
    finally:
        settings.public_app_url = original
