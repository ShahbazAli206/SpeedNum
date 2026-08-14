"""Reminder engine.

Turns open work with a due date — compliance deadlines, Task Master tasks and
engagement letters still waiting on a signature — into dated reminders as each
one crosses a lead-time threshold.

Everything above `sweep()` is pure date/string arithmetic with no database
access, so the thresholds and the wording can be unit-tested directly (see
backend/tests/test_reminders.py).

**Why thresholds, not "days remaining"**
A naive "show me everything due within 10 days" list re-fires the same warning
every single day and can never be acknowledged. Instead each source row crosses
a *ladder* of thresholds (30, 14, 10, 7, 3, 1, 0 days out, then overdue), and
each crossing produces exactly one reminder, identified by
`<kind>:<source id>:<threshold>`. Re-running the sweep hourly is therefore
free — the unique index on (tenant_id, dedupe_key) absorbs the duplicates —
while a genuinely new threshold on the same deadline is a genuinely new row.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import date
from typing import Any, Iterable, Sequence

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import (
    Client,
    Deadline,
    EngagementLetter,
    Profile,
    Reminder,
    Service,
    Task,
    Tenant,
)

log = logging.getLogger(__name__)

# The lead-time ladder, longest first. A firm can override it per tenant via
# tenants.settings->'reminder_days'; 0 means "due today" and is always kept.
DEFAULT_REMINDER_DAYS: tuple[int, ...] = (30, 14, 10, 7, 3, 1, 0)

# How far past the due date we keep nagging, and at what spacing. Overdue
# thresholds are negative days_before values.
OVERDUE_DAYS: tuple[int, ...] = (-1, -3, -7, -14, -30)

OPEN_TASK_STATES = ("todo", "in_progress", "review", "blocked")
OPEN_DEADLINE_STATES = ("open", "snoozed")
UNSIGNED_LETTER_STATES = ("sent", "viewed")


def reminder_days_for(settings: dict[str, Any] | None) -> tuple[int, ...]:
    """Read the ladder off tenants.settings, falling back to the default.

    Tolerant on purpose: the value is firm-editable JSON, so a malformed entry
    should degrade to the default ladder rather than stop every reminder in the
    firm from firing.
    """
    raw = (settings or {}).get("reminder_days")
    if not isinstance(raw, (list, tuple)):
        return DEFAULT_REMINDER_DAYS

    days: set[int] = set()
    for value in raw:
        try:
            day = int(value)
        except (TypeError, ValueError):
            continue
        if 0 <= day <= 365:
            days.add(day)
    if not days:
        return DEFAULT_REMINDER_DAYS
    return tuple(sorted(days, reverse=True))


def crossed_threshold(days_remaining: int, ladder: Sequence[int]) -> int | None:
    """The single rung that `days_remaining` currently sits at.

    Before the due date this is the *tightest* rung still >= days_remaining: a
    deadline 9 days out reports the 10-day rung (its 14- and 30-day rungs
    already fired on earlier days) and one 40 days out reports nothing yet.

    Past the due date it is the deepest overdue rung reached — 3 days late
    reports -3, 10 days late reports -7 — pinning at the widest rung so a
    forgotten item stops re-firing instead of nagging daily forever.
    """
    if days_remaining < 0:
        # -1 is in OVERDUE_DAYS, so any negative value reaches at least one rung.
        return min(day for day in OVERDUE_DAYS if day >= days_remaining)

    candidates = [day for day in ladder if day >= days_remaining]
    return min(candidates) if candidates else None


def severity_for(days_remaining: int) -> str:
    if days_remaining < 0:
        return "critical"
    if days_remaining <= 3:
        return "critical"
    if days_remaining <= 10:
        return "warning"
    return "info"


def countdown_phrase(days_remaining: int) -> str:
    """Human wording for the countdown, used in both the title and the email."""
    if days_remaining < -1:
        return f"{abs(days_remaining)} days overdue"
    if days_remaining == -1:
        return "1 day overdue"
    if days_remaining == 0:
        return "due today"
    if days_remaining == 1:
        return "1 day left"
    return f"{days_remaining} days left"


@dataclass(slots=True)
class PlannedReminder:
    """One reminder the sweep intends to write. Mirrors the Reminder columns."""

    kind: str
    dedupe_key: str
    title: str
    body: str | None
    link: str | None
    due_date: date
    days_before: int
    severity: str
    client_id: uuid.UUID | None = None
    assignee_id: uuid.UUID | None = None
    deadline_id: uuid.UUID | None = None
    task_id: uuid.UUID | None = None
    letter_id: uuid.UUID | None = None


def plan_deadline_reminder(
    *,
    deadline_id: uuid.UUID,
    title: str,
    due_date: date,
    today: date,
    ladder: Sequence[int],
    client_name: str | None,
    service_name: str | None = None,
    client_id: uuid.UUID | None = None,
    assignee_id: uuid.UUID | None = None,
) -> PlannedReminder | None:
    days = (due_date - today).days
    threshold = crossed_threshold(days, ladder)
    if threshold is None:
        return None

    phrase = countdown_phrase(days)
    subject = service_name or title
    who = client_name or "a client"
    return PlannedReminder(
        kind="deadline",
        dedupe_key=f"deadline:{deadline_id}:{threshold}",
        title=f"{phrase}: {subject} for {who}",
        body=f"{title} is due {due_date.isoformat()} ({phrase}).",
        link="/deadlines",
        due_date=due_date,
        days_before=threshold,
        severity=severity_for(days),
        client_id=client_id,
        assignee_id=assignee_id,
        deadline_id=deadline_id,
    )


def plan_task_reminder(
    *,
    task_id: uuid.UUID,
    title: str,
    due_date: date,
    today: date,
    ladder: Sequence[int],
    client_name: str | None,
    client_id: uuid.UUID | None = None,
    assignee_id: uuid.UUID | None = None,
) -> PlannedReminder | None:
    days = (due_date - today).days
    threshold = crossed_threshold(days, ladder)
    if threshold is None:
        return None

    phrase = countdown_phrase(days)
    scope = f" · {client_name}" if client_name else ""
    return PlannedReminder(
        kind="task",
        dedupe_key=f"task:{task_id}:{threshold}",
        title=f"{phrase}: {title}{scope}",
        body=f"Task '{title}' is due {due_date.isoformat()} ({phrase}).",
        link=f"/workflows/{task_id}",
        due_date=due_date,
        days_before=threshold,
        severity=severity_for(days),
        client_id=client_id,
        assignee_id=assignee_id,
        task_id=task_id,
    )


def plan_letter_reminder(
    *,
    letter_id: uuid.UUID,
    title: str,
    due_date: date,
    today: date,
    ladder: Sequence[int],
    client_name: str | None,
    client_id: uuid.UUID | None = None,
) -> PlannedReminder | None:
    """Engagement letters have no `due_date` column — the caller passes the
    expiry (or a sent_at + grace window) as the countdown anchor."""
    days = (due_date - today).days
    threshold = crossed_threshold(days, ladder)
    if threshold is None:
        return None

    phrase = countdown_phrase(days)
    who = client_name or "the client"
    return PlannedReminder(
        kind="letter",
        dedupe_key=f"letter:{letter_id}:{threshold}",
        title=f"{phrase}: signature outstanding on {title}",
        body=f"{who} has not signed '{title}' yet — {phrase} before it expires.",
        link=f"/engagements/{letter_id}",
        due_date=due_date,
        days_before=threshold,
        severity=severity_for(days),
        client_id=client_id,
        letter_id=letter_id,
    )


# --- database sweep -----------------------------------------------------------
@dataclass(slots=True)
class SweepResult:
    created: int = 0
    skipped: int = 0
    emailed: int = 0
    scanned: int = 0

    def as_dict(self) -> dict[str, int]:
        return {
            "created": self.created,
            "skipped": self.skipped,
            "emailed": self.emailed,
            "scanned": self.scanned,
        }


async def collect(session: AsyncSession, tenant: Tenant, *, today: date) -> list[PlannedReminder]:
    """Everything that has crossed a threshold as of `today`, for one tenant."""
    ladder = reminder_days_for(tenant.settings)
    planned: list[PlannedReminder] = []

    deadline_rows = (
        await session.execute(
            select(Deadline, Client.legal_name, Client.business_name, Service.name)
            .join(Client, Client.id == Deadline.client_id)
            .outerjoin(Service, Service.id == Deadline.service_id)
            .where(
                Deadline.tenant_id == tenant.id,
                Deadline.status.in_(OPEN_DEADLINE_STATES),
            )
        )
    ).all()
    for deadline, legal_name, business_name, service_name in deadline_rows:
        # A snoozed deadline is deliberately quiet until the snooze runs out.
        if deadline.status == "snoozed" and deadline.snoozed_until and deadline.snoozed_until > today:
            continue
        item = plan_deadline_reminder(
            deadline_id=deadline.id,
            title=deadline.title,
            due_date=deadline.due_date,
            today=today,
            ladder=ladder,
            client_name=business_name or legal_name,
            service_name=service_name,
            client_id=deadline.client_id,
            assignee_id=deadline.assignee_id,
        )
        if item is not None:
            planned.append(item)

    task_rows = (
        await session.execute(
            select(Task, Client.legal_name, Client.business_name)
            .outerjoin(Client, Client.id == Task.client_id)
            .where(
                Task.tenant_id == tenant.id,
                Task.status.in_(OPEN_TASK_STATES),
                Task.due_date.is_not(None),
            )
        )
    ).all()
    for task, legal_name, business_name in task_rows:
        item = plan_task_reminder(
            task_id=task.id,
            title=task.title,
            due_date=task.due_date,
            today=today,
            ladder=ladder,
            client_name=business_name or legal_name,
            client_id=task.client_id,
            assignee_id=task.assignee_id,
        )
        if item is not None:
            planned.append(item)

    letter_rows = (
        await session.execute(
            select(EngagementLetter, Client.legal_name, Client.business_name)
            .join(Client, Client.id == EngagementLetter.client_id)
            .where(
                EngagementLetter.tenant_id == tenant.id,
                EngagementLetter.status.in_(UNSIGNED_LETTER_STATES),
                EngagementLetter.expires_at.is_not(None),
            )
        )
    ).all()
    for letter, legal_name, business_name in letter_rows:
        item = plan_letter_reminder(
            letter_id=letter.id,
            title=letter.title,
            due_date=letter.expires_at.date(),
            today=today,
            ladder=ladder,
            client_name=business_name or legal_name,
            client_id=letter.client_id,
        )
        if item is not None:
            planned.append(item)

    return planned


async def persist(
    session: AsyncSession, tenant_id: uuid.UUID, planned: Iterable[PlannedReminder]
) -> list[Reminder]:
    """Insert the planned reminders, ignoring any whose dedupe_key already
    exists, and return only the rows this call actually created.

    ON CONFLICT DO NOTHING (rather than a pre-flight SELECT) is what makes two
    sweeps racing each other safe — the unique index decides the winner, and
    RETURNING tells us which rows are new so only those get an email.
    """
    rows = list(planned)
    if not rows:
        return []

    values = [
        {
            "tenant_id": tenant_id,
            "kind": item.kind,
            "dedupe_key": item.dedupe_key,
            "deadline_id": item.deadline_id,
            "task_id": item.task_id,
            "letter_id": item.letter_id,
            "client_id": item.client_id,
            "assignee_id": item.assignee_id,
            "title": item.title,
            "body": item.body,
            "link": item.link,
            "due_date": item.due_date,
            "days_before": item.days_before,
            "severity": item.severity,
        }
        for item in rows
    ]

    statement = (
        pg_insert(Reminder)
        .values(values)
        .on_conflict_do_nothing(constraint="reminders_dedupe_unique")
        .returning(Reminder)
    )
    created = (await session.scalars(statement)).all()
    return list(created)


async def admin_recipients(session: AsyncSession, tenant_id: uuid.UUID) -> list[Profile]:
    """Firm owners/admins who should get the reminder email.

    Excludes client-portal logins (client_id set) — they must never receive a
    digest covering the firm's other clients.
    """
    return list(
        (
            await session.scalars(
                select(Profile).where(
                    Profile.tenant_id == tenant_id,
                    Profile.is_active.is_(True),
                    Profile.client_id.is_(None),
                    Profile.role.in_(("owner", "admin")),
                )
            )
        ).all()
    )
