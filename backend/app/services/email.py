"""Transactional email: the transport, and the templates it carries.

Two transports, selected by `settings.resolved_email_provider`:

* **resend** — Resend's HTTPS API. Needs no outbound mail ports, which is the
  only thing that works on hosts that block them.
* **smtp** — a plain mailbox on the firm's own domain (on Hostinger,
  `smtp.hostinger.com:465`). No third-party account, and the From address is a
  domain the recipients already recognise.

With neither configured the message is logged and `send_email` returns False.
That is deliberate and load-bearing: account provisioning still succeeds and the
caller shows the temporary password on screen, so a half-configured deploy
degrades to "read the password off the admin's screen" rather than failing to
create the account at all.

Every message goes out as multipart/alternative. The text part is derived from
the HTML rather than written twice — a message with no text alternative scores
badly with spam filters, and credential emails are exactly the ones that must
not land in a junk folder.
"""

from __future__ import annotations

import asyncio
import html as html_module
import logging
import re
import smtplib
import ssl
from dataclasses import dataclass
from datetime import date
from email.message import EmailMessage
from email.utils import formataddr, parseaddr

import httpx

from ..config import settings

log = logging.getLogger(__name__)

RESEND_ENDPOINT = "https://api.resend.com/emails"


@dataclass(slots=True)
class DeliveryResult:
    """Why a send succeeded or failed.

    `send_email` flattens this to a bool for the call sites that only branch on
    "did it go", but the diagnostics endpoint needs the reason — an operator
    testing a fresh VPS has to be told "SMTP authentication failed", not False.
    """

    ok: bool
    provider: str
    error: str | None = None

    def __bool__(self) -> bool:
        return self.ok


# --- plain-text alternative ---------------------------------------------------
_BLOCK_BREAK = re.compile(r"(?i)</\s*(p|div|tr|h[1-6]|li|table)\s*>|<\s*br\s*/?>")
_DROP_ELEMENT = re.compile(r"(?is)<(script|style)[^>]*>.*?</\1\s*>")
_ANCHOR = re.compile(r'(?is)<a\b[^>]*?href\s*=\s*["\']([^"\']+)["\'][^>]*>(.*?)</a\s*>')
_TAG = re.compile(r"(?s)<[^>]+>")
_BLANK_RUN = re.compile(r"\n{3,}")


def html_to_text(html: str) -> str:
    """A readable plain-text rendering of a template.

    Not a general HTML-to-text converter — it only has to handle the markup in
    this file. Links keep their URL in parentheses so the sign-in link survives
    in a client that shows the text part, which for a credentials email is the
    whole point.
    """
    text = _DROP_ELEMENT.sub("", html)
    text = _ANCHOR.sub(lambda m: f"{_TAG.sub('', m.group(2)).strip()} ({m.group(1)})", text)
    text = _BLOCK_BREAK.sub("\n", text)
    text = _TAG.sub("", text)
    text = html_module.unescape(text)
    # Collapse the indentation the templates carry, without joining separate lines.
    text = "\n".join(line.strip() for line in text.splitlines())
    return _BLANK_RUN.sub("\n\n", text).strip()


def sender_name(name: str | None, override: str | None = None) -> str:
    """Whose name a message arrives under.

    A client hired the firm, not this product, so the From line should say
    "Harrison CPA" over the platform's address. `override` is the tenant's
    `email_from_name`, which lets a firm show a trading name without owning a
    mail domain — the address stays the platform's, since sending as the firm's
    own domain would fail SPF.

    Takes strings rather than a Tenant so this module keeps knowing nothing
    about the ORM.
    """
    return ((override or "").strip() or (name or "").strip())


def _sender(from_name: str | None) -> str:
    """The From header. `from_name` lets a message go out as the firm's own name
    over the platform's address — "Harrison CPA <no-reply@speednum.app>" — which
    reads far better to a client than the product's name for a firm they hired."""
    if not from_name:
        return settings.email_from
    address = settings.email_sender_address
    return formataddr((from_name.strip(), address)) if address else settings.email_from


def _valid_recipient(to: str) -> bool:
    _, address = parseaddr(to or "")
    return bool(address) and "@" in address and "." in address.rsplit("@", 1)[-1]


# --- transports ---------------------------------------------------------------
async def _deliver_resend(
    *, sender: str, to: str, subject: str, html: str, text: str, reply_to: str | None
) -> DeliveryResult:
    payload: dict[str, object] = {
        "from": sender,
        "to": [to],
        "subject": subject,
        "html": html,
        "text": text,
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
    except httpx.HTTPError as exc:
        log.warning("Email delivery failed (resend): %s", exc)
        return DeliveryResult(False, "resend", f"Could not reach Resend: {exc}")

    if response.status_code >= 400:
        # Resend answers with {"message": "..."} on rejection; that sentence is
        # the actionable half (unverified domain, invalid recipient), so pass it
        # through rather than a bare status code.
        detail = response.text
        try:
            body = response.json()
            detail = str(body.get("message") or body.get("error") or detail)
        except ValueError:
            pass
        log.warning("Resend rejected message: %s %s", response.status_code, detail)
        return DeliveryResult(False, "resend", f"Resend rejected the message: {detail}")

    return DeliveryResult(True, "resend")


def _build_mime(
    *, sender: str, to: str, subject: str, html: str, text: str, reply_to: str | None
) -> EmailMessage:
    message = EmailMessage()
    message["From"] = sender
    message["To"] = to
    message["Subject"] = subject
    if reply_to:
        message["Reply-To"] = reply_to
    # set_content then add_alternative produces multipart/alternative with the
    # text part first, which is the order clients expect.
    message.set_content(text)
    message.add_alternative(html, subtype="html")
    return message


def _smtp_send_blocking(message: EmailMessage) -> None:
    """Runs on a worker thread — smtplib is synchronous and would otherwise
    block the event loop for the whole SMTP conversation."""
    context = ssl.create_default_context()
    host, port, timeout = settings.smtp_host, settings.smtp_port, settings.smtp_timeout

    if settings.smtp_use_ssl:
        client: smtplib.SMTP = smtplib.SMTP_SSL(host, port, timeout=timeout, context=context)
    else:
        client = smtplib.SMTP(host, port, timeout=timeout)

    try:
        client.ehlo()
        if not settings.smtp_use_ssl:
            # STARTTLS on anything but an explicit SSL port. Credentials and a
            # temporary password are in flight here, so this is not optional —
            # a server that cannot upgrade should fail the send, not downgrade.
            client.starttls(context=context)
            client.ehlo()
        if settings.smtp_username:
            client.login(settings.smtp_username, settings.smtp_password)
        client.send_message(message)
    finally:
        # quit() can itself raise on a half-broken connection; the message is
        # already delivered by then, so closing must not turn success into failure.
        try:
            client.quit()
        except smtplib.SMTPException:
            client.close()


async def _deliver_smtp(
    *, sender: str, to: str, subject: str, html: str, text: str, reply_to: str | None
) -> DeliveryResult:
    if not settings.smtp_host:
        return DeliveryResult(False, "smtp", "SMTP_HOST is not set.")

    message = _build_mime(
        sender=sender, to=to, subject=subject, html=html, text=text, reply_to=reply_to
    )
    try:
        await asyncio.to_thread(_smtp_send_blocking, message)
    except smtplib.SMTPAuthenticationError as exc:
        log.warning("SMTP authentication failed for %s: %s", settings.smtp_username, exc)
        return DeliveryResult(
            False, "smtp", "SMTP authentication failed — check SMTP_USERNAME and SMTP_PASSWORD."
        )
    except smtplib.SMTPRecipientsRefused:
        log.warning("SMTP server refused recipient %s", to)
        return DeliveryResult(False, "smtp", f"The mail server refused the address {to}.")
    except smtplib.SMTPSenderRefused as exc:
        log.warning("SMTP server refused sender %s: %s", sender, exc)
        return DeliveryResult(
            False,
            "smtp",
            f"The mail server refused the From address {sender}. It usually has to match the "
            "authenticated mailbox.",
        )
    except (OSError, smtplib.SMTPException, ssl.SSLError) as exc:
        # OSError covers connection refused / DNS failure / timeout, which on a
        # fresh VPS is nearly always a blocked outbound port.
        log.warning("SMTP delivery failed via %s:%s — %s", settings.smtp_host, settings.smtp_port, exc)
        return DeliveryResult(
            False,
            "smtp",
            f"Could not send via {settings.smtp_host}:{settings.smtp_port} — {type(exc).__name__}: {exc}",
        )

    return DeliveryResult(True, "smtp")


# --- public API ---------------------------------------------------------------
async def deliver(
    *,
    to: str,
    subject: str,
    html: str,
    reply_to: str | None = None,
    from_name: str | None = None,
) -> DeliveryResult:
    """Send one message, reporting why it failed when it does."""
    provider = settings.resolved_email_provider

    if not _valid_recipient(to):
        return DeliveryResult(False, provider, f"{to!r} is not a usable email address.")

    text = html_to_text(html)
    sender = _sender(from_name)
    reply_to = reply_to or settings.email_reply_to or None

    if provider == "none":
        log.info("[email:dry-run] to=%s subject=%s", to, subject)
        return DeliveryResult(
            False,
            "none",
            "No email transport is configured. Set RESEND_API_KEY, or SMTP_HOST with its "
            "credentials, to deliver this message.",
        )

    if provider == "resend":
        if not settings.resend_api_key:
            return DeliveryResult(False, "resend", "EMAIL_PROVIDER=resend but RESEND_API_KEY is unset.")
        return await _deliver_resend(
            sender=sender, to=to, subject=subject, html=html, text=text, reply_to=reply_to
        )

    return await _deliver_smtp(
        sender=sender, to=to, subject=subject, html=html, text=text, reply_to=reply_to
    )


async def send_email(
    *,
    to: str,
    subject: str,
    html: str,
    reply_to: str | None = None,
    from_name: str | None = None,
) -> bool:
    """Fire-and-report wrapper over `deliver`.

    Kept returning a bool because every caller uses it the same way: record
    whether the recipient was told, and fall back to showing the credentials on
    screen when they were not.
    """
    return (await deliver(
        to=to, subject=subject, html=html, reply_to=reply_to, from_name=from_name
    )).ok


def email_status() -> dict[str, object]:
    """What the operator needs to diagnose delivery, and nothing secret.

    Never returns a key, password or full connection string — this is readable
    by any firm admin, and the answer to "is email working" must not require
    handing out the credential that makes it work.
    """
    provider = settings.resolved_email_provider
    warnings: list[str] = []

    if provider == "none":
        warnings.append(
            "No transport configured — credential emails are logged, not sent. The temporary "
            "password is still shown on screen when an account is created."
        )
    if provider == "resend" and not settings.resend_api_key:
        warnings.append("EMAIL_PROVIDER=resend but RESEND_API_KEY is unset.")
    if provider == "smtp" and not settings.smtp_host:
        warnings.append("EMAIL_PROVIDER=smtp but SMTP_HOST is unset.")
    if provider == "smtp" and not settings.smtp_username:
        warnings.append(
            "SMTP_USERNAME is unset — most providers reject unauthenticated relay, and an "
            "open one would be worse."
        )
    if settings.email_sender_domain == "resend.dev":
        warnings.append(
            "EMAIL_FROM is still the resend.dev sandbox sender, which only delivers to the "
            "Resend account owner's own address. Clients and staff will never receive their "
            "credentials. Set EMAIL_FROM to an address on a domain you have verified."
        )
    if not settings.email_sender_address:
        warnings.append("EMAIL_FROM has no address in it.")

    status: dict[str, object] = {
        "provider": provider,
        "configured": provider != "none",
        "sender": settings.email_from,
        "sender_domain": settings.email_sender_domain,
        "reply_to": settings.email_reply_to or None,
        "warnings": warnings,
    }
    if provider == "smtp":
        status["smtp"] = {
            "host": settings.smtp_host,
            "port": settings.smtp_port,
            "security": "ssl" if settings.smtp_use_ssl else "starttls",
            "username": settings.smtp_username,
            "authenticated": bool(settings.smtp_username and settings.smtp_password),
        }
    return status


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


def task_assigned_html(
    *,
    firm_name: str,
    assignee_name: str,
    task_title: str,
    due_date: str | None,
    client_name: str | None,
    url: str,
    brand_color: str = "#1d4ed8",
) -> str:
    details = []
    if client_name:
        details.append(f"Client: {client_name}")
    if due_date:
        details.append(f"Due: {due_date}")
    detail_line = " &middot; ".join(details)
    return f"""
<div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
            background:#f8fafc;padding:32px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;
              border:1px solid #e2e8f0;overflow:hidden">
    <div style="background:{brand_color};padding:20px 28px;color:#fff;font-weight:600;font-size:18px">
      {firm_name}
    </div>
    <div style="padding:28px;color:#0f172a;line-height:1.6">
      <p style="margin:0 0 12px">Hello {assignee_name},</p>
      <p style="margin:0 0 20px">A task has been assigned to you.</p>
      <p style="margin:0 0 24px;font-size:15px">
        <strong>{task_title}</strong>
        {f'<br /><span style="color:#64748b;font-size:13px">{detail_line}</span>' if detail_line else ""}
      </p>
      <a href="{url}"
         style="display:inline-block;background:{brand_color};color:#fff;text-decoration:none;
                padding:12px 22px;border-radius:8px;font-weight:600">View task</a>
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


def test_message_html(
    *,
    firm_name: str,
    requested_by: str,
    provider: str,
    brand_color: str = "#1d4ed8",
) -> str:
    """The message behind POST /settings/email/test.

    Deliberately says what it is in the subject and the body: it lands in a real
    inbox, and an unexplained email from a system a client has just been added to
    reads like a phishing attempt. Carries no credentials and no links, so
    triggering it can never leak anything.
    """
    return f"""
<div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
            background:#f8fafc;padding:32px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;
              border:1px solid #e2e8f0;overflow:hidden">
    <div style="background:{brand_color};padding:20px 28px;color:#fff;font-weight:600;font-size:18px">
      {firm_name}
    </div>
    <div style="padding:28px;color:#0f172a;line-height:1.6">
      <h2 style="margin:0 0 12px;font-size:19px">Email delivery is working</h2>
      <p style="margin:0 0 16px">
        If you are reading this, {firm_name} can deliver credential emails, client portal
        welcomes and reminder digests to this address.
      </p>
      <p style="margin:0 0 16px;font-size:13.5px;color:#475569">
        Sent via <strong>{provider}</strong>, requested by {requested_by} from the firm's
        settings page. This is a test message — it carries no login details and asks nothing
        of you.
      </p>
      <p style="margin:0;font-size:13px;color:#64748b">
        Worth checking whether it landed in the inbox or the spam folder: credential emails
        travel the same path, and a client who cannot find theirs cannot sign in.
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


def verify_email_html(*, url: str, brand_color: str = "#1d4ed8") -> str:
    return f"""
<div style="font-family:ui-sans-serif,system-ui,sans-serif;background:#f8fafc;padding:32px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;
              border:1px solid #e2e8f0;padding:28px;color:#0f172a;line-height:1.6">
    <h2 style="margin:0 0 12px;font-size:20px">Confirm your email address</h2>
    <p style="margin:0 0 20px">Click below to verify your SpeedNum account. This link expires in 24 hours.</p>
    <a href="{url}" style="display:inline-block;background:{brand_color};color:#fff;
       text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">Verify email</a>
    <p style="margin:20px 0 0;font-size:13px;color:#64748b">
      If you didn't create this account, you can ignore this email.</p>
  </div>
</div>
"""


def password_reset_html(*, url: str, brand_color: str = "#1d4ed8") -> str:
    return f"""
<div style="font-family:ui-sans-serif,system-ui,sans-serif;background:#f8fafc;padding:32px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;
              border:1px solid #e2e8f0;padding:28px;color:#0f172a;line-height:1.6">
    <h2 style="margin:0 0 12px;font-size:20px">Reset your password</h2>
    <p style="margin:0 0 20px">Click below to choose a new password. This link expires in one hour
       and can only be used once.</p>
    <a href="{url}" style="display:inline-block;background:{brand_color};color:#fff;
       text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">Reset password</a>
    <p style="margin:20px 0 0;font-size:13px;color:#64748b">
      If you didn't request this, you can ignore this email — your password will not change.</p>
  </div>
</div>
"""
