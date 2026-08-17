"""Unit tests for the invoice-revenue aggregation in routers/dashboard.py —
pure logic extracted from the DB-bound `dashboard()` endpoint so it can be
tested without a database, matching this suite's existing convention (see
test_deadlines.py, test_reminders.py). The DB query itself (grouping by
status, excluding void invoices) was live-verified against real invoices in
an earlier session; this locks down the arithmetic that turns those grouped
sums into the four reported figures.
"""

from __future__ import annotations

from app.routers.dashboard import summarise_invoice_revenue


def test_empty_rows_yield_all_zeros():
    summary = summarise_invoice_revenue([])
    assert (summary.invoiced, summary.paid, summary.outstanding, summary.overdue) == (0, 0, 0, 0)


def test_paid_invoice_counts_as_invoiced_and_paid_only():
    summary = summarise_invoice_revenue([("paid", 1000.0)])
    assert summary.invoiced == 1000.0
    assert summary.paid == 1000.0
    assert summary.outstanding == 0
    assert summary.overdue == 0


def test_sent_invoice_is_outstanding_but_not_overdue():
    summary = summarise_invoice_revenue([("sent", 500.0)])
    assert summary.invoiced == 500.0
    assert summary.paid == 0
    assert summary.outstanding == 500.0
    assert summary.overdue == 0


def test_overdue_invoice_is_outstanding_and_overdue():
    summary = summarise_invoice_revenue([("overdue", 250.0)])
    assert summary.invoiced == 250.0
    assert summary.outstanding == 250.0
    assert summary.overdue == 250.0


def test_overdue_never_exceeds_outstanding_across_a_mixed_book():
    summary = summarise_invoice_revenue([("paid", 1000.0), ("sent", 400.0), ("overdue", 150.0)])
    assert summary.invoiced == 1550.0
    assert summary.paid == 1000.0
    assert summary.outstanding == 550.0
    assert summary.overdue == 150.0
    assert summary.overdue <= summary.outstanding


def test_draft_and_void_style_statuses_are_never_double_counted_as_revenue():
    # The router already excludes status == "void" at the query level; a
    # "draft" row reaching here (e.g. a future status) should still count as
    # invoiced but not be silently treated as paid or outstanding.
    summary = summarise_invoice_revenue([("draft", 100.0)])
    assert summary.invoiced == 100.0
    assert summary.paid == 0
    assert summary.outstanding == 0
    assert summary.overdue == 0


def test_amounts_are_rounded_to_cents():
    summary = summarise_invoice_revenue([("paid", 10.005), ("paid", 10.001)])
    assert summary.paid == round(10.005 + 10.001, 2)
