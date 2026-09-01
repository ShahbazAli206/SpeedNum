"""Unit tests for the pure-logic pieces behind the client-portal invite flow:
password generation and the welcome email template. Both are pure functions —
no database, no network — the actual Supabase Admin API calls in
app/services/supabase_admin.py are not exercised here (there is no live
Supabase project to test them against yet, same caveat as the rest of the
client-portal backend).
"""

from __future__ import annotations

from app.services.email import portal_welcome_html
from app.services.supabase_admin import generate_temp_password


def test_generate_temp_password_length_and_alphabet():
    password = generate_temp_password()
    assert len(password) == 16
    assert password.isalnum()


def test_generate_temp_password_is_not_constant():
    # Not a rigorous randomness test — just guards against a copy-paste bug
    # that would make every invite share one password.
    passwords = {generate_temp_password() for _ in range(20)}
    assert len(passwords) == 20


def test_portal_welcome_html_includes_credentials_and_magic_link():
    html = portal_welcome_html(
        firm_name="Harrison CPA",
        client_name="Maple Leaf Consulting",
        email="alison@mapleleaf.ca",
        temp_password="hP2CyMDPzvJasSwH",
        login_url="https://app.spidnums.com/login",
        magic_url="https://app.spidnums.com/portal-login?token_hash=abc123&email=alison%40mapleleaf.ca",
    )
    assert "Harrison CPA" in html
    assert "Maple Leaf Consulting" in html
    assert "alison@mapleleaf.ca" in html
    assert "hP2CyMDPzvJasSwH" in html
    assert "https://app.spidnums.com/portal-login?token_hash=abc123" in html
    assert "Sign in to your dashboard" in html


def test_portal_welcome_html_falls_back_to_login_url_without_a_magic_link():
    html = portal_welcome_html(
        firm_name="Harrison CPA",
        client_name="Maple Leaf Consulting",
        email="alison@mapleleaf.ca",
        temp_password="hP2CyMDPzvJasSwH",
        login_url="https://app.spidnums.com/login",
        magic_url=None,
    )
    # No magic link: the CTA button itself must point at the plain login page.
    assert 'href="https://app.spidnums.com/login"' in html
    assert "Sign in to your dashboard" in html
