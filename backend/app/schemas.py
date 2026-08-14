"""Pydantic request/response models."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

UserRole = Literal["owner", "admin", "member", "viewer"]
ClientStatus = Literal["prospect", "active", "inactive", "archived"]
ClientType = Literal["corporation", "sole_proprietor", "partnership", "individual", "nonprofit", "trust"]
Frequency = Literal["annual", "semi_annual", "quarterly", "monthly", "one_time"]
ProjectStatus = Literal["not_started", "in_progress", "review", "complete", "on_hold"]
TaskStatus = Literal["todo", "in_progress", "review", "complete", "blocked"]
TaskPriority = Literal["low", "medium", "high", "urgent"]
TaskType = Literal["internal", "client", "other"]
DeadlineStatus = Literal["open", "snoozed", "filed", "dismissed"]
LetterStatus = Literal["draft", "sent", "viewed", "signed", "declined", "void"]
FieldType = Literal["text", "number", "date", "select", "checkbox", "email", "phone"]
CustomEntity = Literal["client", "task", "project"]
Urgency = Literal["overdue", "due_soon", "upcoming", "filed", "dismissed", "snoozed"]
InvoiceStatus = Literal["draft", "sent", "paid", "overdue", "void"]
ExpenseStatus = Literal["pending", "approved", "rejected"]
EmploymentType = Literal["full_time", "part_time", "contract"]
PayRunStatus = Literal["draft", "scheduled", "processed"]
TaxFilingStatus = Literal["open", "filed", "overdue"]
DocumentKind = Literal["invoice", "receipt", "tax", "contract", "statement", "other"]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- Tenant / profile ---------------------------------------------------------
class TenantRead(ORMModel):
    id: uuid.UUID
    name: str
    slug: str
    legal_name: str | None = None
    email: str | None = None
    phone: str | None = None
    website: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    province: str | None = None
    postal_code: str | None = None
    country: str = "CA"
    logo_url: str | None = None
    brand_color: str = "#1d4ed8"
    accent_color: str = "#0f172a"
    custom_domain: str | None = None
    email_from_name: str | None = None
    letter_footer: str | None = None
    plan: str = "trial"
    seats: int = 5
    trial_ends_at: datetime | None = None
    is_active: bool = True
    settings: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None


class TenantUpdate(BaseModel):
    name: str | None = None
    legal_name: str | None = None
    email: str | None = None
    phone: str | None = None
    website: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    province: str | None = None
    postal_code: str | None = None
    country: str | None = None
    logo_url: str | None = None
    brand_color: str | None = None
    accent_color: str | None = None
    custom_domain: str | None = None
    email_from_name: str | None = None
    letter_footer: str | None = None
    settings: dict[str, Any] | None = None


class ProfileRead(ORMModel):
    id: uuid.UUID
    tenant_id: uuid.UUID | None = None
    # Set = this login is a client-portal user pinned to that client. Null = firm staff.
    client_id: uuid.UUID | None = None
    email: str
    full_name: str | None = None
    title: str | None = None
    phone: str | None = None
    avatar_url: str | None = None
    role: UserRole = "member"
    weekly_capacity: int = 40
    is_active: bool = True
    is_superadmin: bool = False
    must_change_password: bool = False
    created_at: datetime | None = None


class ProfileUpdate(BaseModel):
    full_name: str | None = None
    title: str | None = None
    phone: str | None = None
    avatar_url: str | None = None
    role: UserRole | None = None
    weekly_capacity: int | None = None
    is_active: bool | None = None


class TeamMemberRead(ProfileRead):
    open_tasks: int = 0
    clients: int = 0
    overdue: int = 0


class MeResponse(BaseModel):
    profile: ProfileRead
    tenant: TenantRead | None = None
    unread_notifications: int = 0


class BootstrapRequest(BaseModel):
    firm_name: str = Field(min_length=2, max_length=120)
    full_name: str | None = None


class InvitationCreate(BaseModel):
    email: EmailStr
    role: UserRole = "member"


class InvitationRead(ORMModel):
    id: uuid.UUID
    email: str
    role: UserRole
    token: str
    expires_at: datetime
    accepted_at: datetime | None = None
    created_at: datetime
    invite_url: str | None = None


# --- Clients ------------------------------------------------------------------
class ClientBase(BaseModel):
    code: str | None = None
    legal_name: str = Field(min_length=1, max_length=200)
    business_name: str | None = None
    client_type: ClientType = "corporation"
    status: ClientStatus = "active"
    business_number: str | None = None
    gst_number: str | None = None
    payroll_number: str | None = None
    email: str | None = None
    phone: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    province: str | None = None
    postal_code: str | None = None
    country: str = "CA"
    year_end_month: int = Field(default=12, ge=1, le=12)
    year_end_day: int = Field(default=31, ge=1, le=31)
    incorporation_date: date | None = None
    owner_id: uuid.UUID | None = None
    annual_fee: float = 0
    onboarded_at: date | None = None
    portal_enabled: bool = False
    notes: str | None = None
    tags: list[str] = Field(default_factory=list)
    custom: dict[str, Any] = Field(default_factory=dict)


class ClientCreate(ClientBase):
    pass


class ClientUpdate(BaseModel):
    code: str | None = None
    legal_name: str | None = None
    business_name: str | None = None
    client_type: ClientType | None = None
    status: ClientStatus | None = None
    business_number: str | None = None
    gst_number: str | None = None
    payroll_number: str | None = None
    email: str | None = None
    phone: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    province: str | None = None
    postal_code: str | None = None
    country: str | None = None
    year_end_month: int | None = Field(default=None, ge=1, le=12)
    year_end_day: int | None = Field(default=None, ge=1, le=31)
    incorporation_date: date | None = None
    owner_id: uuid.UUID | None = None
    annual_fee: float | None = None
    onboarded_at: date | None = None
    portal_enabled: bool | None = None
    notes: str | None = None
    tags: list[str] | None = None
    custom: dict[str, Any] | None = None


class ClientRead(ORMModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    code: str | None = None
    legal_name: str
    business_name: str | None = None
    client_type: ClientType
    status: ClientStatus
    business_number: str | None = None
    gst_number: str | None = None
    payroll_number: str | None = None
    email: str | None = None
    phone: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    province: str | None = None
    postal_code: str | None = None
    country: str = "CA"
    year_end_month: int
    year_end_day: int
    incorporation_date: date | None = None
    owner_id: uuid.UUID | None = None
    owner_name: str | None = None
    annual_fee: float = 0
    onboarded_at: date | None = None
    portal_enabled: bool = False
    portal_invited_at: datetime | None = None
    notes: str | None = None
    tags: list[str] = Field(default_factory=list)
    custom: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None
    updated_at: datetime | None = None
    # aggregates, filled by list/detail endpoints
    open_tasks: int = 0
    open_deadlines: int = 0
    overdue_deadlines: int = 0
    next_due_date: date | None = None
    service_count: int = 0


class PortalInviteResult(BaseModel):
    """Response for POST /clients/{id}/portal-invite — covers both the first
    invite and a resend (which issues a fresh temporary password either way,
    since the original is never retrievable once hashed)."""

    ok: bool = True
    email: str
    invited_at: datetime
    email_sent: bool
    message: str


class ContactBase(BaseModel):
    full_name: str = Field(min_length=1, max_length=160)
    email: str | None = None
    phone: str | None = None
    role: str | None = None
    is_primary: bool = False
    notes: str | None = None


class ContactCreate(ContactBase):
    client_id: uuid.UUID


class ContactUpdate(BaseModel):
    full_name: str | None = None
    email: str | None = None
    phone: str | None = None
    role: str | None = None
    is_primary: bool | None = None
    notes: str | None = None


class ContactRead(ORMModel):
    id: uuid.UUID
    client_id: uuid.UUID
    full_name: str
    email: str | None = None
    phone: str | None = None
    role: str | None = None
    is_primary: bool = False
    notes: str | None = None
    created_at: datetime | None = None


# --- Services -----------------------------------------------------------------
class ServiceBase(BaseModel):
    code: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=160)
    description: str | None = None
    category: str = "General"
    frequency: Frequency = "annual"
    default_price: float = 0
    due_rule: dict[str, Any] = Field(
        default_factory=lambda: {"type": "offset_from_period_end", "months": 6, "period_basis": "fiscal"}
    )
    lead_time_days: int = 30
    is_active: bool = True


class ServiceCreate(ServiceBase):
    pass


class ServiceUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    description: str | None = None
    category: str | None = None
    frequency: Frequency | None = None
    default_price: float | None = None
    due_rule: dict[str, Any] | None = None
    lead_time_days: int | None = None
    is_active: bool | None = None


class ServiceRead(ORMModel):
    id: uuid.UUID
    code: str
    name: str
    description: str | None = None
    category: str
    frequency: Frequency
    default_price: float
    due_rule: dict[str, Any]
    lead_time_days: int
    is_active: bool
    client_count: int = 0
    created_at: datetime | None = None


class ClientServiceCreate(BaseModel):
    client_id: uuid.UUID
    service_id: uuid.UUID
    price: float | None = None
    frequency_override: Frequency | None = None
    assignee_id: uuid.UUID | None = None
    start_date: date | None = None
    end_date: date | None = None
    notes: str | None = None


class ClientServiceUpdate(BaseModel):
    price: float | None = None
    frequency_override: Frequency | None = None
    assignee_id: uuid.UUID | None = None
    start_date: date | None = None
    end_date: date | None = None
    is_active: bool | None = None
    notes: str | None = None


class ClientServiceRead(ORMModel):
    id: uuid.UUID
    client_id: uuid.UUID
    service_id: uuid.UUID
    service_name: str | None = None
    service_code: str | None = None
    client_name: str | None = None
    frequency: Frequency | None = None
    price: float | None = None
    frequency_override: Frequency | None = None
    assignee_id: uuid.UUID | None = None
    assignee_name: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    is_active: bool = True
    notes: str | None = None


# --- Projects & tasks ---------------------------------------------------------
class ProjectCreate(BaseModel):
    client_id: uuid.UUID
    service_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=160)
    period_label: str | None = None
    period_start: date | None = None
    period_end: date | None = None
    due_date: date | None = None
    status: ProjectStatus = "not_started"
    assignee_id: uuid.UUID | None = None
    budget_hours: float | None = None
    notes: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    service_id: uuid.UUID | None = None
    period_label: str | None = None
    period_start: date | None = None
    period_end: date | None = None
    due_date: date | None = None
    status: ProjectStatus | None = None
    assignee_id: uuid.UUID | None = None
    budget_hours: float | None = None
    notes: str | None = None


class ProjectRead(ORMModel):
    id: uuid.UUID
    client_id: uuid.UUID
    client_name: str | None = None
    service_id: uuid.UUID | None = None
    name: str
    period_label: str | None = None
    period_start: date | None = None
    period_end: date | None = None
    due_date: date | None = None
    status: ProjectStatus
    assignee_id: uuid.UUID | None = None
    assignee_name: str | None = None
    budget_hours: float | None = None
    notes: str | None = None
    task_count: int = 0
    completed_tasks: int = 0
    created_at: datetime | None = None


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    project_id: uuid.UUID | None = None
    client_id: uuid.UUID | None = None
    task_type: TaskType = "internal"
    status: TaskStatus = "todo"
    priority: TaskPriority = "medium"
    assignee_id: uuid.UUID | None = None
    due_date: date | None = None
    estimate_hours: float | None = None
    position: int | None = None
    custom: dict[str, Any] = Field(default_factory=dict)


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    project_id: uuid.UUID | None = None
    client_id: uuid.UUID | None = None
    task_type: TaskType | None = None
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    assignee_id: uuid.UUID | None = None
    due_date: date | None = None
    estimate_hours: float | None = None
    position: int | None = None
    custom: dict[str, Any] | None = None


class TaskMove(BaseModel):
    status: TaskStatus
    position: int = 0


class TaskRead(ORMModel):
    id: uuid.UUID
    project_id: uuid.UUID | None = None
    client_id: uuid.UUID | None = None
    client_name: str | None = None
    project_name: str | None = None
    title: str
    description: str | None = None
    task_type: TaskType = "internal"
    status: TaskStatus
    priority: TaskPriority
    assignee_id: uuid.UUID | None = None
    assignee_name: str | None = None
    due_date: date | None = None
    estimate_hours: float | None = None
    position: int = 0
    completed_at: datetime | None = None
    custom: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None


# --- Deadlines ----------------------------------------------------------------
class DeadlineCreate(BaseModel):
    client_id: uuid.UUID
    service_id: uuid.UUID | None = None
    title: str = Field(min_length=1, max_length=200)
    period_label: str | None = None
    period_start: date | None = None
    period_end: date | None = None
    due_date: date
    assignee_id: uuid.UUID | None = None
    notes: str | None = None


class DeadlineUpdate(BaseModel):
    title: str | None = None
    due_date: date | None = None
    status: DeadlineStatus | None = None
    snoozed_until: date | None = None
    assignee_id: uuid.UUID | None = None
    notes: str | None = None


class DeadlineRead(ORMModel):
    id: uuid.UUID
    client_id: uuid.UUID
    client_name: str | None = None
    service_id: uuid.UUID | None = None
    service_code: str | None = None
    title: str
    period_label: str | None = None
    period_start: date | None = None
    period_end: date | None = None
    due_date: date
    status: DeadlineStatus
    urgency: Urgency = "upcoming"
    days_remaining: int = 0
    snoozed_until: date | None = None
    filed_at: datetime | None = None
    assignee_id: uuid.UUID | None = None
    assignee_name: str | None = None
    is_auto: bool = True
    notes: str | None = None


class DeadlineGenerateRequest(BaseModel):
    client_id: uuid.UUID | None = None
    horizon_months: int = Field(default=18, ge=1, le=60)


class DeadlineGenerateResult(BaseModel):
    created: int
    skipped: int
    clients_processed: int


# --- Engagement letters -------------------------------------------------------
class LetterItemInput(BaseModel):
    service_id: uuid.UUID | None = None
    description: str = Field(min_length=1, max_length=300)
    quantity: float = 1
    unit_price: float = 0


class LetterItemRead(ORMModel):
    id: uuid.UUID
    service_id: uuid.UUID | None = None
    description: str
    quantity: float
    unit_price: float
    amount: float
    position: int


class LetterCreate(BaseModel):
    client_id: uuid.UUID
    title: str = "Engagement Letter"
    body: str | None = None
    terms_html: str | None = None
    currency: str = "CAD"
    tax_rate: float = 0
    period_start: date | None = None
    period_end: date | None = None
    recipient_name: str | None = None
    recipient_email: str | None = None
    items: list[LetterItemInput] = Field(default_factory=list)


class LetterUpdate(BaseModel):
    title: str | None = None
    body: str | None = None
    terms_html: str | None = None
    currency: str | None = None
    tax_rate: float | None = None
    period_start: date | None = None
    period_end: date | None = None
    recipient_name: str | None = None
    recipient_email: str | None = None
    items: list[LetterItemInput] | None = None


class LetterRead(ORMModel):
    id: uuid.UUID
    client_id: uuid.UUID
    client_name: str | None = None
    title: str
    body: str | None = None
    terms_html: str | None = None
    status: LetterStatus
    token: str
    currency: str
    subtotal: float
    tax_rate: float
    tax_amount: float
    total: float
    period_start: date | None = None
    period_end: date | None = None
    recipient_name: str | None = None
    recipient_email: str | None = None
    sent_at: datetime | None = None
    viewed_at: datetime | None = None
    signed_at: datetime | None = None
    declined_at: datetime | None = None
    decline_reason: str | None = None
    signer_name: str | None = None
    signer_title: str | None = None
    signature_data: str | None = None
    firm_signer_name: str | None = None
    firm_signer_title: str | None = None
    firm_signature_data: str | None = None
    firm_signed_at: datetime | None = None
    expires_at: datetime | None = None
    created_at: datetime | None = None
    items: list[LetterItemRead] = Field(default_factory=list)
    share_url: str | None = None


class LetterSendRequest(BaseModel):
    recipient_email: EmailStr | None = None
    recipient_name: str | None = None
    message: str | None = None


# --- Public portal ------------------------------------------------------------
class PortalBrand(BaseModel):
    firm_name: str
    logo_url: str | None = None
    brand_color: str = "#1d4ed8"
    letter_footer: str | None = None


class PortalLetter(BaseModel):
    id: uuid.UUID
    title: str
    body: str | None = None
    terms_html: str | None = None
    status: LetterStatus
    currency: str
    subtotal: float
    tax_rate: float
    tax_amount: float
    total: float
    period_start: date | None = None
    period_end: date | None = None
    client_name: str
    recipient_name: str | None = None
    signed_at: datetime | None = None
    signer_name: str | None = None
    signer_title: str | None = None
    signature_data: str | None = None
    firm_signer_name: str | None = None
    firm_signer_title: str | None = None
    firm_signature_data: str | None = None
    firm_signed_at: datetime | None = None
    expires_at: datetime | None = None
    items: list[LetterItemRead] = Field(default_factory=list)
    brand: PortalBrand


class PortalSignRequest(BaseModel):
    signer_name: str = Field(min_length=2, max_length=120)
    signer_title: str | None = None
    signature_data: str = Field(min_length=32, description="PNG data URL produced by the signature pad")
    agreed: bool = True


class PortalDeclineRequest(BaseModel):
    reason: str | None = None


class FirmSignRequest(BaseModel):
    signer_name: str = Field(min_length=2, max_length=120)
    signer_title: str | None = None
    signature_data: str = Field(min_length=32, description="PNG data URL produced by the signature pad")


class MarkSignedRequest(BaseModel):
    signer_name: str | None = None
    signer_title: str | None = None


# --- Notifications / custom fields / audit ------------------------------------
class NotificationRead(ORMModel):
    id: uuid.UUID
    type: str
    title: str
    body: str | None = None
    link: str | None = None
    is_read: bool
    created_at: datetime


class CustomFieldCreate(BaseModel):
    entity: CustomEntity = "client"
    key: str = Field(min_length=1, max_length=48, pattern=r"^[a-z0-9_]+$")
    label: str = Field(min_length=1, max_length=80)
    field_type: FieldType = "text"
    options: list[str] = Field(default_factory=list)
    help_text: str | None = None
    is_required: bool = False
    position: int = 0


class CustomFieldUpdate(BaseModel):
    label: str | None = None
    field_type: FieldType | None = None
    options: list[str] | None = None
    help_text: str | None = None
    is_required: bool | None = None
    position: int | None = None


class CustomFieldRead(ORMModel):
    id: uuid.UUID
    entity: CustomEntity
    key: str
    label: str
    field_type: FieldType
    options: list[Any] = Field(default_factory=list)
    help_text: str | None = None
    is_required: bool
    position: int


class AuditLogRead(BaseModel):
    id: int
    actor_email: str | None = None
    action: str
    entity: str
    entity_id: str | None = None
    summary: str | None = None
    created_at: datetime


# --- Dashboard & reporting ----------------------------------------------------
class DeadlineBuckets(BaseModel):
    overdue: int = 0
    due_soon: int = 0
    upcoming: int = 0
    filed_this_month: int = 0


class DashboardResponse(BaseModel):
    firm_name: str
    clients_total: int
    clients_active: int
    deadlines: DeadlineBuckets
    tasks_open: int
    tasks_due_this_week: int
    letters_awaiting_signature: int
    revenue_under_contract: float
    next_deadlines: list[DeadlineRead]
    recent_activity: list[AuditLogRead]
    workload: list[dict[str, Any]]


class ReportingResponse(BaseModel):
    generated_at: datetime
    clients_by_status: list[dict[str, Any]]
    clients_by_type: list[dict[str, Any]]
    revenue_by_service: list[dict[str, Any]]
    deadlines_by_month: list[dict[str, Any]]
    tasks_by_status: list[dict[str, Any]]
    workload: list[dict[str, Any]]
    on_time_filing_rate: float
    total_annual_fees: float
    average_fee: float
    letters: dict[str, int]


# --- CSV import ---------------------------------------------------------------
class ImportPreviewRow(BaseModel):
    row: int
    data: dict[str, Any]
    errors: list[str] = Field(default_factory=list)


class ImportPreview(BaseModel):
    columns: list[str]
    detected_mapping: dict[str, str]
    rows: list[ImportPreviewRow]
    total_rows: int
    valid_rows: int


class ImportCommitRequest(BaseModel):
    mapping: dict[str, str]
    rows: list[dict[str, Any]]
    update_existing: bool = True


class ImportResult(BaseModel):
    created: int
    updated: int
    failed: int
    errors: list[str] = Field(default_factory=list)


# --- Client-portal books (invoices, expenses, payroll, taxes, documents) ------
# The client's own bookkeeping, shown on /dashboard/*. Distinct from the firm's
# side (engagement_letters, Client.annual_fee) and from DeadlineRead (the firm's
# internal filing work item for the same period). See db/migrations/0004.
class ClientInvoiceBase(BaseModel):
    number: str = Field(min_length=1, max_length=40)
    customer_name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    issued_on: date
    due_on: date
    amount: float = 0
    tax: float = 0
    currency: str = "CAD"
    status: InvoiceStatus = "draft"
    notes: str | None = None


class ClientInvoiceCreate(ClientInvoiceBase):
    pass


class ClientInvoiceUpdate(BaseModel):
    number: str | None = None
    customer_name: str | None = None
    description: str | None = None
    issued_on: date | None = None
    due_on: date | None = None
    amount: float | None = None
    tax: float | None = None
    currency: str | None = None
    status: InvoiceStatus | None = None
    notes: str | None = None


class ClientInvoiceRead(ORMModel):
    id: uuid.UUID
    client_id: uuid.UUID
    client_name: str | None = None
    number: str
    customer_name: str
    description: str | None = None
    issued_on: date
    due_on: date
    amount: float
    tax: float
    currency: str
    status: InvoiceStatus
    paid_on: date | None = None
    notes: str | None = None
    created_at: datetime | None = None


class ClientInvoiceTotals(BaseModel):
    billed: float = 0
    collected: float = 0
    outstanding: float = 0
    overdue: float = 0
    count: int = 0
    overdue_count: int = 0


class ClientExpenseBase(BaseModel):
    vendor: str = Field(min_length=1, max_length=200)
    category: str = "General"
    spent_on: date
    amount: float = 0
    gst: float = 0
    method: str | None = None
    has_receipt: bool = False
    notes: str | None = None


class ClientExpenseCreate(ClientExpenseBase):
    pass


class ClientExpenseUpdate(BaseModel):
    vendor: str | None = None
    category: str | None = None
    spent_on: date | None = None
    amount: float | None = None
    gst: float | None = None
    method: str | None = None
    has_receipt: bool | None = None
    notes: str | None = None


class ClientExpenseRead(ORMModel):
    id: uuid.UUID
    client_id: uuid.UUID
    client_name: str | None = None
    vendor: str
    category: str
    spent_on: date
    amount: float
    gst: float
    status: ExpenseStatus
    method: str | None = None
    has_receipt: bool = False
    notes: str | None = None
    created_at: datetime | None = None


class CategoryTotal(BaseModel):
    label: str
    value: float


class ClientExpenseTotals(BaseModel):
    total: float = 0
    approved: float = 0
    pending: int = 0
    pending_value: float = 0
    categories: int = 0
    gst_paid: float = 0


class ClientEmployeeBase(BaseModel):
    full_name: str = Field(min_length=1, max_length=160)
    role: str | None = None
    employment_type: EmploymentType = "full_time"
    province: str = "AB"
    gross: float = 0
    cpp: float = 0
    ei: float = 0
    income_tax: float = 0
    net: float = 0
    started_on: date | None = None


class ClientEmployeeCreate(ClientEmployeeBase):
    pass


class ClientEmployeeUpdate(BaseModel):
    full_name: str | None = None
    role: str | None = None
    employment_type: EmploymentType | None = None
    province: str | None = None
    gross: float | None = None
    cpp: float | None = None
    ei: float | None = None
    income_tax: float | None = None
    net: float | None = None
    is_active: bool | None = None
    ended_on: date | None = None


class ClientEmployeeRead(ORMModel):
    id: uuid.UUID
    client_id: uuid.UUID
    full_name: str
    role: str | None = None
    employment_type: EmploymentType
    province: str
    gross: float
    cpp: float
    ei: float
    income_tax: float
    net: float
    is_active: bool = True
    started_on: date | None = None
    ended_on: date | None = None


class ClientPayRunBase(BaseModel):
    period_label: str = Field(min_length=1, max_length=80)
    period_start: date | None = None
    period_end: date | None = None
    pay_date: date
    employee_count: int = 0
    gross: float = 0
    deductions: float = 0
    net: float = 0
    status: PayRunStatus = "draft"


class ClientPayRunCreate(ClientPayRunBase):
    pass


class ClientPayRunUpdate(BaseModel):
    period_label: str | None = None
    period_start: date | None = None
    period_end: date | None = None
    pay_date: date | None = None
    employee_count: int | None = None
    gross: float | None = None
    deductions: float | None = None
    net: float | None = None
    status: PayRunStatus | None = None


class ClientPayRunRead(ORMModel):
    id: uuid.UUID
    client_id: uuid.UUID
    period_label: str
    period_start: date | None = None
    period_end: date | None = None
    pay_date: date
    employee_count: int
    gross: float
    deductions: float
    net: float
    status: PayRunStatus


class PayrollTotals(BaseModel):
    active: int = 0
    monthly_gross: float = 0
    monthly_net: float = 0
    remittance: float = 0
    next_run: ClientPayRunRead | None = None


class ClientTaxObligationBase(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    authority: str = "CRA"
    period_label: str | None = None
    due_on: date
    amount: float = 0
    reference: str | None = None
    notes: str | None = None


class ClientTaxObligationCreate(ClientTaxObligationBase):
    deadline_id: uuid.UUID | None = None


class ClientTaxObligationUpdate(BaseModel):
    name: str | None = None
    authority: str | None = None
    period_label: str | None = None
    due_on: date | None = None
    amount: float | None = None
    status: TaxFilingStatus | None = None
    reference: str | None = None
    notes: str | None = None


class ClientTaxObligationRead(ORMModel):
    id: uuid.UUID
    client_id: uuid.UUID
    client_name: str | None = None
    deadline_id: uuid.UUID | None = None
    name: str
    authority: str
    period_label: str | None = None
    due_on: date
    amount: float
    status: TaxFilingStatus
    filed_at: datetime | None = None
    reference: str | None = None
    notes: str | None = None
    # computed at read time, mirrors DeadlineRead.days_remaining
    days_remaining: int = 0


class TaxTotals(BaseModel):
    gst_owing: float = 0
    corporate_estimate: float = 0
    input_tax_credits: float = 0
    total_owing: float = 0
    next: ClientTaxObligationRead | None = None


class ClientDocumentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=260)
    kind: DocumentKind = "other"
    storage_path: str = Field(min_length=1, max_length=500)
    mime_type: str | None = None
    size_bytes: int | None = Field(default=None, ge=0)
    is_client_visible: bool = False


class ClientDocumentRead(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID | None = None
    name: str
    kind: DocumentKind
    mime_type: str | None = None
    size_bytes: int | None = None
    is_client_visible: bool = False
    uploaded_by_name: str | None = None
    created_at: datetime | None = None


class DocumentTotals(BaseModel):
    count: int = 0
    bytes: int = 0
    shared: int = 0


class MonthPoint(BaseModel):
    x: str
    revenue: float
    expenses: float
    net: float


class ClientBookOverview(BaseModel):
    """Mirrors frontend/src/lib/demo.ts::getOverview() — same shape, real numbers."""

    revenue_mtd: float = 0
    revenue_change: float = 0
    expenses_mtd: float = 0
    expenses_change: float = 0
    net_mtd: float = 0
    net_change: float = 0
    cash_position: float = 0
    cash_change: float = 0
    outstanding: float = 0
    overdue_count: int = 0
    tax_owing: float = 0
    pending_expenses: int = 0
    monthly: list[MonthPoint] = Field(default_factory=list)


# --- Misc ---------------------------------------------------------------------
class LeadCreate(BaseModel):
    email: EmailStr
    name: str | None = None
    firm_name: str | None = None
    phone: str | None = None
    message: str | None = None
    source: str = "website"


class Ok(BaseModel):
    ok: bool = True
    message: str | None = None
