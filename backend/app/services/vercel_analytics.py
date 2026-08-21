"""Vercel Web Analytics — read-only site traffic for the superadmin Reach page.

Reads the public Web Analytics query API
(https://api.vercel.com/v1/query/web-analytics/visits/count) with a server-only
access token. The token can read all of the team's analytics, so it lives in an
env var and never leaves this backend — the frontend only ever sees the numbers.
Any failure (missing config, bad token, API change, network) degrades to None,
and the Reach page then shows a "connect Vercel" setup card instead of numbers.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from ..config import settings

log = logging.getLogger(__name__)

_VISITS_COUNT_URL = "https://api.vercel.com/v1/query/web-analytics/visits/count"
_TIMEOUT_SECONDS = 8.0


def config_status() -> dict[str, bool]:
    """Which server-only Vercel variables are present — drives the setup card."""
    token = bool(settings.vercel_api_token)
    project = bool(settings.vercel_project_id)
    return {
        "api_token_set": token,
        "project_id_set": project,
        "team_id_set": bool(settings.vercel_team_id),
        # team_id is optional (only team-owned projects need it), so it isn't
        # part of "configured".
        "web_analytics_configured": token and project,
    }


async def fetch_traffic(days: int = 28) -> dict[str, Any] | None:
    """Total visitors and pageviews over the last `days`, or None if analytics
    isn't configured or the query fails for any reason."""
    if not (settings.vercel_api_token and settings.vercel_project_id):
        return None

    until = datetime.now(timezone.utc).date()
    since = until - timedelta(days=days)
    params: dict[str, str] = {
        "projectId": settings.vercel_project_id,
        "since": since.isoformat(),
        "until": until.isoformat(),
    }
    if settings.vercel_team_id:
        params["teamId"] = settings.vercel_team_id

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            response = await client.get(
                _VISITS_COUNT_URL,
                params=params,
                headers={"Authorization": f"Bearer {settings.vercel_api_token}"},
            )
    except httpx.HTTPError as exc:
        log.warning("Vercel Web Analytics request failed: %s", exc)
        return None

    if response.status_code != 200:
        log.warning(
            "Vercel Web Analytics returned %s: %s", response.status_code, response.text[:200]
        )
        return None

    try:
        data = response.json().get("data") or {}
        return {
            "visitors": int(data.get("visitors") or 0),
            "pageviews": int(data.get("pageviews") or 0),
            "period_days": days,
        }
    except (ValueError, TypeError) as exc:
        log.warning("Vercel Web Analytics response was not the expected shape: %s", exc)
        return None
