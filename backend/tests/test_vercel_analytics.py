"""Vercel Web Analytics service — config gating and safe degradation.

No network: the only thing worth unit-testing here is that the config status
reflects the env vars and that fetch_traffic refuses to call out when it isn't
configured (returning None so the Reach page shows its setup card).
"""

from __future__ import annotations

import asyncio

from app.services import vercel_analytics


def _run(coro):
    return asyncio.run(coro)


class TestConfigStatus:
    def test_nothing_set_is_not_configured(self, monkeypatch):
        monkeypatch.setattr(vercel_analytics.settings, "vercel_api_token", "")
        monkeypatch.setattr(vercel_analytics.settings, "vercel_project_id", "")
        monkeypatch.setattr(vercel_analytics.settings, "vercel_team_id", "")
        status = vercel_analytics.config_status()
        assert status == {
            "api_token_set": False,
            "project_id_set": False,
            "team_id_set": False,
            "web_analytics_configured": False,
        }

    def test_token_and_project_are_enough(self, monkeypatch):
        monkeypatch.setattr(vercel_analytics.settings, "vercel_api_token", "tok")
        monkeypatch.setattr(vercel_analytics.settings, "vercel_project_id", "prj_1")
        monkeypatch.setattr(vercel_analytics.settings, "vercel_team_id", "")
        status = vercel_analytics.config_status()
        assert status["web_analytics_configured"] is True
        assert status["team_id_set"] is False

    def test_team_id_is_not_required_for_configured(self, monkeypatch):
        """A personal-account project has no team id, and must still count as
        configured — team_id only gets reported, never gates."""
        monkeypatch.setattr(vercel_analytics.settings, "vercel_api_token", "tok")
        monkeypatch.setattr(vercel_analytics.settings, "vercel_project_id", "prj_1")
        monkeypatch.setattr(vercel_analytics.settings, "vercel_team_id", "team_1")
        status = vercel_analytics.config_status()
        assert status["web_analytics_configured"] is True
        assert status["team_id_set"] is True


class TestFetchTrafficGating:
    def test_returns_none_when_unconfigured(self, monkeypatch):
        """Must not attempt a network call — returning None is what makes the
        Reach page fall back to the setup card."""
        monkeypatch.setattr(vercel_analytics.settings, "vercel_api_token", "")
        monkeypatch.setattr(vercel_analytics.settings, "vercel_project_id", "")

        async def _boom(*_args, **_kwargs):  # pragma: no cover - must never run
            raise AssertionError("fetch_traffic tried to call out while unconfigured")

        monkeypatch.setattr(vercel_analytics.httpx, "AsyncClient", _boom)
        assert _run(vercel_analytics.fetch_traffic()) is None
