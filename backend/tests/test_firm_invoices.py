"""Unit tests for the pure-logic pieces of the firm-invoices router (0026).

Same posture as test_engagements.py: no DB-backed test harness exists for any
router in this repo, so this only exercises functions with no database or
network dependency. SimpleNamespace stands in for a FirmInvoice/
FirmInvoiceItem/FirmInvoicePayment ORM row — these functions only ever read a
handful of attributes off it, never anything ORM-specific.
"""

from __future__ import annotations

from datetime import date
from types import SimpleNamespace

from app.routers.firm_invoices import _apply_payment_state, _effective_status, _totals


def _invoice(**overrides):
    defaults = dict(status="draft", due_on=date(2026, 1, 31), total=105.0, amount_paid=0.0, paid_on=None, payments=[])
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _payment(amount: float, paid_on: date):
    return SimpleNamespace(amount=amount, paid_on=paid_on)


class TestEffectiveStatus:
    def test_sent_past_due_date_reads_as_overdue(self):
        row = _invoice(status="sent", due_on=date(2026, 1, 1))
        assert _effective_status(row, date(2026, 1, 15)) == "overdue"

    def test_sent_not_yet_due_stays_sent(self):
        row = _invoice(status="sent", due_on=date(2026, 2, 1))
        assert _effective_status(row, date(2026, 1, 15)) == "sent"

    def test_draft_never_reads_as_overdue_even_past_its_due_date(self):
        """An unsent invoice has no meaningful "overdue" state — only a sent
        one can be late."""
        row = _invoice(status="draft", due_on=date(2026, 1, 1))
        assert _effective_status(row, date(2026, 6, 1)) == "draft"

    def test_paid_and_void_pass_through_unchanged(self):
        assert _effective_status(_invoice(status="paid", due_on=date(2026, 1, 1)), date(2026, 6, 1)) == "paid"
        assert _effective_status(_invoice(status="void", due_on=date(2026, 1, 1)), date(2026, 6, 1)) == "void"


class TestTotals:
    def test_subtotal_is_the_sum_of_item_amounts(self):
        items = [SimpleNamespace(amount=100.0), SimpleNamespace(amount=50.0)]
        subtotal, tax, total = _totals(items, 0)
        assert subtotal == 150.0
        assert tax == 0
        assert total == 150.0

    def test_tax_rate_is_a_plain_percentage_not_a_fraction(self):
        """13 means 13%, matching every place that displays it back — the
        same convention engagements.py's _totals uses."""
        items = [SimpleNamespace(amount=100.0)]
        subtotal, tax, total = _totals(items, 13)
        assert subtotal == 100.0
        assert tax == 13.0
        assert total == 113.0

    def test_no_items_yields_zero_totals(self):
        assert _totals([], 13) == (0, 0, 0)

    def test_rounds_to_cents(self):
        items = [SimpleNamespace(amount=33.333)]
        subtotal, tax, total = _totals(items, 10)
        assert subtotal == 33.33
        assert tax == 3.33
        assert total == 36.66


class TestApplyPaymentState:
    def test_partial_payment_leaves_invoice_sent(self):
        invoice = _invoice(status="sent", total=100.0, payments=[_payment(40.0, date(2026, 1, 5))])
        _apply_payment_state(invoice)
        assert invoice.amount_paid == 40.0
        assert invoice.status == "sent"
        assert invoice.paid_on is None

    def test_full_payment_marks_paid_and_stamps_the_latest_payment_date(self):
        invoice = _invoice(
            status="sent",
            total=100.0,
            payments=[_payment(40.0, date(2026, 1, 5)), _payment(60.0, date(2026, 1, 20))],
        )
        _apply_payment_state(invoice)
        assert invoice.amount_paid == 100.0
        assert invoice.status == "paid"
        assert invoice.paid_on == date(2026, 1, 20)

    def test_overpayment_still_reads_as_paid(self):
        invoice = _invoice(status="sent", total=100.0, payments=[_payment(150.0, date(2026, 1, 5))])
        _apply_payment_state(invoice)
        assert invoice.status == "paid"

    def test_removing_a_payment_that_drops_below_total_reverts_to_sent(self):
        """A payment was deleted (via DELETE /invoices/{id}/payments/{pid})
        after the invoice had been marked paid — the invoice must fall back
        to "sent", not stay incorrectly "paid" with an unpaid balance."""
        invoice = _invoice(status="paid", total=100.0, paid_on=date(2026, 1, 20), payments=[_payment(40.0, date(2026, 1, 5))])
        _apply_payment_state(invoice)
        assert invoice.amount_paid == 40.0
        assert invoice.status == "sent"
        assert invoice.paid_on is None

    def test_zero_total_never_flips_to_paid_by_a_stray_zero_payment(self):
        """Guards the `float(invoice.total) > 0` condition — without it, a
        brand-new invoice with no items yet (total=0) would read as "paid"
        the moment amount_paid is also 0 (0 >= 0)."""
        invoice = _invoice(status="sent", total=0.0, payments=[])
        _apply_payment_state(invoice)
        assert invoice.status == "sent"
