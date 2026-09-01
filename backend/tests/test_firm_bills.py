"""Unit tests for the pure-logic pieces of the firm-bills router (0026).

Same posture as test_engagements.py/test_firm_invoices.py: no DB, no network.
SimpleNamespace stands in for a FirmBill/PlatformIncome ORM row — _to_read and
_subscription_row only ever read a handful of attributes off it.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace

from app.routers.firm_bills import _subscription_row, _to_read


def _firm_bill(**overrides):
    defaults = dict(
        id=uuid.uuid4(),
        category="software",
        vendor="Adobe",
        amount=55.0,
        currency="CAD",
        bill_date=date(2026, 1, 5),
        due_date=None,
        status="unpaid",
        paid_on=None,
        is_recurring=True,
        notes=None,
        created_at=datetime(2026, 1, 5, tzinfo=timezone.utc),
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _platform_income(**overrides):
    defaults = dict(
        id=uuid.uuid4(),
        amount=100.0,
        currency="USD",
        received_date=date(2026, 1, 1),
        notes=None,
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


class TestManualBillRead:
    def test_source_is_manual_and_fields_pass_through(self):
        row = _firm_bill(vendor="Adobe Creative Cloud", amount=55.5)
        read = _to_read(row)
        assert read.source == "manual"
        assert read.category == "software"
        assert read.vendor == "Adobe Creative Cloud"
        assert read.amount == 55.5
        assert read.status == "unpaid"


class TestSubscriptionRowSynthesis:
    """A platform_income row (what the firm paid SpidNums) is merged in at
    read time as a read-only, always-"paid" bill — see firm_bills.py's
    module docstring for why no separate table exists for this."""

    def test_reads_as_paid_regardless_of_the_source_rows_own_state(self):
        row = _platform_income(amount=499.0)
        read = _subscription_row(row)
        assert read.status == "paid"
        assert read.source == "subscription"
        assert read.vendor == "SpidNums"
        assert read.category == "subscription"
        assert read.amount == 499.0

    def test_bill_date_and_paid_on_both_come_from_received_date(self):
        row = _platform_income(received_date=date(2026, 3, 10))
        read = _subscription_row(row)
        assert read.bill_date == date(2026, 3, 10)
        assert read.paid_on == date(2026, 3, 10)
        assert read.due_date is None

    def test_is_never_recurring_regardless_of_the_platform_ledger(self):
        """platform_income has no is_recurring concept of its own — each row
        is one payment, so the synthesized bill is never flagged recurring."""
        read = _subscription_row(_platform_income())
        assert read.is_recurring is False
