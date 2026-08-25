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
ReminderKind = Literal["deadline", "task", "letter", "portal"]
ReminderStatus = Literal["open", "acknowledged", "snoozed", "done", "dismissed"]
ReminderSeverity = Literal["info", "warning", "critical"]


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
    notify_deadline_digest: bool = True
    created_at: datetime | None = None


class ProfileUpdate(BaseModel):
    full_name: str | None = None
    title: str | None = None
    phone: str | None = None
    avatar_url: str | None = None
    role: UserRole | None = None
    weekly_capacity: int | None = None
    is_active: bool | None = None
    notify_deadline_digest: bool | None = None


class TeamMemberRead(ProfileRead):
    open_tasks: int = 0
    clients: int = 0
    overdue: int = 0


class StaffCreate(BaseModel):
    """Create a firm staff (accountant) login directly, rather than emailing an
    invitation link and waiting for them to sign themselves up."""

    email: EmailStr
    full_name: str = Field(min_length=1, max_length=120)
    role: UserRole = "member"
    title: str | None = Field(default=None, max_length=80)
    phone: str | None = Field(default=None, max_length=40)
    weekly_capacity: int = Field(default=40, ge=0, le=168)
    send_email: bool = True


class CredentialResult(BaseModel):
    """The outcome of provisioning (or re-provisioning) a login.

    `temp_password` is echoed back exactly once, so an admin can pass it on by
    hand when mail delivery is not configured. It is never stored — Supabase
    keeps only its hash.
    """

    profile_id: uuid.UUID
    email: str
    full_name: str | None = None
    role: UserRole = "member"
    temp_password: str
    login_url: str
    email_sent: bool = False
    message: str = ""


class PlatformUserRead(ProfileRead):
    """A row on the Users page: every login in the firm, staff and client alike.

    `source` distinguishes them so the UI can label and filter without
    re-deriving the rule from client_id everywhere.
    """

    source: Literal["team", "client"] = "team"
    client_name: str | None = None
    last_sign_in: datetime | None = None


class PlatformUserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=120)
    role: UserRole = "member"
    title: str | None = Field(default=None, max_length=80)
    phone: str | None = Field(default=None, max_length=40)
    # Set to create a client-portal login pinned to that client instead of firm
    # staff. The role is then forced to "member" — see services/accounts.py.
    client_id: uuid.UUID | None = None
    send_email: bool = True


class PlatformUserUpdate(BaseModel):
    full_name: str | None = None
    title: str | None = None
    phone: str | None = None
    role: UserRole | None = None
    is_active: bool | None = None
    must_change_password: bool | None = None


class MeResponse(BaseModel):
    profile: ProfileRead
    tenant: TenantRead | None = None
    unread_notifications: int = 0
    # True when a platform superadmin is viewing this firm via impersonation
    # (deps.CurrentUser.impersonating). The firm shell shows a "viewing as
    # superadmin / exit to platform" banner off this flag.
    is_impersonating: bool = False


# --- Platform superadmin console (cross-tenant) ------------------------------
# The tenants surface at frontend/src/app/(firm)/admin: every firm on the
# platform, with create / edit / suspend / delete / impersonate / resend-invite.
# `max_clients` / `max_users` / `is_demo` live in Tenant.settings (JSONB) so no
# migration is needed; null caps read as unlimited.
class TenantAdminSummary(BaseModel):
    """One row in the tenants table."""

    id: uuid.UUID
    name: str
    slug: str
    plan: str
    seats: int
    is_active: bool
    is_demo: bool = False
    custom_domain: str | None = None
    admin_email: str | None = None
    trial_ends_at: datetime | None = None
    created_at: datetime | None = None
    clients: int = 0
    users: int = 0
    signed_letters: int = 0
    max_clients: int | None = None
    max_users: int | None = None


class TenantAdminDetail(TenantAdminSummary):
    """The tenant detail page: the summary plus firm profile and the admin login."""

    legal_name: str | None = None
    email: str | None = None
    phone: str | None = None
    website: str | None = None
    brand_color: str = "#1d4ed8"
    accent_color: str = "#0f172a"
    logo_url: str | None = None
    email_from_name: str | None = None
    admin_id: uuid.UUID | None = None
    admin_name: str | None = None
    admin_last_seen: datetime | None = None


class TenantAdminCreate(BaseModel):
    """Provision a brand-new firm and its first admin login in one step."""

    name: str = Field(min_length=2, max_length=120)
    admin_email: EmailStr
    admin_name: str = Field(default="", max_length=120)
    slug: str | None = Field(default=None, max_length=120)
    plan: str = Field(default="trial", max_length=40)
    custom_domain: str | None = Field(default=None, max_length=200)
    max_clients: int | None = Field(default=None, ge=0)
    max_users: int | None = Field(default=None, ge=0)
    is_demo: bool = False
    send_email: bool = True


class TenantAdminEdit(BaseModel):
    """Edit an existing firm — the superadmin edit-tenant form."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    slug: str | None = Field(default=None, min_length=1, max_length=120)
    email: str | None = Field(default=None, max_length=200)
    custom_domain: str | None = Field(default=None, max_length=200)
    plan: str | None = Field(default=None, max_length=40)
    is_active: bool | None = None
    max_clients: int | None = Field(default=None, ge=0)
    max_users: int | None = Field(default=None, ge=0)
    is_demo: bool | None = None


class ImpersonateResult(BaseModel):
    """A short-lived access token that puts the caller (a superadmin) into a
    firm. No refresh token — the superadmin's own session refreshes it back
    into being (frontend re-mints on each refresh while the act_as cookie is
    set), and dropping that cookie ends the impersonation."""

    access_token: str
    expires_in: int
    tenant_id: uuid.UUID
    tenant_name: str


class TenantProvisionResult(BaseModel):
    """The outcome of POST /admin/tenants — the new firm plus its admin's
    one-time credentials (echoed once so the superadmin can hand them over if
    email delivery isn't configured)."""

    tenant: TenantAdminDetail
    admin: CredentialResult


class BootstrapRequest(BaseModel):
    firm_name: str = Field(min_length=2, max_length=120)
    full_name: str | None = None


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    full_name: str = Field(min_length=1, max_length=200)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class AuthResult(BaseModel):
    """Access token only — the refresh token travels as an HttpOnly cookie,
    never in a JSON body a script could read."""

    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    profile: ProfileRead


class OAuthStartResponse(BaseModel):
    authorize_url: str


class OAuthCallbackRequest(BaseModel):
    code: str = Field(min_length=1)
    state: str = Field(min_length=1)


class OAuthResult(AuthResult):
    """Same shape as a password login, plus whether this was a brand-new
    account — the frontend sends a new account through firm-bootstrap next,
    same as a fresh /auth/register, since it has no tenant yet."""

    is_new_account: bool
    next_path: str | None = None


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=1)
    password: str = Field(min_length=8, max_length=200)


class VerifyEmailRequest(BaseModel):
    token: str = Field(min_length=1)


class ChangePasswordRequest(BaseModel):
    """`current_password` is optional so the "replace an admin-issued
    temporary password" flow (ForcePasswordModal) can keep skipping it — that
    flow is already gated by holding a valid session minted from the
    temporary password itself. A voluntary "change my password" settings
    feature must pass it: without a current-password check, anyone who gets
    hold of an already-authenticated session (a shared computer, a stolen
    unlocked laptop) could silently take over the account by setting a new
    password with no proof they knew the old one."""

    current_password: str | None = None
    new_password: str = Field(min_length=8, max_length=200)


class MagicLoginRequest(BaseModel):
    token: str = Field(min_length=1)


class InvitationCreate(BaseModel):
    email: EmailStr
    role: UserRole = "member"


class InvitationAccept(BaseModel):
    token: str = Field(min_length=8)
    full_name: str | None = None


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
    # True once a client-portal login for this client has actually
    # authenticated — as opposed to `portal_enabled`, which just means an
    # invite was sent. Always False on a just-created client (no aggregates
    # run yet) and on one never invited to begin with.
    portal_signed_in: bool = False


class PortalInviteResult(BaseModel):
    """Response for POST /clients/{id}/portal-invite — covers both the first
    invite and a resend (which issues a fresh temporary password either way,
    since the original is never retrievable once hashed)."""

    ok: bool = True
    email: str
    invited_at: datetime
    email_sent: bool
    message: str
    # Same reasoning as CredentialResult.temp_password/login_url above: when
    # email_sent is false, this is the ONLY way the inviting staff member
    # can act on this endpoint's own "share the credentials manually"
    # message — accounts.provision()/reissue() already generate the
    # password and accounts.login_url() the URL, neither was threaded
    # through to the response.
    temp_password: str
    login_url: str


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


class TaskAttachmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=260)
    kind: DocumentKind = "other"
    storage_path: str = Field(min_length=1, max_length=500)
    mime_type: str | None = None
    size_bytes: int | None = Field(default=None, ge=0)


class TaskAttachmentRead(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    name: str
    kind: DocumentKind
    mime_type: str | None = None
    size_bytes: int | None = None
    uploaded_by_name: str | None = None
    created_at: datetime | None = None


class TaskCommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=10_000)
    # Staff-only in practice — see the router's enforcement, not this schema:
    # a client-portal caller's comment is always forced client-visible
    # (there's nothing to hide from yourself), regardless of what's sent here.
    is_client_visible: bool = False


class TaskCommentUpdate(BaseModel):
    body: str = Field(min_length=1, max_length=10_000)


class TaskCommentRead(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    author_id: uuid.UUID | None = None
    author_name: str | None = None
    body: str
    is_client_visible: bool = False
    created_at: datetime | None = None
    updated_at: datetime | None = None


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


class NotificationCounts(BaseModel):
    """Badge-only payload for GET /notifications/unread-count."""

    unread: int = 0


# --- Reminders ----------------------------------------------------------------
class ReminderRead(ORMModel):
    id: uuid.UUID
    kind: ReminderKind
    title: str
    body: str | None = None
    link: str | None = None
    due_date: date
    days_before: int
    severity: ReminderSeverity
    status: ReminderStatus
    snoozed_until: date | None = None
    emailed_at: datetime | None = None
    acknowledged_at: datetime | None = None
    client_id: uuid.UUID | None = None
    deadline_id: uuid.UUID | None = None
    task_id: uuid.UUID | None = None
    letter_id: uuid.UUID | None = None
    assignee_id: uuid.UUID | None = None
    created_at: datetime
    # Layered on at read time by the router.
    client_name: str | None = None
    assignee_name: str | None = None
    days_remaining: int = 0
    urgency: Literal["overdue", "due_today", "due_soon", "upcoming"] = "upcoming"


class ReminderSnoozeRequest(BaseModel):
    until: date


class ReminderCounts(BaseModel):
    open: int = 0
    overdue: int = 0
    due_today: int = 0
    due_soon: int = 0
    upcoming: int = 0
    unacknowledged: int = 0


class ReminderBoard(BaseModel):
    generated_at: datetime
    counts: ReminderCounts
    reminders: list[ReminderRead]


class ReminderSweepResult(BaseModel):
    created: int = 0
    skipped: int = 0
    emailed: int = 0
    scanned: int = 0
    message: str = ""


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


class PlatformAuditLogRead(AuditLogRead):
    """Same shape as AuditLogRead, plus which tenant it happened in — only
    meaningful across the platform superadmin's cross-tenant view."""

    tenant_name: str | None = None


# --- Dashboard & reporting ----------------------------------------------------
class DeadlineBuckets(BaseModel):
    overdue: int = 0
    due_soon: int = 0
    upcoming: int = 0
    filed_this_month: int = 0


class RevenueSummary(BaseModel):
    """Real invoice-derived figures — distinct from `revenue_under_contract`,
    which is a contract-value *projection* (annualized service pricing, never
    touches ClientInvoice). `paid` only ever counts invoices actually marked
    paid; an unpaid invoice is never counted as received revenue."""

    invoiced: float = 0.0
    paid: float = 0.0
    outstanding: float = 0.0
    overdue: float = 0.0


class DashboardResponse(BaseModel):
    firm_name: str
    clients_total: int
    clients_active: int
    deadlines: DeadlineBuckets
    tasks_open: int
    tasks_due_this_week: int
    letters_awaiting_signature: int
    revenue_under_contract: float
    revenue: RevenueSummary
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
    deadlines_open: dict[str, int]
    portal_enabled_clients: int


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


class UserImportRow(BaseModel):
    """One row of the bulk user import, after the operator has reviewed it."""

    email: EmailStr
    full_name: str = Field(min_length=1, max_length=120)
    role: UserRole = "member"
    title: str | None = None
    phone: str | None = None
    # Either resolves a client by name/code in the sheet, or is set directly.
    client_id: uuid.UUID | None = None


class UserImportOutcome(BaseModel):
    email: str
    full_name: str | None = None
    created: bool
    # Echoed once so the operator can hand it over when mail is unconfigured;
    # never stored (see services/local_auth.generate_temp_password).
    temp_password: str | None = None
    email_sent: bool = False
    error: str | None = None


class UserImportResult(BaseModel):
    created: int
    failed: int
    emailed: int
    accounts: list[UserImportOutcome] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


class TenantImportOutcome(BaseModel):
    name: str
    slug: str | None = None
    admin_email: str
    created: bool
    temp_password: str | None = None
    email_sent: bool = False
    error: str | None = None


class TenantImportResult(BaseModel):
    created: int
    failed: int
    emailed: int
    tenants: list[TenantImportOutcome] = Field(default_factory=list)
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


# --- Client-portal messages -----------------------------------------------------
class ClientMessageCreate(BaseModel):
    subject: str | None = Field(default=None, max_length=200)
    body: str = Field(min_length=1, max_length=5000)


class ClientMessageRead(ORMModel):
    id: uuid.UUID
    client_id: uuid.UUID
    client_name: str | None = None
    sender_name: str
    is_from_client: bool
    subject: str | None = None
    body: str
    is_read: bool
    created_at: datetime | None = None


class ClientMessageCounts(BaseModel):
    unread: int = 0


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


class DocumentUploadUrlRequest(BaseModel):
    name: str = Field(min_length=1, max_length=260)


class DocumentUploadUrl(BaseModel):
    """A signed slot to upload into.

    The server picks `storage_path` — the browser never does. Every path is
    minted under `{tenant_id}/{client_id}/`, and `register_document` refuses any
    path outside the caller's own prefix, so a forged value cannot be pointed at
    another firm's or another client's object.
    """

    storage_path: str
    #: For supabase-js `uploadToSignedUrl(path, token, file)`.
    token: str
    #: The same signed slot as an absolute URL, for a plain PUT.
    url: str


class DocumentDownloadUrl(BaseModel):
    url: str
    expires_in: int


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
    # Portal-only identity fields for the dashboard greeting — null for a firm
    # staff caller (client_id is None, so there's no single client to name).
    client_first_name: str | None = None
    client_business_name: str | None = None
    fiscal_year_end: str | None = None
    accountant_name: str | None = None


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


# --- Desktop releases -----------------------------------------------------


class DesktopReleasePublic(BaseModel):
    """GET /desktop/latest's response shape -- public, no auth, no secrets.
    Consumed by the web dashboard's download button and (indirectly, via the
    website) by anyone deciding whether to fetch the installer."""

    version: str
    platform: str
    installer: str
    sha256: str
    released_at: datetime
    release_notes: str | None = None


class DesktopReleaseRead(DesktopReleasePublic):
    """Same public fields plus the bookkeeping an admin list view wants."""

    id: uuid.UUID
    created_at: datetime


class DesktopReleaseCreate(BaseModel):
    version: str = Field(min_length=1, max_length=32)
    platform: str = Field(default="windows-x64", max_length=32)
    installer_url: str = Field(min_length=1, max_length=500)
    sha256: str = Field(min_length=64, max_length=64)
    release_notes: str | None = Field(default=None, max_length=4000)
