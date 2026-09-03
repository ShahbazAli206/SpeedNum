"""Non-production recipient redirect (app/services/email.py).

Staging runs on a full copy of live data, so every address in the database is a
real customer's. `EMAIL_REDIRECT_TO` makes the transport rewrite the recipient
of every outgoing message to one address the operator controls — the email
subsystem stays fully live (real send, real delivery) but nothing lands on a
real customer, including the reminder scheduler's automatic digests. An
allowlist lets the operator's own test addresses through unchanged so a genuine
end-to-end test to a "client" they own still delivers.

The whole mechanism is a complete no-op when `EMAIL_REDIRECT_TO` is unset, which
is how live is configured — these tests pin that down so the redirect can never
silently change production behaviour.

Nothing here opens a socket: `_smtp_send_blocking` is the seam and it is patched.
"""

from __future__ import annotations

import asyncio

import pytest

from app.config import Settings
from app.services import email as email_service
from app.services.email import _redirect_recipient, deliver


def run(coro):
    return asyncio.run(coro)


@pytest.fixture
def configure(monkeypatch):
    """Swap in a Settings built from an explicit environment (see
    test_email_transport.py — `app.config.settings` is a singleton read
    directly by email.py, so this is the only way to exercise a config the
    developer running the tests has not set)."""

    def _configure(**overrides):
        defaults = {
            "DATABASE_URL": "postgresql://ci:ci@localhost:5432/postgres",
            "EMAIL_FROM": "SpidNums <no-reply@spidnums.app>",
        }
        defaults.update({key: str(value) for key, value in overrides.items()})
        replacement = Settings(_env_file=None, **defaults)
        monkeypatch.setattr(email_service, "settings", replacement)
        return replacement

    return _configure


@pytest.fixture
def captured_smtp(monkeypatch):
    sent = []
    monkeypatch.setattr(email_service, "_smtp_send_blocking", sent.append)
    return sent


# --- the pure helper ----------------------------------------------------------
def test_no_redirect_target_leaves_the_recipient_untouched(configure):
    configure()  # EMAIL_REDIRECT_TO unset — this is live
    to, subject = _redirect_recipient("client@acme.com", "Your invoice")
    assert to == "client@acme.com"
    assert subject == "Your invoice"


def test_a_non_allowlisted_recipient_is_rewritten_to_the_target(configure):
    configure(EMAIL_REDIRECT_TO="me@example.test")
    to, _ = _redirect_recipient("client@acme.com", "Your invoice")
    assert to == "me@example.test"


def test_the_subject_records_who_the_message_was_really_for(configure):
    configure(EMAIL_REDIRECT_TO="me@example.test")
    _, subject = _redirect_recipient("client@acme.com", "Your invoice")
    assert "client@acme.com" in subject
    assert "Your invoice" in subject


def test_an_allowlisted_address_is_delivered_unchanged(configure):
    configure(EMAIL_REDIRECT_TO="me@example.test", EMAIL_REDIRECT_ALLOWLIST="ok@mine.test")
    to, subject = _redirect_recipient("ok@mine.test", "Your invoice")
    assert to == "ok@mine.test"
    assert subject == "Your invoice"


def test_an_allowlisted_domain_is_delivered_unchanged(configure):
    configure(EMAIL_REDIRECT_TO="me@example.test", EMAIL_REDIRECT_ALLOWLIST="@mine.test")
    to, _ = _redirect_recipient("anyone@mine.test", "Your invoice")
    assert to == "anyone@mine.test"


def test_the_allowlist_check_ignores_case(configure):
    configure(EMAIL_REDIRECT_TO="me@example.test", EMAIL_REDIRECT_ALLOWLIST="ok@mine.test")
    to, _ = _redirect_recipient("OK@Mine.Test", "Your invoice")
    assert to == "OK@Mine.Test"


def test_a_recipient_with_a_display_name_is_redirected_by_its_address(configure):
    configure(EMAIL_REDIRECT_TO="me@example.test")
    to, subject = _redirect_recipient("Jane Client <jane@acme.com>", "Your invoice")
    assert to == "me@example.test"
    assert "jane@acme.com" in subject


# --- through the transport ----------------------------------------------------
def test_deliver_sends_to_the_target_not_the_real_customer(configure, captured_smtp):
    configure(EMAIL_PROVIDER="smtp", SMTP_HOST="smtp.hostinger.com", EMAIL_REDIRECT_TO="me@example.test")

    result = run(deliver(to="client@acme.com", subject="Your invoice", html="<p>hi</p>"))

    assert result.ok
    message = captured_smtp[0]
    assert message["To"] == "me@example.test"
    assert "client@acme.com" in message["Subject"]


def test_deliver_delivers_normally_to_an_allowlisted_address(configure, captured_smtp):
    configure(
        EMAIL_PROVIDER="smtp",
        SMTP_HOST="smtp.hostinger.com",
        EMAIL_REDIRECT_TO="me@example.test",
        EMAIL_REDIRECT_ALLOWLIST="ok@mine.test",
    )

    result = run(deliver(to="ok@mine.test", subject="Your invoice", html="<p>hi</p>"))

    assert result.ok
    assert captured_smtp[0]["To"] == "ok@mine.test"
    assert captured_smtp[0]["Subject"] == "Your invoice"
