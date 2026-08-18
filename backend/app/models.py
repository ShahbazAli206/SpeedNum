"""SQLAlchemy models mirroring db/migrations/0001_schema.sql."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    ARRAY,
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ENUM, JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def pg_enum(name: str, *values: str) -> ENUM:
    """Reference an enum that the SQL migrations already created."""
    return ENUM(*values, name=name, create_type=False)


USER_ROLES = ("owner", "admin", "member", "viewer")
CLIENT_STATUSES = ("prospect", "active", "inactive", "archived")
CLIENT_TYPES = ("corporation", "sole_proprietor", "partnership", "individual", "nonprofit", "trust")
FREQUENCIES = ("annual", "semi_annual", "quarterly", "monthly", "one_time")
PROJECT_STATUSES = ("not_started", "in_progress", "review", "complete", "on_hold")
TASK_STATUSES = ("todo", "in_progress", "review", "complete", "blocked")
TASK_PRIORITIES = ("low", "medium", "high", "urgent")
TASK_TYPES = ("internal", "client", "other")
DEADLINE_STATUSES = ("open", "snoozed", "filed", "dismissed")
LETTER_STATUSES = ("draft", "sent", "viewed", "signed", "declined", "void")
FIELD_TYPES = ("text", "number", "date", "select", "checkbox", "email", "phone")
CUSTOM_ENTITIES = ("client", "task", "project")

# Reminders (db/migrations/0007_reminders.sql)
REMINDER_STATUSES = ("open", "acknowledged", "snoozed", "done", "dismissed")
REMINDER_SEVERITIES = ("info", "warning", "critical")
REMINDER_KINDS = ("deadline", "task", "letter", "portal")

# Client-portal "books" (db/migrations/0004_client_books.sql)
INVOICE_STATUSES = ("draft", "sent", "paid", "overdue", "void")
EXPENSE_STATUSES = ("pending", "approved", "rejected")
EMPLOYMENT_TYPES = ("full_time", "part_time", "contract")
PAY_RUN_STATUSES = ("draft", "scheduled", "processed")
TAX_FILING_STATUSES = ("open", "filed", "overdue")
DOCUMENT_KINDS = ("invoice", "receipt", "tax", "contract", "statement", "other")


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[uuid.UUID] = _uuid_pk()
    name: Mapped[str] = mapped_column(Text, nullable=False)
    slug: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    legal_name: Mapped[str | None] = mapped_column(Text)
    email: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(Text)
    website: Mapped[str | None] = mapped_column(Text)
    address_line1: Mapped[str | None] = mapped_column(Text)
    address_line2: Mapped[str | None] = mapped_column(Text)
    city: Mapped[str | None] = mapped_column(Text)
    province: Mapped[str | None] = mapped_column(Text)
    postal_code: Mapped[str | None] = mapped_column(Text)
    country: Mapped[str] = mapped_column(Text, default="CA")
    logo_url: Mapped[str | None] = mapped_column(Text)
    brand_color: Mapped[str] = mapped_column(Text, default="#1d4ed8")
    accent_color: Mapped[str] = mapped_column(Text, default="#0f172a")
    custom_domain: Mapped[str | None] = mapped_column(Text)
    email_from_name: Mapped[str | None] = mapped_column(Text)
    letter_footer: Mapped[str | None] = mapped_column(Text)
    plan: Mapped[str] = mapped_column(Text, default="trial")
    seats: Mapped[int] = mapped_column(Integer, default=5)
    trial_ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    settings: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE")
    )
    # Set = this login is a client-portal user pinned to that client. Null = firm staff.
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE")
    )
    email: Mapped[str] = mapped_column(Text, nullable=False)
    full_name: Mapped[str | None] = mapped_column(Text)
    title: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(Text)
    avatar_url: Mapped[str | None] = mapped_column(Text)
    role: Mapped[str] = mapped_column(pg_enum("user_role", *USER_ROLES), default="member")
    weekly_capacity: Mapped[int] = mapped_column(Integer, default=40)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_superadmin: Mapped[bool] = mapped_column(Boolean, default=False)
    # True right after a client-portal invite/resend issues a temporary
    # password; cleared by POST /auth/complete-password-change.
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    notify_deadline_digest: Mapped[bool] = mapped_column(Boolean, default=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tenant: Mapped[Tenant | None] = relationship(lazy="joined")


class Invitation(Base):
    __tablename__ = "invitations"

    id: Mapped[uuid.UUID] = _uuid_pk()
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    email: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(pg_enum("user_role", *USER_ROLES), default="member")
    token: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    invited_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[uuid.UUID] = _uuid_pk()
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    code: Mapped[str | None] = mapped_column(Text)
    legal_name: Mapped[str] = mapped_column(Text, nullable=False)
    business_name: Mapped[str | None] = mapped_column(Text)
    client_type: Mapped[str] = mapped_column(pg_enum("client_type", *CLIENT_TYPES), default="corporation")
    status: Mapped[str] = mapped_column(pg_enum("client_status", *CLIENT_STATUSES), default="active")
    business_number: Mapped[str | None] = mapped_column(Text)
    gst_number: Mapped[str | None] = mapped_column(Text)
    payroll_number: Mapped[str | None] = mapped_column(Text)
    email: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(Text)
    address_line1: Mapped[str | None] = mapped_column(Text)
    address_line2: Mapped[str | None] = mapped_column(Text)
    city: Mapped[str | None] = mapped_column(Text)
    province: Mapped[str | None] = mapped_column(Text)
    postal_code: Mapped[str | None] = mapped_column(Text)
    country: Mapped[str] = mapped_column(Text, default="CA")
    year_end_month: Mapped[int] = mapped_column(SmallInteger, default=12)
    year_end_day: Mapped[int] = mapped_column(SmallInteger, default=31)
    incorporation_date: Mapped[date | None] = mapped_column(Date)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id"))
    annual_fee: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    onboarded_at: Mapped[date | None] = mapped_column(Date)
    portal_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    portal_invited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    portal_invited_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id"))
    notes: Mapped[str | None] = mapped_column(Text)
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    custom: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Contact(Base):
    __tablename__ = "contacts"

    id: Mapped[uuid.UUID] = _uuid_pk()
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    full_name: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(Text)
    role: Mapped[str | None] = mapped_column(Text)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Service(Base):
    __tablename__ = "services"

    id: Mapped[uuid.UUID] = _uuid_pk()
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    code: Mapped[str] = mapped_column(Text, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str] = mapped_column(Text, default="General")
    frequency: Mapped[str] = mapped_column(pg_enum("service_freq", *FREQUENCIES), default="annual")
    default_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    due_rule: Mapped[dict] = mapped_column(JSONB, default=dict)
    lead_time_days: Mapped[int] = mapped_column(Integer, default=30)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ClientService(Base):
    __tablename__ = "client_services"

    id: Mapped[uuid.UUID] = _uuid_pk()
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    service_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("services.id", ondelete="CASCADE"), nullable=False
    )
    price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    frequency_override: Mapped[str | None] = mapped_column(pg_enum("service_freq", *FREQUENCIES))
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id"))
    start_date: Mapped[date] = mapped_column(Date, server_default=func.current_date())
    end_date: Mapped[date | None] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    service: Mapped[Service] = relationship(lazy="joined")
    client: Mapped[Client] = relationship(lazy="joined")


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = _uuid_pk()
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    service_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("services.id"))
    name: Mapped[str] = mapped_column(Text, nullable=False)
    period_label: Mapped[str | None] = mapped_column(Text)
    period_start: Mapped[date | None] = mapped_column(Date)
    period_end: Mapped[date | None] = mapped_column(Date)
    due_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(pg_enum("project_status", *PROJECT_STATUSES), default="not_started")
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id"))
    budget_hours: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = _uuid_pk()
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE")
    )
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE")
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    # Independent of client_id — a "client" task may not name one specific
    # client, and client_id can theoretically be set without this being
    # "client" type (e.g. an internal note that happens to reference one).
    task_type: Mapped[str] = mapped_column(pg_enum("task_type", *TASK_TYPES), default="internal")
    status: Mapped[str] = mapped_column(pg_enum("task_status", *TASK_STATUSES), default="todo")
    priority: Mapped[str] = mapped_column(pg_enum("task_priority", *TASK_PRIORITIES), default="medium")
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id"))
    due_date: Mapped[date | None] = mapped_column(Date)
    estimate_hours: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    position: Mapped[int] = mapped_column(Integer, default=0)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    custom: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Deadline(Base):
    __tablename__ = "deadlines"

    id: Mapped[uuid.UUID] = _uuid_pk()
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    service_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("services.id"))
    client_service_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("client_services.id", ondelete="CASCADE")
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"))
    title: Mapped[str] = mapped_column(Text, nullable=False)
    period_label: Mapped[str | None] = mapped_column(Text)
    period_start: Mapped[date | None] = mapped_column(Date)
    period_end: Mapped[date | None] = mapped_column(Date)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(pg_enum("deadline_status", *DEADLINE_STATUSES), default="open")
    snoozed_until: Mapped[date | None] = mapped_column(Date)
    filed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id"))
    is_auto: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EngagementLetter(Base):
    __tablename__ = "engagement_letters"

    id: Mapped[uuid.UUID] = _uuid_pk()
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(Text, default="Engagement Letter")
    body: Mapped[str | None] = mapped_column(Text)
    terms_html: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(pg_enum("letter_status", *LETTER_STATUSES), default="draft")
    # server_default matches db/migrations/0001_schema.sql's DDL exactly. Without
    # it, SQLAlchemy has no way to know Postgres will fill this column in and
    # sends an explicit NULL on INSERT instead of omitting the column — which
    # this table's `not null` constraint then rejects. Every engagement-letter
    # creation (create_letter, duplicate_letter) was broken by this until fixed.
    token: Mapped[str] = mapped_column(
        Text, nullable=False, unique=True, server_default=text("encode(gen_random_bytes(24), 'hex')")
    )
    currency: Mapped[str] = mapped_column(Text, default="CAD")
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(5, 4), default=0)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    period_start: Mapped[date | None] = mapped_column(Date)
    period_end: Mapped[date | None] = mapped_column(Date)
    recipient_name: Mapped[str | None] = mapped_column(Text)
    recipient_email: Mapped[str | None] = mapped_column(Text)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    viewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    declined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decline_reason: Mapped[str | None] = mapped_column(Text)
    signer_name: Mapped[str | None] = mapped_column(Text)
    signer_title: Mapped[str | None] = mapped_column(Text)
    signature_data: Mapped[str | None] = mapped_column(Text)
    signature_ip: Mapped[str | None] = mapped_column(Text)
    firm_signer_name: Mapped[str | None] = mapped_column(Text)
    firm_signer_title: Mapped[str | None] = mapped_column(Text)
    firm_signature_data: Mapped[str | None] = mapped_column(Text)
    firm_signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pdf_path: Mapped[str | None] = mapped_column(Text)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    items: Mapped[list["EngagementLetterItem"]] = relationship(
        back_populates="letter", cascade="all, delete-orphan", lazy="selectin",
        order_by="EngagementLetterItem.position",
    )
    client: Mapped[Client] = relationship(lazy="joined")


class EngagementLetterItem(Base):
    __tablename__ = "engagement_letter_items"

    id: Mapped[uuid.UUID] = _uuid_pk()
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    letter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("engagement_letters.id", ondelete="CASCADE"), nullable=False
    )
    service_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("services.id"))
    description: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=1)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    position: Mapped[int] = mapped_column(Integer, default=0)

    letter: Mapped[EngagementLetter] = relationship(back_populates="items")


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = _uuid_pk()
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE")
    )
    letter_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("engagement_letters.id")
    )
    # Set when this row is a task attachment rather than a general client
    # file or a signed letter — not exclusive with client_id (a task linked
    # to a client can still be attached here).
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    mime_type: Mapped[str | None] = mapped_column(Text)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    kind: Mapped[str] = mapped_column(pg_enum("document_kind", *DOCUMENT_KINDS), default="other")
    is_client_visible: Mapped[bool] = mapped_column(Boolean, default=False)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TaskComment(Base):
    __tablename__ = "task_comments"

    id: Mapped[uuid.UUID] = _uuid_pk()
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False
    )
    author_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id"))
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_client_visible: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# -----------------------------------------------------------------------------
# Client-portal "books" — the client's own sales invoices, expenses, payroll and
# tax obligations, shown on the /dashboard/* surface. Distinct from the firm's
# side of the relationship (engagement_letters, Client.annual_fee) and from
# public.deadlines (the firm's internal filing work item for the same period).
# See db/migrations/0004_client_books.sql.
# -----------------------------------------------------------------------------
class ClientInvoice(Base):
    __tablename__ = "client_invoices"

    id: Mapped[uuid.UUID] = _uuid_pk()
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    number: Mapped[str] = mapped_column(Text, nullable=False)
    customer_name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    issued_on: Mapped[date] = mapped_column(Date, server_default=func.current_date())
    due_on: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    tax: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    currency: Mapped[str] = mapped_column(Text, default="CAD")
    status: Mapped[str] = mapped_column(pg_enum("invoice_status", *INVOICE_STATUSES), default="draft")
    paid_on: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ClientExpense(Base):
    __tablename__ = "client_expenses"

    id: Mapped[uuid.UUID] = _uuid_pk()
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    vendor: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(Text, default="General")
    spent_on: Mapped[date] = mapped_column(Date, server_default=func.current_date())
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    # GST/HST paid, tracked separately because it is the input tax credit.
    gst: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    status: Mapped[str] = mapped_column(pg_enum("expense_status", *EXPENSE_STATUSES), default="pending")
    method: Mapped[str | None] = mapped_column(Text)
    has_receipt: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ClientEmployee(Base):
    __tablename__ = "client_employees"

    id: Mapped[uuid.UUID] = _uuid_pk()
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    full_name: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str | None] = mapped_column(Text)
    employment_type: Mapped[str] = mapped_column(
        pg_enum("employment_type", *EMPLOYMENT_TYPES), default="full_time"
    )
    province: Mapped[str] = mapped_column(Text, default="AB")
    # Per pay period. Stored, not derived: CPP/EI/tax follow the rules in force
    # for that period, so recomputing an old run from today's rates would
    # silently rewrite history.
    gross: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    cpp: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    ei: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    income_tax: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    net: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    started_on: Mapped[date | None] = mapped_column(Date)
    ended_on: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ClientPayRun(Base):
    __tablename__ = "client_pay_runs"

    id: Mapped[uuid.UUID] = _uuid_pk()
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    period_label: Mapped[str] = mapped_column(Text, nullable=False)
    period_start: Mapped[date | None] = mapped_column(Date)
    period_end: Mapped[date | None] = mapped_column(Date)
    pay_date: Mapped[date] = mapped_column(Date, nullable=False)
    employee_count: Mapped[int] = mapped_column(Integer, default=0)
    gross: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    deductions: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    net: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    status: Mapped[str] = mapped_column(pg_enum("pay_run_status", *PAY_RUN_STATUSES), default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ClientTaxObligation(Base):
    __tablename__ = "client_tax_obligations"

    id: Mapped[uuid.UUID] = _uuid_pk()
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    deadline_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("deadlines.id"))
    name: Mapped[str] = mapped_column(Text, nullable=False)
    authority: Mapped[str] = mapped_column(Text, default="CRA")
    period_label: Mapped[str | None] = mapped_column(Text)
    due_on: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    status: Mapped[str] = mapped_column(pg_enum("tax_filing_status", *TAX_FILING_STATUSES), default="open")
    filed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reference: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = _uuid_pk()
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    profile_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE")
    )
    type: Mapped[str] = mapped_column(Text, default="info")
    title: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(Text)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Reminder(Base):
    """A countdown crossing a threshold — "10 days left", "3 days overdue".

    Separate from Notification: a notification is a one-shot feed entry that is
    either read or not, whereas a reminder is a work item the firm acknowledges,
    snoozes or dismisses while the underlying deadline stays open. The sweep in
    services/reminders.py writes both — one reminder row per (source, threshold),
    deduplicated on `dedupe_key`, plus a notification so it shows in the bell.
    See db/migrations/0007_reminders.sql.
    """

    __tablename__ = "reminders"

    id: Mapped[uuid.UUID] = _uuid_pk()
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    dedupe_key: Mapped[str] = mapped_column(Text, nullable=False)
    deadline_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("deadlines.id", ondelete="CASCADE")
    )
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE")
    )
    letter_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("engagement_letters.id", ondelete="CASCADE")
    )
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE")
    )
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id"))
    title: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(Text)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    days_before: Mapped[int] = mapped_column(Integer, nullable=False)
    severity: Mapped[str] = mapped_column(
        pg_enum("reminder_severity", *REMINDER_SEVERITIES), default="info"
    )
    status: Mapped[str] = mapped_column(pg_enum("reminder_status", *REMINDER_STATUSES), default="open")
    snoozed_until: Mapped[date | None] = mapped_column(Date)
    emailed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    acknowledged_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CustomField(Base):
    __tablename__ = "custom_fields"

    id: Mapped[uuid.UUID] = _uuid_pk()
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    entity: Mapped[str] = mapped_column(pg_enum("custom_entity", *CUSTOM_ENTITIES), default="client")
    key: Mapped[str] = mapped_column(Text, nullable=False)
    label: Mapped[str] = mapped_column(Text, nullable=False)
    field_type: Mapped[str] = mapped_column(pg_enum("field_type", *FIELD_TYPES), default="text")
    options: Mapped[list] = mapped_column(JSONB, default=list)
    help_text: Mapped[str | None] = mapped_column(Text)
    is_required: Mapped[bool] = mapped_column(Boolean, default=False)
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE")
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id"))
    actor_email: Mapped[str | None] = mapped_column(Text)
    action: Mapped[str] = mapped_column(Text, nullable=False)
    entity: Mapped[str] = mapped_column(Text, nullable=False)
    entity_id: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    audit_metadata: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    ip_address: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Lead(Base):
    __tablename__ = "leads"

    id: Mapped[uuid.UUID] = _uuid_pk()
    name: Mapped[str | None] = mapped_column(Text)
    email: Mapped[str] = mapped_column(Text, nullable=False)
    firm_name: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(Text)
    message: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String, default="website")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DesktopRelease(Base):
    __tablename__ = "desktop_releases"

    id: Mapped[uuid.UUID] = _uuid_pk()
    version: Mapped[str] = mapped_column(Text, nullable=False)
    platform: Mapped[str] = mapped_column(Text, default="windows-x64")
    installer_url: Mapped[str] = mapped_column(Text, nullable=False)
    sha256: Mapped[str] = mapped_column(Text, nullable=False)
    release_notes: Mapped[str | None] = mapped_column(Text)
    released_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
