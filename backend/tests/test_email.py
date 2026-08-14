"""Unit tests for the transactional email templates (app/services/email.py).

These are pure string builders, and the thing worth guarding is what they must
never do: leak one client's information into another's email, render an empty
section header, or crash the send because a date was malformed. A template that
throws takes the whole account-provisioning request down with it.
"""

from __future__ import annotations

import pytest

from app.services.accounts import portal_login_url, staff_login_url
from app.services.email import (
    _friendly_date,
    portal_welcome_html,
    reminder_digest_html,
    staff_welcome_html,
)

SERVICES = [
    {"name": "Corporate tax return", "frequency": "annual"},
    {"name": "Bookkeeping", "frequency": "monthly"},
]
DEADLINES = [
    {"title": "T2 Corporate Return", "due_date": "2026-06-30"},
    {"title": "GST/HST Q3", "due_date": "2026-10-31"},
]


def welcome(**overrides) -> str:
    kwargs = {
        "firm_name": "Harrison CPA",
        "client_name": "Lakeview Dental",
        "email": "hello@lakeview.ca",
        "temp_password": "Xy7kP2mQ9aB4cD1e",
        "login_url": "https://app.example.com/login",
    }
    kwargs.update(overrides)
    return portal_welcome_html(**kwargs)


# --- dates --------------------------------------------------------------------
def test_friendly_date_is_human_readable():
    assert _friendly_date("2026-06-30") == "30 June 2026"


def test_friendly_date_falls_back_rather_than_raising():
    """A malformed date must not take down the whole welcome email."""
    assert _friendly_date("not-a-date") == "not-a-date"
    assert _friendly_date("") == ""


# --- the client welcome email -------------------------------------------------
def test_welcome_carries_the_credentials():
    html = welcome()
    assert "hello@lakeview.ca" in html
    assert "Xy7kP2mQ9aB4cD1e" in html
    assert "Temporary password" in html


def test_welcome_lists_the_services_and_deadlines():
    html = welcome(services=SERVICES, deadlines=DEADLINES)
    assert "What we look after for you" in html
    assert "Corporate tax return" in html
    assert "Bookkeeping" in html
    assert "Coming up" in html
    assert "T2 Corporate Return" in html
    assert "30 June 2026" in html


def test_welcome_omits_empty_sections_entirely():
    """An empty "Your services" heading reads worse than no heading."""
    html = welcome(services=[], deadlines=[])
    assert "What we look after for you" not in html
    assert "Coming up" not in html


def test_welcome_names_the_assigned_accountant_when_there_is_one():
    html = welcome(contact_name="Jane Harrison", contact_email="jane@harrisoncpa.ca")
    assert "Jane Harrison" in html
    assert "mailto:jane@harrisoncpa.ca" in html


def test_welcome_omits_the_contact_block_when_nobody_is_assigned():
    assert "point of contact" not in welcome()


def test_welcome_uses_the_magic_link_when_available():
    html = welcome(magic_url="https://app.example.com/portal-login?token_hash=abc")
    assert "token_hash=abc" in html


def test_welcome_falls_back_to_the_login_page_without_a_magic_link():
    """Supabase admin not configured — the password must still be usable."""
    html = welcome()
    assert "https://app.example.com/login" in html
    assert "Sign in any time at" in html


def test_welcome_always_asks_for_a_password_change():
    assert "change your password" in welcome()


# --- the staff credentials email ----------------------------------------------
def staff(**overrides) -> str:
    kwargs = {
        "firm_name": "Harrison CPA",
        "full_name": "Jane Doe",
        "email": "jane@harrisoncpa.ca",
        "temp_password": "Secret123456",
        "login_url": "https://app.example.com/login",
        "role_label": "an administrator",
    }
    kwargs.update(overrides)
    return staff_welcome_html(**kwargs)


def test_staff_email_carries_credentials_and_role():
    html = staff()
    assert "jane@harrisoncpa.ca" in html
    assert "Secret123456" in html
    assert "an administrator" in html


def test_staff_email_does_not_leak_client_detail():
    """The staff template is deliberately leaner — no client tour, no services."""
    html = staff()
    assert "What we look after" not in html
    assert "Coming up" not in html


def test_staff_email_uses_a_magic_link_when_given_one():
    html = staff(magic_url="https://app.example.com/portal-login?token_hash=xyz&next=%2Foverview")
    assert "token_hash=xyz" in html


# --- one-click sign-in links --------------------------------------------------
def test_portal_link_lands_in_the_client_portal():
    url = portal_login_url(token_hash="abc", email="a@b.co")
    assert "/portal-login" in url
    assert "next=%2Fdashboard" in url


def test_staff_link_lands_in_the_practice_app():
    """A new accountant clicking their credentials email must not be dropped
    into a client portal."""
    url = staff_login_url(token_hash="abc", email="a@b.co")
    assert "next=%2Foverview" in url


def test_link_escapes_the_email_address():
    url = portal_login_url(token_hash="abc", email="a+tag@b.co")
    assert "a%2Btag%40b.co" in url


# --- the reminder digest ------------------------------------------------------
def test_digest_lists_every_item_and_links_each_one():
    html = reminder_digest_html(
        firm_name="Harrison CPA",
        recipient_name="Jane",
        items=[
            {
                "title": "10 days left: GST/HST Return for Lakeview Dental",
                "body": "Due 30 June 2026",
                "severity": "warning",
                "link": "/deadlines",
            },
            {"title": "Overdue: T2 for Ridgeway", "body": "", "severity": "critical", "link": None},
        ],
        app_url="https://app.example.com",
    )
    assert "2 reminders need your attention" in html
    assert "10 days left" in html
    assert "https://app.example.com/deadlines" in html
    # A null link must still resolve somewhere sensible, not to "None".
    assert "None" not in html


@pytest.mark.parametrize("count,expected", [(1, "1 reminder need"), (2, "2 reminders need")])
def test_digest_pluralises(count: int, expected: str):
    html = reminder_digest_html(
        firm_name="F",
        recipient_name="J",
        items=[{"title": f"item {i}", "severity": "info"} for i in range(count)],
        app_url="https://app.example.com",
    )
    assert expected in html
