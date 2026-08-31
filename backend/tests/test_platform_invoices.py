"""Unit tests for the pure-logic pieces of the platform-invoices routers
(0026): the superadmin-side router (routers/platform_invoices.py) and its
read-only company-facing counterpart (routers/plan_requests.py's /billing/
invoices). Same posture as test_engagements.py — no DB, no network.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace

from app.routers.platform_invoices import _effective_status, _totals
from app.routers.plan_requests import _company_invoice_status, _to_company_invoice_read


def _invoice(**overrides):
    defaults = dict(
        id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        number="SN-1001",
        title="Invoice",
        issued_on=date(2026, 1, 1),
        due_on=date(2026, 1, 31),
        currency="USD",
        subtotal=100.0,
        tax_rate=0.0,
        tax_amount=0.0,
        total=100.0,
        amount_paid=0.0,
        status="draft",
        paid_on=None,
        notes=None,
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        items=[],
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _item(**overrides):
    defaults = dict(id=uuid.uuid4(), description="Pro plan", quantity=1.0, unit_price=100.0, amount=100.0, position=0)
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


class TestEffectiveStatus:
    def test_sent_past_due_date_reads_as_overdue(self):
        row = _invoice(status="sent", due_on=date(2026, 1, 1))
        assert _effective_status(row, date(2026, 1, 15)) == "overdue"

    def test_draft_never_reads_as_overdue(self):
        row = _invoice(status="draft", due_on=date(2026, 1, 1))
        assert _effective_status(row, date(2026, 6, 1)) == "draft"


class TestTotals:
    def test_tax_rate_is_a_plain_percentage(self):
        items = [_item(amount=100.0)]
        subtotal, tax, total = _totals(items, 5)
        assert (subtotal, tax, total) == (100.0, 5.0, 105.0)

    def test_no_items_yields_zero_totals(self):
        assert _totals([], 5) == (0, 0, 0)


class TestCompanyInvoiceStatusMirrorsThePlatformSide:
    """The company reads the exact same effective-status derivation the
    superadmin sees — a firm should never be shown a different lifecycle
    stage than what actually happened."""

    def test_matches_the_platform_sides_effective_status_for_every_case(self):
        for status, due_on, today, expected in [
            ("sent", date(2026, 1, 1), date(2026, 1, 15), "overdue"),
            ("sent", date(2026, 2, 1), date(2026, 1, 15), "sent"),
            ("paid", date(2026, 1, 1), date(2026, 6, 1), "paid"),
            ("void", date(2026, 1, 1), date(2026, 6, 1), "void"),
        ]:
            row = _invoice(status=status, due_on=due_on)
            assert _company_invoice_status(row, today) == expected


class TestToCompanyInvoiceRead:
    def test_carries_line_items_through(self):
        row = _invoice(items=[_item(description="Pro plan", amount=100.0), _item(description="Setup fee", amount=50.0)])
        read = _to_company_invoice_read(row, date(2026, 1, 15))
        assert [item.description for item in read.items] == ["Pro plan", "Setup fee"]

    def test_overrides_status_with_the_effective_one_not_the_stored_one(self):
        row = _invoice(status="sent", due_on=date(2026, 1, 1))
        read = _to_company_invoice_read(row, date(2026, 6, 1))
        assert read.status == "overdue"

    def test_carries_no_tenant_identifying_field(self):
        """A company only ever sees its own invoices (filtered server-side by
        tenant_id in list_company_invoices) — CompanyInvoiceRead itself
        carries no tenant_id/tenant_name field, unlike the superadmin-side
        InvoiceRead, so there is nothing to leak even by accident."""
        read = _to_company_invoice_read(_invoice(), date(2026, 1, 15))
        assert not hasattr(read, "tenant_id")
        assert not hasattr(read, "tenant_name")
