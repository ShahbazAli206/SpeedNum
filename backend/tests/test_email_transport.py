"""Unit tests for the email transport (app/services/email.py).

The templates are covered in test_email.py; this file is about actually getting
a message out of the process. What matters here is the behaviour an operator
depends on when they deploy to a VPS and nobody receives their credentials:

* the right transport is chosen, and an explicit choice is never silently
  overridden by a different one that happens to be configured;
* a failure explains itself, because "False" is not a diagnosis;
* the message carries a text alternative, since a credentials email that lands
  in spam is the same as one never sent;
* no key or password is ever returned by the status endpoint.

Nothing here opens a socket. `_smtp_send_blocking` and the Resend POST are the
seams; both are patched.
"""

from __future__ import annotations

import asyncio
import smtplib
from email.message import EmailMessage

import pytest

from app.config import Settings
from app.services import email as email_service
from app.services.email import (
    DeliveryResult,
    deliver,
    email_status,
    html_to_text,
    send_email,
    sender_name,
    staff_welcome_html,
)


def run(coro):
    """Drive a coroutine to completion.

    The suite carries no async plugin (see tests/test_storage.py), and these
    tests are pure logic with every socket patched out, so a fresh event loop
    per test costs nothing.
    """
    return asyncio.run(coro)


@pytest.fixture
def configure(monkeypatch):
    """Swap in a Settings built from an explicit environment.

    `app.config.settings` is a module-level singleton read directly by
    email.py, so overriding it is the only way to exercise a provider the
    developer running the tests has not configured.
    """

    def _configure(**overrides):
        defaults = {
            "DATABASE_URL": "postgresql://ci:ci@localhost:5432/postgres",
            "EMAIL_FROM": "SpidNums <no-reply@spidnums.app>",
        }
        defaults.update({key: str(value) for key, value in overrides.items()})
        replacement = Settings(_env_file=None, **{k: v for k, v in defaults.items()})
        monkeypatch.setattr(email_service, "settings", replacement)
        return replacement

    return _configure


def _staff_html() -> str:
    return staff_welcome_html(
        firm_name="Harrison CPA",
        full_name="Jane Doe",
        email="jane@harrisoncpa.ca",
        temp_password="Xy7kP2mQ9aB4cD1e",
        login_url="https://app.example.com/login",
        role_label="an administrator",
    )


# --- provider resolution ------------------------------------------------------
def test_auto_prefers_resend_when_its_key_is_set(configure):
    settings = configure(RESEND_API_KEY="re_test", SMTP_HOST="smtp.hostinger.com")
    assert settings.resolved_email_provider == "resend"


def test_auto_falls_back_to_smtp(configure):
    settings = configure(SMTP_HOST="smtp.hostinger.com")
    assert settings.resolved_email_provider == "smtp"


def test_auto_resolves_to_none_when_nothing_is_configured(configure):
    settings = configure()
    assert settings.resolved_email_provider == "none"
    assert settings.email_is_configured is False


def test_explicit_choice_is_not_overridden_by_the_other_transport(configure):
    """A typo'd SMTP_HOST must fail as SMTP, not quietly send via Resend —
    otherwise the operator debugs a transport they never asked for."""
    settings = configure(EMAIL_PROVIDER="smtp", RESEND_API_KEY="re_test", SMTP_HOST="typo.invalid")
    assert settings.resolved_email_provider == "smtp"


@pytest.mark.parametrize(
    "port,ssl_override,expected",
    [(465, None, True), (587, None, False), (587, "true", True), (465, "false", False)],
)
def test_port_picks_the_tls_mode_unless_overridden(configure, port, ssl_override, expected):
    overrides = {"SMTP_HOST": "smtp.hostinger.com", "SMTP_PORT": port}
    if ssl_override is not None:
        overrides["SMTP_SSL"] = ssl_override
    assert configure(**overrides).smtp_use_ssl is expected


# --- the sender ---------------------------------------------------------------
def test_sender_address_is_extracted_from_a_display_name(configure):
    settings = configure(EMAIL_FROM="SpidNums <no-reply@spidnums.app>")
    assert settings.email_sender_address == "no-reply@spidnums.app"
    assert settings.email_sender_domain == "spidnums.app"


def test_bare_address_needs_no_angle_brackets(configure):
    assert configure(EMAIL_FROM="no-reply@spidnums.app").email_sender_address == "no-reply@spidnums.app"


def test_firm_name_becomes_the_display_name(configure):
    configure(SMTP_HOST="smtp.test", EMAIL_FROM="SpidNums <no-reply@spidnums.app>")
    assert email_service._sender("Harrison CPA") == "Harrison CPA <no-reply@spidnums.app>"


def test_no_firm_name_leaves_the_configured_sender_alone(configure):
    configure(EMAIL_FROM="SpidNums <no-reply@spidnums.app>")
    assert email_service._sender(None) == "SpidNums <no-reply@spidnums.app>"


def test_sender_name_prefers_the_firms_override():
    assert sender_name("Harrison CPA", "Harrison & Co") == "Harrison & Co"
    assert sender_name("Harrison CPA", "") == "Harrison CPA"
    assert sender_name("Harrison CPA", None) == "Harrison CPA"


# --- the plain-text alternative -----------------------------------------------
def test_text_part_keeps_the_credentials():
    text = html_to_text(_staff_html())
    assert "jane@harrisoncpa.ca" in text
    assert "Xy7kP2mQ9aB4cD1e" in text


def test_text_part_keeps_link_urls():
    """A client reading the text part still has to be able to sign in."""
    assert "https://app.example.com/login" in html_to_text(_staff_html())


def test_text_part_has_no_markup_left():
    text = html_to_text(_staff_html())
    assert "<" not in text and ">" not in text
    assert "style=" not in text


def test_text_part_unescapes_entities():
    assert html_to_text("<p>Harrison &amp; Co</p>") == "Harrison & Co"


def test_text_part_drops_style_blocks_rather_than_printing_them():
    assert html_to_text("<style>body{color:red}</style><p>Hello</p>") == "Hello"


# --- SMTP ---------------------------------------------------------------------
@pytest.fixture
def captured_smtp(monkeypatch):
    sent: list[EmailMessage] = []
    monkeypatch.setattr(email_service, "_smtp_send_blocking", sent.append)
    return sent


def test_smtp_send_builds_a_multipart_message(configure, captured_smtp):
    configure(EMAIL_PROVIDER="smtp", SMTP_HOST="smtp.hostinger.com", SMTP_USERNAME="a@b.co")

    result = run(deliver(
        to="jane@harrisoncpa.ca",
        subject="Your account is ready",
        html=_staff_html(),
        reply_to="admin@harrisoncpa.ca",
        from_name="Harrison CPA",
    ))

    assert result.ok and result.provider == "smtp"
    message = captured_smtp[0]
    assert message["From"] == "Harrison CPA <no-reply@spidnums.app>"
    assert message["To"] == "jane@harrisoncpa.ca"
    assert message["Reply-To"] == "admin@harrisoncpa.ca"
    assert message.get_content_type() == "multipart/alternative"

    subtypes = {part.get_content_subtype() for part in message.iter_parts()}
    assert subtypes == {"plain", "html"}


def test_smtp_auth_failure_says_which_setting_is_wrong(configure, monkeypatch):
    configure(EMAIL_PROVIDER="smtp", SMTP_HOST="smtp.hostinger.com", SMTP_USERNAME="a@b.co")

    def raise_auth(_message):
        raise smtplib.SMTPAuthenticationError(535, b"bad credentials")

    monkeypatch.setattr(email_service, "_smtp_send_blocking", raise_auth)

    result = run(deliver(to="jane@harrisoncpa.ca", subject="s", html="<p>h</p>"))
    assert not result.ok
    assert "SMTP_USERNAME" in result.error and "SMTP_PASSWORD" in result.error


def test_blocked_port_is_reported_as_a_connection_failure(configure, monkeypatch):
    """The usual first failure on a fresh VPS. The message has to name the
    host and port or the operator has nothing to check the firewall against."""
    configure(EMAIL_PROVIDER="smtp", SMTP_HOST="smtp.hostinger.com", SMTP_PORT=25)

    def raise_timeout(_message):
        raise TimeoutError("timed out")

    monkeypatch.setattr(email_service, "_smtp_send_blocking", raise_timeout)

    result = run(deliver(to="jane@harrisoncpa.ca", subject="s", html="<p>h</p>"))
    assert not result.ok
    assert "smtp.hostinger.com:25" in result.error


def test_smtp_without_a_host_fails_before_dialling(configure, captured_smtp):
    configure(EMAIL_PROVIDER="smtp")
    result = run(deliver(to="jane@harrisoncpa.ca", subject="s", html="<p>h</p>"))
    assert not result.ok
    assert "SMTP_HOST" in result.error
    assert captured_smtp == []


# --- dry run ------------------------------------------------------------------
def test_unconfigured_reports_why_rather_than_pretending(configure):
    configure()
    result = run(deliver(to="jane@harrisoncpa.ca", subject="s", html="<p>h</p>"))
    assert not result.ok
    assert result.provider == "none"
    assert "RESEND_API_KEY" in result.error and "SMTP_HOST" in result.error


def test_send_email_still_returns_a_bool(configure, captured_smtp):
    """Every existing call site branches on this; the transport rewrite must not
    have changed the contract."""
    configure(EMAIL_PROVIDER="smtp", SMTP_HOST="smtp.hostinger.com", SMTP_USERNAME="a@b.co")
    assert run(send_email(to="jane@harrisoncpa.ca", subject="s", html="<p>h</p>")) is True

    configure()
    assert run(send_email(to="jane@harrisoncpa.ca", subject="s", html="<p>h</p>")) is False


def test_a_malformed_recipient_never_reaches_the_transport(configure, captured_smtp):
    configure(EMAIL_PROVIDER="smtp", SMTP_HOST="smtp.hostinger.com")
    result = run(deliver(to="not-an-address", subject="s", html="<p>h</p>"))
    assert not result.ok
    assert captured_smtp == []


# --- status -------------------------------------------------------------------
def test_status_never_leaks_a_credential(configure):
    configure(
        EMAIL_PROVIDER="smtp",
        SMTP_HOST="smtp.hostinger.com",
        SMTP_USERNAME="no-reply@yourdomain.com",
        SMTP_PASSWORD="hunter2-do-not-leak",
        RESEND_API_KEY="re_secret_key",
    )
    assert "hunter2-do-not-leak" not in str(email_status())
    assert "re_secret_key" not in str(email_status())


def test_status_flags_the_resend_sandbox_sender(configure):
    """The default EMAIL_FROM delivers only to the Resend account owner, so
    every client and staff credential email silently goes nowhere."""
    configure(RESEND_API_KEY="re_test", EMAIL_FROM="SpidNums <onboarding@resend.dev>")
    warnings = " ".join(email_status()["warnings"])
    assert "resend.dev" in warnings


def test_status_flags_an_unconfigured_transport(configure):
    configure()
    status = email_status()
    assert status["configured"] is False
    assert any("logged, not sent" in warning for warning in status["warnings"])


def test_a_healthy_smtp_setup_reports_no_warnings(configure):
    configure(
        EMAIL_PROVIDER="smtp",
        SMTP_HOST="smtp.hostinger.com",
        SMTP_PORT=465,
        SMTP_USERNAME="no-reply@yourdomain.com",
        SMTP_PASSWORD="secret",
        EMAIL_FROM="Harrison CPA <no-reply@yourdomain.com>",
    )
    status = email_status()
    assert status["warnings"] == []
    assert status["smtp"]["security"] == "ssl"
    assert status["smtp"]["authenticated"] is True


def test_delivery_result_is_falsey_when_it_failed():
    assert not DeliveryResult(False, "smtp", "nope")
    assert DeliveryResult(True, "smtp")
