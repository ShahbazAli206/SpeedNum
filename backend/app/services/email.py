"""Transactional email.

Uses Resend when RESEND_API_KEY is present; otherwise the message is logged so
local development and the free Hugging Face tier work without a mail provider.
"""

from __future__ import annotations

import logging

import httpx

from ..config import settings

log = logging.getLogger(__name__)

RESEND_ENDPOINT = "https://api.resend.com/emails"


async def send_email(*, to: str, subject: str, html: str, reply_to: str | None = None) -> bool:
    if not settings.resend_api_key:
        log.info("[email:dry-run] to=%s subject=%s", to, subject)
        return False

    payload = {
        "from": settings.email_from,
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if reply_to:
        payload["reply_to"] = reply_to

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                RESEND_ENDPOINT,
                json=payload,
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            )
        if response.status_code >= 400:
            log.warning("Email provider rejected message: %s %s", response.status_code, response.text)
            return False
        return True
    except httpx.HTTPError as exc:
        log.warning("Email delivery failed: %s", exc)
        return False


def letter_invite_html(
    *,
    firm_name: str,
    client_name: str,
    letter_title: str,
    total: float,
    currency: str,
    url: str,
    brand_color: str = "#1d4ed8",
    message: str | None = None,
) -> str:
    intro = message or (
        f"{firm_name} has prepared your {letter_title.lower()} for review. "
        "You can read the scope of work and sign online — no account needed."
    )
    return f"""
<div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
            background:#f8fafc;padding:32px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;
              border:1px solid #e2e8f0;overflow:hidden">
    <div style="background:{brand_color};padding:20px 28px;color:#fff;font-weight:600;font-size:18px">
      {firm_name}
    </div>
    <div style="padding:28px;color:#0f172a;line-height:1.6">
      <p style="margin:0 0 12px">Hello {client_name},</p>
      <p style="margin:0 0 20px">{intro}</p>
      <p style="margin:0 0 24px;font-size:15px">
        <strong>{letter_title}</strong><br />
        Total: {currency} {total:,.2f}
      </p>
      <a href="{url}"
         style="display:inline-block;background:{brand_color};color:#fff;text-decoration:none;
                padding:12px 22px;border-radius:8px;font-weight:600">Review &amp; sign</a>
      <p style="margin:24px 0 0;font-size:13px;color:#64748b">
        If the button does not work, paste this link into your browser:<br />{url}
      </p>
    </div>
  </div>
</div>
"""


def invite_html(*, firm_name: str, url: str, brand_color: str = "#1d4ed8") -> str:
    return f"""
<div style="font-family:ui-sans-serif,system-ui,sans-serif;background:#f8fafc;padding:32px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;
              border:1px solid #e2e8f0;padding:28px;color:#0f172a;line-height:1.6">
    <h2 style="margin:0 0 12px;font-size:20px">You have been invited to {firm_name}</h2>
    <p style="margin:0 0 20px">Create your account to start picking up client work.</p>
    <a href="{url}" style="display:inline-block;background:{brand_color};color:#fff;
       text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">Accept invitation</a>
  </div>
</div>
"""
