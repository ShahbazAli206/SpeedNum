"""Transactional email.

Uses Resend when RESEND_API_KEY is present; otherwise the message is logged so
local development and the free Hugging Face tier work without a mail provider.
"""

from __future__ import annotations

import logging
from datetime import date

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


def _friendly_date(iso: str) -> str:
    """2026-04-30 → 30 April 2026. Falls back to the raw value if unparseable,
    because a slightly ugly date in an email beats a crash while sending it."""
    try:
        return date.fromisoformat(iso).strftime("%d %B %Y").lstrip("0")
    except (ValueError, TypeError):
        return iso


def portal_welcome_html(
    *,
    firm_name: str,
    client_name: str,
    email: str,
    temp_password: str,
    login_url: str,
    magic_url: str | None = None,
    services: list[dict[str, object]] | None = None,
    deadlines: list[dict[str, object]] | None = None,
    contact_name: str | None = None,
    contact_email: str | None = None,
    brand_color: str = "#1d4ed8",
) -> str:
    """The client-portal welcome email: login details plus a one-click sign-in
    link. `magic_url` is None when Supabase's admin API couldn't issue a magic
    link (e.g. not configured) — the button then falls back to the plain
    login page, and the temporary password becomes the only way in.

    `services` and `deadlines` are read from the client's own record at send
    time (see accounts._client_engagement_summary), so the email answers "what
    do you do for me and what is coming up" rather than only handing over a
    password. Both sections are omitted entirely when empty — an empty
    "Your services" heading reads worse than no heading at all.
    """
    cta_url = magic_url or login_url
    cta_label = "Sign in to your dashboard"
    fallback_line = (
        f'Use <strong>{cta_label}</strong> above for instant one-click access, or sign in any time at'
        if magic_url
        else "Sign in any time at"
    )

    services_block = ""
    if services:
        rows = "".join(
            f"""
        <tr>
          <td style="padding:7px 0;border-bottom:1px solid #eef2f7">
            <span style="font-size:14px;color:#0f172a">{item.get('name', '')}</span>
          </td>
          <td align="right" style="padding:7px 0;border-bottom:1px solid #eef2f7">
            <span style="font-size:12.5px;color:#64748b;text-transform:capitalize">{item.get('frequency', '')}</span>
          </td>
        </tr>"""
            for item in services
        )
        services_block = f"""
      <h3 style="margin:26px 0 8px;font-size:14px;color:#0f172a">What we look after for you</h3>
      <table role="presentation" width="100%" style="border-collapse:collapse">{rows}</table>"""

    deadlines_block = ""
    if deadlines:
        rows = "".join(
            f"""
        <tr>
          <td style="padding:7px 0;border-bottom:1px solid #eef2f7">
            <span style="font-size:14px;color:#0f172a">{item.get('title', '')}</span>
          </td>
          <td align="right" style="padding:7px 0;border-bottom:1px solid #eef2f7">
            <span style="font-size:12.5px;font-weight:600;color:#475569">{_friendly_date(str(item.get('due_date', '')))}</span>
          </td>
        </tr>"""
            for item in deadlines
        )
        deadlines_block = f"""
      <h3 style="margin:26px 0 8px;font-size:14px;color:#0f172a">Coming up</h3>
      <table role="presentation" width="100%" style="border-collapse:collapse">{rows}</table>
      <p style="margin:8px 0 0;font-size:12.5px;color:#64748b">
        We will remind you before each of these — there is nothing for you to track.
      </p>"""

    contact_block = ""
    if contact_name or contact_email:
        who = contact_name or "your accountant"
        mail = (
            f' at <a href="mailto:{contact_email}" style="color:{brand_color}">{contact_email}</a>'
            if contact_email
            else ""
        )
        contact_block = f"""
      <p style="margin:22px 0 0;font-size:13.5px;color:#475569">
        Your point of contact is <strong style="color:#0f172a">{who}</strong>{mail}.
        Replying to this email reaches us too.
      </p>"""

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
{services_block}
{deadlines_block}
{contact_block}
      <p style="margin:22px 0 0;font-size:13px;color:#64748b">
        For your security, please change your password after your first sign-in. If you weren't
        expecting this email, you can safely ignore it.
      </p>
    </div>
  </div>
</div>
"""


def staff_welcome_html(
    *,
    firm_name: str,
    full_name: str,
    email: str,
    temp_password: str,
    login_url: str,
    role_label: str,
    magic_url: str | None = None,
    brand_color: str = "#1d4ed8",
) -> str:
    """Credentials email for a newly created accountant / staff login.

    Deliberately leaner than portal_welcome_html: a staff member needs their
    sign-in details and the "change this password" instruction, not the client's
    tour of documents, deadlines and invoices.
    """
    cta_url = magic_url or login_url
    return f"""
<div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
            background:#f8fafc;padding:32px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;
              border:1px solid #e2e8f0;overflow:hidden">
    <div style="background:{brand_color};padding:20px 28px;color:#fff;font-weight:600;font-size:18px">
      {firm_name}
    </div>
    <div style="padding:28px;color:#0f172a;line-height:1.6">
      <h2 style="margin:0 0 4px;font-size:19px">Welcome to the team, {full_name}</h2>
      <p style="margin:0 0 20px;color:#64748b;font-size:14px">
        Your {firm_name} practice account is ready — you have been added as <strong>{role_label}</strong>.
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
                padding:12px 22px;border-radius:8px;font-weight:600">Sign in to the practice app</a>
      <p style="margin:20px 0 0;font-size:13px;color:#64748b">
        Or go to <a href="{login_url}" style="color:{brand_color}">{login_url}</a> and sign in with the
        details above. You will be asked to set your own password on first sign-in.
      </p>
      <p style="margin:12px 0 0;font-size:13px;color:#64748b">
        If you were not expecting this email, please tell your firm administrator — do not share
        the password above.
      </p>
    </div>
  </div>
</div>
"""


def reminder_digest_html(
    *,
    firm_name: str,
    recipient_name: str,
    items: list[dict[str, object]],
    app_url: str,
    brand_color: str = "#1d4ed8",
) -> str:
    """The reminder email: one message covering every threshold that fired,
    rather than one message per deadline.

    `items` carries dicts with `title`, `body`, `due_date`, `severity` and
    `link` — the same fields the /reminders page renders, so the email and the
    page can never disagree about what is outstanding.
    """
    tone = {
        "critical": ("#fef2f2", "#dc2626"),
        "warning": ("#fffbeb", "#d97706"),
        "info": ("#eff6ff", "#2563eb"),
    }

    rows = []
    for item in items:
        background, accent = tone.get(str(item.get("severity", "info")), tone["info"])
        link = f"{app_url.rstrip('/')}{item.get('link') or '/reminders'}"
        rows.append(
            f"""
      <tr>
        <td style="padding:0 0 10px">
          <div style="background:{background};border-left:3px solid {accent};border-radius:8px;padding:12px 14px">
            <a href="{link}" style="color:#0f172a;text-decoration:none;font-weight:600;font-size:14px">
              {item.get('title', '')}
            </a>
            <div style="margin-top:3px;font-size:12.5px;color:#64748b">{item.get('body') or ''}</div>
          </div>
        </td>
      </tr>"""
        )

    count = len(items)
    return f"""
<div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
            background:#f8fafc;padding:32px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:14px;
              border:1px solid #e2e8f0;overflow:hidden">
    <div style="background:{brand_color};padding:20px 28px;color:#fff;font-weight:600;font-size:18px">
      {firm_name}
    </div>
    <div style="padding:28px;color:#0f172a;line-height:1.6">
      <h2 style="margin:0 0 4px;font-size:19px">
        {count} reminder{'' if count == 1 else 's'} need your attention
      </h2>
      <p style="margin:0 0 20px;color:#64748b;font-size:14px">
        Hello {recipient_name} — these client deadlines and tasks have just crossed a reminder
        threshold.
      </p>
      <table role="presentation" width="100%" style="border-collapse:collapse">{''.join(rows)}</table>
      <a href="{app_url.rstrip('/')}/reminders"
         style="display:inline-block;margin-top:14px;background:{brand_color};color:#fff;
                text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">
        Open the reminders board
      </a>
      <p style="margin:20px 0 0;font-size:12.5px;color:#64748b">
        You are receiving this because you are an owner or administrator of {firm_name}. Lead
        times are configurable under Settings.
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
