"""Compliance calendar engine.

Turns a client's service assignments into dated filing obligations. Everything
here is pure date arithmetic so it can be unit-tested without a database.

`due_rule` grammar (stored on services.due_rule):
    {"type": "offset_from_period_end", "months": 6,  "period_basis": "fiscal"}
    {"type": "offset_from_period_end", "days": 21,   "period_basis": "calendar"}
    {"type": "fixed_date", "month": 4, "day": 30, "year_offset": 1}
    day = -1 means "last day of that month"
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Iterable

MONTH_ABBR = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


# --- date helpers -------------------------------------------------------------
def month_end(year: int, month: int) -> date:
    return date(year, month, calendar.monthrange(year, month)[1])


def add_months(anchor: date, months: int) -> date:
    """Add months, clamping to the end of the target month (Jan 31 + 1m = Feb 28)."""
    total = anchor.month - 1 + months
    year = anchor.year + total // 12
    month = total % 12 + 1
    day = min(anchor.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def easter(year: int) -> date:
    """Anonymous Gregorian algorithm — needed for Good Friday."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    lu = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * lu) // 451
    month = (h + lu - 7 * m + 114) // 31
    day = (h + lu - 7 * m + 114) % 31 + 1
    return date(year, month, day)


def _nth_weekday(year: int, month: int, weekday: int, nth: int) -> date:
    """nth (1-based) `weekday` of a month; Monday = 0."""
    first = date(year, month, 1)
    offset = (weekday - first.weekday()) % 7
    return first + timedelta(days=offset + 7 * (nth - 1))


def statutory_holidays(year: int) -> set[date]:
    """Canadian federal holidays that shift CRA filing deadlines."""
    good_friday = easter(year) - timedelta(days=2)
    victoria_day = max(
        d for d in (_nth_weekday(year, 5, 0, n) for n in (1, 2, 3, 4)) if d.day <= 24
    )
    return {
        date(year, 1, 1),                       # New Year's Day
        good_friday,
        victoria_day,                           # Monday on or before May 24
        date(year, 7, 1),                       # Canada Day
        _nth_weekday(year, 9, 0, 1),            # Labour Day
        date(year, 9, 30),                      # National Day for Truth and Reconciliation
        _nth_weekday(year, 10, 0, 2),           # Thanksgiving
        date(year, 11, 11),                     # Remembrance Day
        date(year, 12, 25),                     # Christmas Day
        date(year, 12, 26),                     # Boxing Day
    }


def next_business_day(value: date) -> date:
    """CRA treats a filing as on time if the next business day is met."""
    holidays = statutory_holidays(value.year) | statutory_holidays(value.year + 1)
    while value.weekday() >= 5 or value in holidays:
        value += timedelta(days=1)
    return value


# --- periods ------------------------------------------------------------------
@dataclass(frozen=True, slots=True)
class Period:
    start: date
    end: date
    label: str


def _fiscal_year_end(year: int, month: int, day: int) -> date:
    return date(year, month, min(day, calendar.monthrange(year, month)[1]))


def periods_for(
    frequency: str,
    *,
    year_end_month: int = 12,
    year_end_day: int = 31,
    basis: str = "fiscal",
    window_start: date,
    window_end: date,
) -> list[Period]:
    """Every reporting period whose end falls inside the window."""
    if frequency == "one_time":
        return []

    if basis == "calendar":
        year_end_month, year_end_day = 12, 31

    out: list[Period] = []
    years = range(window_start.year - 1, window_end.year + 2)

    if frequency == "annual":
        for year in years:
            end = _fiscal_year_end(year, year_end_month, year_end_day)
            start = add_months(end, -12) + timedelta(days=1)
            out.append(Period(start, end, f"FY{end.year}" if year_end_month == 12 else f"YE {end.isoformat()}"))

    elif frequency == "semi_annual":
        for year in years:
            for shift in (0, -6):
                end = month_end(*_shift_month(year, year_end_month, shift))
                if shift == 0:
                    end = _fiscal_year_end(year, year_end_month, year_end_day)
                start = add_months(end, -6) + timedelta(days=1)
                half = "H2" if shift == 0 else "H1"
                out.append(Period(start, end, f"{half} {end.year}"))

    elif frequency == "quarterly":
        for year in years:
            for index, shift in enumerate((-9, -6, -3, 0)):
                y, m = _shift_month(year, year_end_month, shift)
                end = month_end(y, m) if shift != 0 else _fiscal_year_end(year, year_end_month, year_end_day)
                start = add_months(end, -3) + timedelta(days=1)
                out.append(Period(start, end, f"Q{index + 1} {end.year}"))

    elif frequency == "monthly":
        for year in years:
            for month in range(1, 13):
                end = month_end(year, month)
                out.append(Period(date(year, month, 1), end, f"{MONTH_ABBR[month - 1]} {year}"))

    periods = [p for p in out if window_start <= p.end <= window_end]
    periods.sort(key=lambda p: p.end)
    # de-duplicate period ends produced by overlapping year loops
    seen: set[date] = set()
    unique: list[Period] = []
    for period in periods:
        if period.end not in seen:
            seen.add(period.end)
            unique.append(period)
    return unique


def _shift_month(year: int, month: int, delta: int) -> tuple[int, int]:
    total = (year * 12 + month - 1) + delta
    return total // 12, total % 12 + 1


# --- due dates ----------------------------------------------------------------
def due_date_for(period_end: date, rule: dict[str, Any] | None) -> date:
    rule = rule or {}
    kind = rule.get("type", "offset_from_period_end")

    if kind == "fixed_date":
        month = int(rule.get("month", 12))
        day = int(rule.get("day", 31))
        year = period_end.year + int(rule.get("year_offset", 1))
        if day < 0:
            due = month_end(year, month)
        else:
            due = date(year, month, min(day, calendar.monthrange(year, month)[1]))
    else:
        due = period_end
        months = int(rule.get("months", 0) or 0)
        days = int(rule.get("days", 0) or 0)
        if months:
            due = add_months(due, months)
        if days:
            due = due + timedelta(days=days)
        if not months and not days:
            due = add_months(due, 6)

    if rule.get("observe_business_days", True):
        due = next_business_day(due)
    return due


# --- planned obligations ------------------------------------------------------
@dataclass(slots=True)
class PlannedDeadline:
    period_start: date
    period_end: date
    period_label: str
    due_date: date
    title: str


def plan_deadlines(
    *,
    service_name: str,
    frequency: str,
    due_rule: dict[str, Any] | None,
    year_end_month: int,
    year_end_day: int,
    window_start: date,
    window_end: date,
    service_start: date | None = None,
    service_end: date | None = None,
) -> list[PlannedDeadline]:
    basis = (due_rule or {}).get("period_basis", "fiscal")
    periods = periods_for(
        frequency,
        year_end_month=year_end_month,
        year_end_day=year_end_day,
        basis=basis,
        window_start=window_start,
        window_end=window_end,
    )

    planned: list[PlannedDeadline] = []
    for period in periods:
        if service_start and period.end < service_start:
            continue
        if service_end and period.start > service_end:
            continue
        planned.append(
            PlannedDeadline(
                period_start=period.start,
                period_end=period.end,
                period_label=period.label,
                due_date=due_date_for(period.end, due_rule),
                title=f"{service_name} — {period.label}",
            )
        )
    return planned


# --- read-time urgency --------------------------------------------------------
def urgency_for(due: date, status: str, today: date, snoozed_until: date | None = None) -> tuple[str, int]:
    days = (due - today).days
    if status == "filed":
        return "filed", days
    if status == "dismissed":
        return "dismissed", days
    if status == "snoozed" and snoozed_until and snoozed_until > today:
        return "snoozed", days
    if days < 0:
        return "overdue", days
    if days <= 14:
        return "due_soon", days
    return "upcoming", days


def summarise(rows: Iterable[tuple[date, str, date | None]], today: date) -> dict[str, int]:
    buckets = {"overdue": 0, "due_soon": 0, "upcoming": 0}
    for due, status, snoozed in rows:
        bucket, _ = urgency_for(due, status, today, snoozed)
        if bucket in buckets:
            buckets[bucket] += 1
    return buckets
