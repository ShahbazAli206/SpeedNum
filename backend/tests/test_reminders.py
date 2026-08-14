"""Unit tests for the reminder engine (app/services/reminders.py).

Pure logic, no database. The important property under test is that a countdown
fires each rung of the ladder exactly once as it descends — that is what makes
the sweep idempotent and what stops the same warning arriving every morning.
"""

from __future__ import annotations

import uuid
from datetime import date

from app.services.reminders import (
    DEFAULT_REMINDER_DAYS,
    OVERDUE_DAYS,
    countdown_phrase,
    crossed_threshold,
    plan_deadline_reminder,
    plan_letter_reminder,
    plan_task_reminder,
    reminder_days_for,
    severity_for,
)

LADDER = DEFAULT_REMINDER_DAYS  # (30, 14, 10, 7, 3, 1, 0)
TODAY = date(2026, 6, 1)


# --- the ladder ---------------------------------------------------------------
def test_nothing_fires_before_the_first_rung():
    assert crossed_threshold(45, LADDER) is None
    assert crossed_threshold(31, LADDER) is None


def test_each_rung_reports_itself_on_the_exact_day():
    for rung in LADDER:
        assert crossed_threshold(rung, LADDER) == rung


def test_between_rungs_reports_the_tighter_one():
    # 9 days out has already passed 30 and 14; the live warning is the 10-day one.
    assert crossed_threshold(9, LADDER) == 10
    assert crossed_threshold(29, LADDER) == 30
    assert crossed_threshold(2, LADDER) == 3


def test_overdue_walks_the_overdue_rungs():
    assert crossed_threshold(-1, LADDER) == -1
    assert crossed_threshold(-2, LADDER) == -1
    assert crossed_threshold(-3, LADDER) == -3
    assert crossed_threshold(-10, LADDER) == -7
    # Past the last rung it pins to the widest one rather than firing forever.
    assert crossed_threshold(-400, LADDER) == min(OVERDUE_DAYS)


def test_each_rung_fires_exactly_once_over_the_countdown():
    """Walk a deadline from 40 days out to 30 days overdue and count how many
    distinct reminders it would produce. One per rung, never a repeat."""
    deadline_id = uuid.uuid4()
    due = date(2026, 7, 15)
    keys: list[str] = []

    # `offset` is days remaining, so today = due - offset. Counting down from
    # 40 days out to 30 days overdue covers every rung on both ladders.
    for offset in range(40, -31, -1):
        today = date.fromordinal(due.toordinal() - offset)
        item = plan_deadline_reminder(
            deadline_id=deadline_id,
            title="T2 Corporate Return — FY2026",
            due_date=due,
            today=today,
            ladder=LADDER,
            client_name="Lakeview Dental",
        )
        if item is not None:
            keys.append(item.dedupe_key)

    unique = set(keys)
    assert len(unique) == len(LADDER) + len(OVERDUE_DAYS)
    # Every fired key encodes the source row and its rung.
    assert f"deadline:{deadline_id}:10" in unique
    assert f"deadline:{deadline_id}:-3" in unique


# --- severity and wording -----------------------------------------------------
def test_severity_escalates_as_the_date_approaches():
    assert severity_for(30) == "info"
    assert severity_for(14) == "info"
    assert severity_for(10) == "warning"
    assert severity_for(7) == "warning"
    assert severity_for(3) == "critical"
    assert severity_for(0) == "critical"
    assert severity_for(-5) == "critical"


def test_countdown_phrase_reads_naturally():
    assert countdown_phrase(10) == "10 days left"
    assert countdown_phrase(1) == "1 day left"
    assert countdown_phrase(0) == "due today"
    assert countdown_phrase(-1) == "1 day overdue"
    assert countdown_phrase(-4) == "4 days overdue"


# --- per-tenant ladder --------------------------------------------------------
def test_tenant_can_override_the_ladder():
    assert reminder_days_for({"reminder_days": [5, 1]}) == (5, 1)


def test_ladder_is_sorted_widest_first_and_deduplicated():
    assert reminder_days_for({"reminder_days": [1, 10, 1, 5]}) == (10, 5, 1)


def test_malformed_ladder_falls_back_to_the_default():
    assert reminder_days_for(None) == DEFAULT_REMINDER_DAYS
    assert reminder_days_for({}) == DEFAULT_REMINDER_DAYS
    assert reminder_days_for({"reminder_days": "soon"}) == DEFAULT_REMINDER_DAYS
    assert reminder_days_for({"reminder_days": []}) == DEFAULT_REMINDER_DAYS
    # Out-of-range and non-numeric entries are dropped, not fatal.
    assert reminder_days_for({"reminder_days": [10, -4, 900, "x"]}) == (10,)


# --- planned reminders --------------------------------------------------------
def test_deadline_reminder_names_the_service_and_the_client():
    item = plan_deadline_reminder(
        deadline_id=uuid.uuid4(),
        title="GST/HST Return — Q2 2026",
        due_date=date(2026, 6, 11),
        today=TODAY,
        ladder=LADDER,
        client_name="Lakeview Dental",
        service_name="GST/HST Return",
    )
    assert item is not None
    assert item.days_before == 10
    assert item.severity == "warning"
    assert item.title == "10 days left: GST/HST Return for Lakeview Dental"
    assert item.link == "/deadlines"


def test_deadline_reminder_falls_back_to_the_title_without_a_service():
    item = plan_deadline_reminder(
        deadline_id=uuid.uuid4(),
        title="Ad-hoc CRA letter response",
        due_date=date(2026, 6, 2),
        today=TODAY,
        ladder=LADDER,
        client_name=None,
    )
    assert item is not None
    assert item.title == "1 day left: Ad-hoc CRA letter response for a client"


def test_task_reminder_links_to_the_task():
    task_id = uuid.uuid4()
    item = plan_task_reminder(
        task_id=task_id,
        title="Collect year-end bank statements",
        due_date=date(2026, 6, 4),
        today=TODAY,
        ladder=LADDER,
        client_name="Ridgeway Hauling",
    )
    assert item is not None
    assert item.kind == "task"
    assert item.days_before == 3
    assert item.link == f"/workflows/{task_id}"
    assert "Ridgeway Hauling" in item.title


def test_letter_reminder_flags_the_outstanding_signature():
    letter_id = uuid.uuid4()
    item = plan_letter_reminder(
        letter_id=letter_id,
        title="Engagement Letter",
        due_date=date(2026, 6, 8),
        today=TODAY,
        ladder=LADDER,
        client_name="Foxglove Florists",
    )
    assert item is not None
    assert item.kind == "letter"
    assert item.days_before == 7
    assert item.link == f"/engagements/{letter_id}"
    assert "signature outstanding" in item.title


def test_far_future_work_plans_nothing():
    assert (
        plan_task_reminder(
            task_id=uuid.uuid4(),
            title="Next year's planning",
            due_date=date(2027, 1, 1),
            today=TODAY,
            ladder=LADDER,
            client_name=None,
        )
        is None
    )
