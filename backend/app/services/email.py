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


def portal_welcome_html(
    *,
    firm_name: str,
    client_name: str,
    email: str,
    temp_password: str,
    login_url: str,
    magic_url: str | None = None,
    brand_color: str = "#1d4ed8",
) -> str:
    """The client-portal welcome email: login details plus a one-click sign-in
    link. `magic_url` is None when Supabase's admin API couldn't issue a magic
    link (e.g. not configured) — the button then falls back to the plain
    login page, and the temporary password becomes the only way in."""
    cta_url = magic_url or login_url
    cta_label = "Sign in to your dashboard"
    fallback_line = (
        f'Use <strong>{cta_label}</strong> above for instant one-click access, or sign in any time at'
        if magic_url
        else "Sign in any time at"
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
      <h2 style="margin:0 0 4px;font-size:19px">Welcome to {firm_name}, {client_name}</h2>
      <p style="margin:0 0 20px;color:#64748b;font-size:14px">Your secure client portal is ready to use.</p>
      <p style="margin:0 0 20px">
        Hi {client_name} team,<br />
        Your {firm_name} client portal is ready. Sign in to view your documents, track deadlines
        and follow your invoices — all in one secure place.
      </p>
      <div style="background:#f1f5f9;border-radius:10px;padding:16px 18px;margin:0 0 24px">
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.04em;color:#64748b;text-transform:uppercase">
          Your login details
        </p>
        <p style="margin:0 0 4px;font-size:14px"><strong>Email:</strong> {email}</p>
        <p style="margin:0;font-size:14px">
          <strong>Temporary password:</strong>
          <code style="background:#e2e8f0;padding:1px 6px;border-radius:4px">{temp_password}</code>
        </p>
      </div>
      <a href="{cta_url}"
         style="display:inline-block;background:{brand_color};color:#fff;text-decoration:none;
                padding:12px 22px;border-radius:8px;font-weight:600">{cta_label}</a>
      <p style="margin:20px 0 0;font-size:13px;color:#64748b">
        {fallback_line} <a href="{login_url}" style="color:{brand_color}">{login_url}</a> with the details above.
      </p>
      <p style="margin:12px 0 0;font-size:13px;color:#64748b">
        For your security, please change your password after your first sign-in. If you weren't
        expecting this email, you can safely ignore it.
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
