"""Client-portal book: the landing summary for /dashboard.

Mirrors frontend/src/lib/demo.ts::getOverview() — same shape, but every number
is aggregated from the other four books rather than hand-typed. `cash_position`
is the cumulative net cash effect of the ledger (money actually collected or
paid out, not merely invoiced/incurred): collected invoices minus approved
expenses minus processed payroll minus filed tax remittances, as of today.
"""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter
from sqlalchemy import func, select

from ..deps import BookScopeDep, SessionDep
from ..models import ClientExpense, ClientInvoice, ClientPayRun, ClientTaxObligation
from ..schemas import ClientBookOverview, MonthPoint
from ..utils import today_utc
from .client_invoices import _effective_status

router = APIRouter(prefix="/client-portal", tags=["client-portal"])

MONTH_ABBR = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


def _scoped(model, stmt, scope: BookScopeDep):
    if scope.client_id:
        return stmt.where(model.tenant_id == scope.tenant_id, model.client_id == scope.client_id)
    return stmt.where(model.tenant_id == scope.tenant_id)


def _last_n_months(today: date, n: int) -> list[tuple[int, int]]:
    """(year, month) pairs for the trailing `n` months, oldest first, ending at
    the current month — same walk-a-cursor approach as reporting.py, run backward."""
    keys: list[tuple[int, int]] = []
    cursor = date(today.year, today.month, 1)
    for _ in range(n):
        keys.append((cursor.year, cursor.month))
        total = cursor.year * 12 + (cursor.month - 1) - 1
        year, month = divmod(total, 12)
        cursor = date(year, month + 1, 1)
    keys.reverse()
    return keys


def _pct_change(now: float, before: float) -> float:
    return round(((now - before) / abs(before)) * 100, 1) if before else 0.0


def func_sum(*columns):
    """sum(a) or sum(a + b) — SQLAlchemy's func.sum only takes one expression."""
    expr = columns[0]
    for extra in columns[1:]:
        expr = expr + extra
    return func.coalesce(func.sum(expr), 0)


async def _cash_effect_as_of(session: SessionDep, scope: BookScopeDep, as_of: date) -> float:
    """Cumulative cash actually moved through `as_of` — the timing field for
    each book is the one that reflects when money changed hands (paid_on /
    spent_on / pay_date / filed_at), not when the obligation was created."""
    collected = await session.scalar(
        _scoped(
            ClientInvoice,
            select(func_sum(ClientInvoice.amount, ClientInvoice.tax)).where(
                ClientInvoice.status == "paid", ClientInvoice.paid_on <= as_of
            ),
            scope,
        )
    ) or 0
    paid_out = await session.scalar(
        _scoped(
            ClientExpense,
            select(func_sum(ClientExpense.amount)).where(
                ClientExpense.status == "approved", ClientExpense.spent_on <= as_of
            ),
            scope,
        )
    ) or 0
    payroll = await session.scalar(
        _scoped(
            ClientPayRun,
            select(func_sum(ClientPayRun.net)).where(
                ClientPayRun.status == "processed", ClientPayRun.pay_date <= as_of
            ),
            scope,
        )
    ) or 0
    remitted = await session.scalar(
        _scoped(
            ClientTaxObligation,
            select(func_sum(ClientTaxObligation.amount)).where(
                ClientTaxObligation.status == "filed", ClientTaxObligation.filed_at <= as_of
            ),
            scope,
        )
    ) or 0
    return float(collected) - float(paid_out) - float(payroll) - float(remitted)


@router.get("/overview", response_model=ClientBookOverview)
async def overview(session: SessionDep, scope: BookScopeDep) -> ClientBookOverview:
    today = today_utc()
    month_keys = _last_n_months(today, 12)
    month_start = date(today.year, today.month, 1)

    invoice_rows = (
        await session.scalars(
            _scoped(
                ClientInvoice,
                select(ClientInvoice).where(ClientInvoice.status != "draft"),
                scope,
            )
        )
    ).all()
    expense_rows = (
        await session.scalars(
            _scoped(ClientExpense, select(ClientExpense).where(ClientExpense.status != "rejected"), scope)
        )
    ).all()

    month_map = {key: {"revenue": 0.0, "expenses": 0.0} for key in month_keys}
    for row in invoice_rows:
        key = (row.issued_on.year, row.issued_on.month)
        if key in month_map:
            month_map[key]["revenue"] += float(row.amount) + float(row.tax)
    for row in expense_rows:
        key = (row.spent_on.year, row.spent_on.month)
        if key in month_map:
            month_map[key]["expenses"] += float(row.amount)

    monthly = [
        MonthPoint(
            x=MONTH_ABBR[month - 1],
            revenue=round(month_map[(year, month)]["revenue"], 2),
            expenses=round(month_map[(year, month)]["expenses"], 2),
            net=round(month_map[(year, month)]["revenue"] - month_map[(year, month)]["expenses"], 2),
        )
        for year, month in month_keys
    ]
    current, previous = monthly[-1], monthly[-2]

    overdue_invoices = [r for r in invoice_rows if _effective_status(r, today) == "overdue"]
    outstanding_invoices = [r for r in invoice_rows if _effective_status(r, today) in ("sent", "overdue")]
    tax_owing = sum(
        float(r.amount)
        for r in await session.scalars(
            _scoped(
                ClientTaxObligation,
                select(ClientTaxObligation).where(ClientTaxObligation.status != "filed"),
                scope,
            )
        )
    )
    pending_expenses = sum(1 for r in expense_rows if r.status == "pending")

    cash_now = await _cash_effect_as_of(session, scope, today)
    cash_start_of_month = await _cash_effect_as_of(session, scope, month_start - timedelta(days=1))

    return ClientBookOverview(
        revenue_mtd=current.revenue,
        revenue_change=_pct_change(current.revenue, previous.revenue),
        expenses_mtd=current.expenses,
        expenses_change=_pct_change(current.expenses, previous.expenses),
        net_mtd=current.net,
        net_change=_pct_change(current.net, previous.net),
        cash_position=round(cash_now, 2),
        cash_change=_pct_change(cash_now, cash_start_of_month),
        outstanding=round(sum(float(r.amount) + float(r.tax) for r in outstanding_invoices), 2),
        overdue_count=len(overdue_invoices),
        tax_owing=round(tax_owing, 2),
        pending_expenses=pending_expenses,
        monthly=monthly,
    )
