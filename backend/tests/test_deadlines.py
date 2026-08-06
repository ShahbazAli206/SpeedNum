"""Unit tests for the compliance-calendar engine (app/services/deadlines.py).

Pure date arithmetic, no database — every case here is deterministic. A few
tests build the input date programmatically (e.g. "the next Saturday") rather
than hardcoding a weekday, so they don't depend on memorizing what day of the
week a given date falls on.
"""

from __future__ import annotations

from datetime import date, timedelta

from app.services.deadlines import (
    add_months,
    due_date_for,
    easter,
    month_end,
    next_business_day,
    periods_for,
    plan_deadlines,
    statutory_holidays,
    summarise,
    urgency_for,
)


def _next_weekday(start: date, weekday: int) -> date:
    return start + timedelta(days=(weekday - start.weekday()) % 7)


# --- month_end / add_months ----------------------------------------------------


def test_month_end_handles_leap_years():
    assert month_end(2024, 2) == date(2024, 2, 29)  # leap year
    assert month_end(2026, 2) == date(2026, 2, 28)  # not a leap year
    assert month_end(2026, 4) == date(2026, 4, 30)


def test_add_months_clamps_to_shorter_target_month():
    assert add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)
    assert add_months(date(2024, 1, 31), 1) == date(2024, 2, 29)


def test_add_months_no_clamp_needed():
    assert add_months(date(2026, 1, 15), 3) == date(2026, 4, 15)


def test_add_months_crosses_year_boundary():
    assert add_months(date(2026, 11, 30), 3) == date(2027, 2, 28)


# --- easter / statutory holidays ------------------------------------------------


def test_easter_matches_known_dates():
    # Widely published Easter Sundays; a mismatch means the computus is wrong.
    assert easter(2024) == date(2024, 3, 31)
    assert easter(2025) == date(2025, 4, 20)
    assert easter(2026) == date(2026, 4, 5)


def test_statutory_holidays_includes_fixed_dates():
    holidays = statutory_holidays(2026)
    assert date(2026, 1, 1) in holidays  # New Year's Day
    assert date(2026, 7, 1) in holidays  # Canada Day
    assert date(2026, 9, 30) in holidays  # Truth and Reconciliation
    assert date(2026, 11, 11) in holidays  # Remembrance Day
    assert date(2026, 12, 25) in holidays
    assert date(2026, 12, 26) in holidays


def test_statutory_holidays_includes_good_friday():
    holidays = statutory_holidays(2026)
    assert easter(2026) - timedelta(days=2) in holidays


def test_statutory_holidays_victoria_day_is_a_monday_on_or_before_24th():
    victoria_day = next(d for d in statutory_holidays(2026) if d.month == 5)
    assert victoria_day.weekday() == 0
    assert victoria_day.day <= 24


# --- next_business_day ---------------------------------------------------------


def test_next_business_day_rolls_saturday_to_monday():
    saturday = _next_weekday(date(2026, 6, 1), 5)
    result = next_business_day(saturday)
    assert result.weekday() == 0
    assert result > saturday


def test_next_business_day_leaves_an_ordinary_weekday_alone():
    # August has no Canadian federal statutory holiday.
    wednesday = _next_weekday(date(2026, 8, 1), 2)
    assert next_business_day(wednesday) == wednesday


def test_next_business_day_rolls_past_a_holiday():
    assert next_business_day(date(2026, 12, 25)) > date(2026, 12, 25)
    assert next_business_day(date(2026, 12, 25)).weekday() < 5


# --- periods_for ----------------------------------------------------------------


def test_periods_for_monthly_covers_every_month_in_window():
    periods = periods_for(
        "monthly", window_start=date(2026, 1, 1), window_end=date(2026, 3, 31)
    )
    assert [p.label for p in periods] == ["Jan 2026", "Feb 2026", "Mar 2026"]
    assert periods[0].start == date(2026, 1, 1)
    assert periods[0].end == date(2026, 1, 31)


def test_periods_for_annual_uses_fiscal_year_end():
    periods = periods_for(
        "annual",
        year_end_month=6,
        year_end_day=30,
        basis="fiscal",
        window_start=date(2025, 1, 1),
        window_end=date(2026, 12, 31),
    )
    ends = {p.end for p in periods}
    assert date(2025, 6, 30) in ends
    assert date(2026, 6, 30) in ends
    matching = next(p for p in periods if p.end == date(2026, 6, 30))
    assert matching.start == date(2025, 7, 1)


def test_periods_for_one_time_is_never_scheduled():
    assert periods_for(
        "one_time", window_start=date(2026, 1, 1), window_end=date(2026, 12, 31)
    ) == []


# --- due_date_for ----------------------------------------------------------------


def test_due_date_for_offset_from_period_end():
    period_end = date(2026, 6, 30)
    due = due_date_for(period_end, {"type": "offset_from_period_end", "months": 6, "period_basis": "fiscal"})
    assert due == next_business_day(add_months(period_end, 6))


def test_due_date_for_fixed_date_last_day_of_month():
    due = due_date_for(date(2025, 12, 31), {"type": "fixed_date", "month": 2, "day": -1})
    # year_offset defaults to 1: Dec 2025 -> Feb 2026, "-1" means last day of that month.
    assert due == next_business_day(date(2026, 2, 28))


def test_due_date_for_fixed_date_with_explicit_year_offset():
    due = due_date_for(date(2026, 1, 1), {"type": "fixed_date", "month": 4, "day": 30, "year_offset": 0})
    assert due == next_business_day(date(2026, 4, 30))


def test_due_date_for_can_ignore_business_day_rolling():
    saturday_due = due_date_for(
        date(2026, 1, 1),
        {"type": "fixed_date", "month": 4, "day": 30, "year_offset": 0, "observe_business_days": False},
    )
    assert saturday_due == date(2026, 4, 30)


# --- plan_deadlines --------------------------------------------------------------


def test_plan_deadlines_excludes_periods_before_service_start():
    planned = plan_deadlines(
        service_name="Monthly bookkeeping",
        frequency="monthly",
        due_rule={"type": "offset_from_period_end", "days": 15},
        year_end_month=12,
        year_end_day=31,
        window_start=date(2026, 1, 1),
        window_end=date(2026, 6, 30),
        service_start=date(2026, 3, 1),
    )
    assert all(item.period_end >= date(2026, 3, 1) for item in planned)
    assert {item.period_label for item in planned} == {"Mar 2026", "Apr 2026", "May 2026", "Jun 2026"}


def test_plan_deadlines_titles_combine_service_and_period():
    planned = plan_deadlines(
        service_name="GST/HST Return",
        frequency="monthly",
        due_rule={"type": "offset_from_period_end", "days": 15},
        year_end_month=12,
        year_end_day=31,
        window_start=date(2026, 1, 1),
        window_end=date(2026, 1, 31),
    )
    assert planned[0].title == "GST/HST Return — Jan 2026"


# --- urgency_for / summarise ------------------------------------------------------


def test_urgency_for_buckets_by_days_remaining():
    today = date(2026, 8, 1)
    assert urgency_for(today - timedelta(days=1), "open", today)[0] == "overdue"
    assert urgency_for(today + timedelta(days=14), "open", today)[0] == "due_soon"
    assert urgency_for(today + timedelta(days=15), "open", today)[0] == "upcoming"


def test_urgency_for_status_overrides_take_priority():
    today = date(2026, 8, 1)
    assert urgency_for(today - timedelta(days=30), "filed", today)[0] == "filed"
    assert urgency_for(today - timedelta(days=30), "dismissed", today)[0] == "dismissed"
    assert urgency_for(today + timedelta(days=5), "snoozed", today, snoozed_until=today + timedelta(days=10))[0] == "snoozed"


def test_urgency_for_expired_snooze_falls_back_to_date_bucket():
    today = date(2026, 8, 1)
    bucket, _ = urgency_for(today - timedelta(days=5), "snoozed", today, snoozed_until=today - timedelta(days=1))
    assert bucket == "overdue"


def test_summarise_counts_each_bucket():
    today = date(2026, 8, 1)
    rows = [
        (today - timedelta(days=1), "open", None),   # overdue
        (today + timedelta(days=5), "open", None),   # due_soon
        (today + timedelta(days=30), "open", None),  # upcoming
        (today - timedelta(days=10), "filed", None),  # not counted
    ]
    assert summarise(rows, today) == {"overdue": 1, "due_soon": 1, "upcoming": 1}
