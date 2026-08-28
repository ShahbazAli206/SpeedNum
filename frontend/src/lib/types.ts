/** Mirrors backend/app/schemas.py. */

export type UserRole = "owner" | "admin" | "member" | "viewer";
export type ClientStatus = "prospect" | "active" | "inactive" | "archived";
export type ClientType =
  | "corporation"
  | "sole_proprietor"
  | "partnership"
  | "individual"
  | "nonprofit"
  | "trust";
export type Frequency = "annual" | "semi_annual" | "quarterly" | "monthly" | "one_time";
export type ProjectStatus = "not_started" | "in_progress" | "review" | "complete" | "on_hold";
export type TaskStatus = "todo" | "in_progress" | "review" | "complete" | "blocked";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskType = "internal" | "client" | "other";
export type DeadlineStatus = "open" | "snoozed" | "filed" | "dismissed";
export type LetterStatus = "draft" | "sent" | "viewed" | "signed" | "declined" | "void";
export type FieldType = "text" | "number" | "date" | "select" | "checkbox" | "email" | "phone";
export type CustomEntity = "client" | "task" | "project";
export type Urgency = "overdue" | "due_soon" | "upcoming" | "filed" | "dismissed" | "snoozed";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  legal_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string;
  logo_url: string | null;
  brand_color: string;
  accent_color: string;
  custom_domain: string | null;
  email_from_name: string | null;
  letter_footer: string | null;
  plan: string;
  seats: number;
  trial_ends_at: string | null;
  is_active: boolean;
  settings: Record<string, unknown>;
  created_at: string | null;
}

export interface Profile {
  id: string;
  tenant_id: string | null;
  /**
   * Set = this login is a client-portal account pinned to that client; null =
   * firm staff. The one field that decides which app a user belongs in, so
   * routing and shell selection both read it (see lib/session.tsx).
   */
  client_id: string | null;
  email: string;
  full_name: string | null;
  title: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: UserRole;
  /** Tenant-defined Role (see PermissionKey/RoleRow below) this profile is
   * granted through. Null for Owner/superadmin and for any profile not yet
   * assigned a custom role — see backend/app/permissions.py. */
  role_id: string | null;
  weekly_capacity: number;
  is_active: boolean;
  is_superadmin: boolean;
  must_change_password: boolean;
  /** Owners/admins only — whether this profile receives the daily
   * deadline/task digest email (backend/app/services/reminders.py's
   * admin_recipients). Self-service via PATCH /auth/me. */
  notify_deadline_digest: boolean;
  created_at: string | null;
}

export interface TeamMember extends Profile {
  open_tasks: number;
  clients: number;
  overdue: number;
}

/* -------------------------------------------------------------------------- */
/* Team notes — GET/POST/DELETE /team/{id}/notes.                              */
/* -------------------------------------------------------------------------- */
export interface TeamNoteApi {
  id: string;
  profile_id: string;
  author_name: string;
  body: string;
  created_at: string;
}

export interface Me {
  profile: Profile;
  tenant: Tenant | null;
  unread_notifications: number;
  /** True when a platform superadmin is viewing this firm via impersonation.
   *  The firm shell shows the "viewing as superadmin / exit to platform"
   *  banner off this flag. */
  is_impersonating?: boolean;
  /** This login's fully-resolved permission set (see PermissionKey below),
   * computed server-side — see backend/app/permissions.py's has_permission.
   * Owner/superadmin carry every key true. */
  permissions?: Record<string, boolean>;
}

/* -------------------------------------------------------------------------- */
/* Roles & permissions — GET/POST/PATCH/DELETE /roles.                        */
/* -------------------------------------------------------------------------- */

/** Mirrors backend/app/permissions.PERMISSION_KEYS. Kept as a plain string
 * union here (not re-derived from the API) so a permission-gated component
 * still type-checks even before the catalogue has loaded. */
export type PermissionKey =
  | "clients.view_all"
  | "clients.manage"
  | "clients.delete"
  | "clients.assign"
  | "services.manage"
  | "tasks.view_all"
  | "tasks.manage";

export interface PermissionInfo {
  key: PermissionKey;
  label: string;
  description: string;
}

/** GET /settings/seats — see backend/app/seats.py. A null *_seats means
 * unlimited (no cap set on the tenant). */
export interface SeatUsage {
  staff_used: number;
  staff_seats: number | null;
  client_used: number;
  client_seats: number | null;
}

export interface RoleRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  permissions: Partial<Record<PermissionKey, boolean>>;
  member_count: number;
  created_at: string | null;
}

export interface Invitation {
  id: string;
  email: string;
  role: UserRole;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  invite_url: string | null;
}

export interface Client {
  id: string;
  tenant_id: string;
  code: string | null;
  legal_name: string;
  business_name: string | null;
  client_type: ClientType;
  status: ClientStatus;
  business_number: string | null;
  gst_number: string | null;
  payroll_number: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string;
  year_end_month: number;
  year_end_day: number;
  incorporation_date: string | null;
  owner_id: string | null;
  owner_name: string | null;
  annual_fee: number;
  onboarded_at: string | null;
  portal_enabled: boolean;
  portal_invited_at: string | null;
  notes: string | null;
  tags: string[];
  custom: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
  open_tasks: number;
  open_deadlines: number;
  overdue_deadlines: number;
  next_due_date: string | null;
  service_count: number;
  /** True once a client-portal login has actually authenticated — unlike
   *  `portal_enabled`, which just means an invite was sent. */
  portal_signed_in: boolean;
}

/** Response for POST /clients/{id}/portal-invite — covers both the first
 * invite and a resend. */
export interface PortalInviteResult {
  ok: boolean;
  email: string;
  invited_at: string;
  email_sent: boolean;
  message: string;
  temp_password: string;
  login_url: string;
}

export interface Contact {
  id: string;
  client_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string | null;
}

export interface Service {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
  frequency: Frequency;
  default_price: number;
  due_rule: Record<string, unknown>;
  lead_time_days: number;
  is_active: boolean;
  client_count: number;
  created_at: string | null;
}

export interface ClientServiceLink {
  id: string;
  client_id: string;
  service_id: string;
  service_name: string | null;
  service_code: string | null;
  client_name: string | null;
  frequency: Frequency | null;
  price: number | null;
  frequency_override: Frequency | null;
  assignee_id: string | null;
  assignee_name: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  notes: string | null;
}

export interface Project {
  id: string;
  client_id: string;
  client_name: string | null;
  service_id: string | null;
  name: string;
  period_label: string | null;
  period_start: string | null;
  period_end: string | null;
  due_date: string | null;
  status: ProjectStatus;
  assignee_id: string | null;
  assignee_name: string | null;
  budget_hours: number | null;
  notes: string | null;
  task_count: number;
  completed_tasks: number;
  created_at: string | null;
}

export interface Task {
  id: string;
  project_id: string | null;
  client_id: string | null;
  client_name: string | null;
  project_name: string | null;
  title: string;
  description: string | null;
  task_type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string | null;
  assignee_name: string | null;
  due_date: string | null;
  estimate_hours: number | null;
  position: number;
  completed_at: string | null;
  custom: Record<string, unknown>;
  created_at: string | null;
}

export interface Deadline {
  id: string;
  client_id: string;
  client_name: string | null;
  service_id: string | null;
  service_code: string | null;
  title: string;
  period_label: string | null;
  period_start: string | null;
  period_end: string | null;
  due_date: string;
  status: DeadlineStatus;
  urgency: Urgency;
  days_remaining: number;
  snoozed_until: string | null;
  filed_at: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  is_auto: boolean;
  notes: string | null;
}

export interface LetterItem {
  id: string;
  service_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  position: number;
}

export interface Letter {
  id: string;
  client_id: string;
  client_name: string | null;
  title: string;
  body: string | null;
  terms_html: string | null;
  status: LetterStatus;
  token: string;
  currency: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  period_start: string | null;
  period_end: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  signer_name: string | null;
  signer_title: string | null;
  signature_data: string | null;
  firm_signer_name: string | null;
  firm_signer_title: string | null;
  firm_signature_data: string | null;
  firm_signed_at: string | null;
  expires_at: string | null;
  created_at: string | null;
  items: LetterItem[];
  share_url: string | null;
}

export interface PortalLetter {
  id: string;
  title: string;
  body: string | null;
  terms_html: string | null;
  status: LetterStatus;
  currency: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  period_start: string | null;
  period_end: string | null;
  client_name: string;
  recipient_name: string | null;
  signed_at: string | null;
  signer_name: string | null;
  signer_title: string | null;
  signature_data: string | null;
  firm_signer_name: string | null;
  firm_signer_title: string | null;
  firm_signature_data: string | null;
  firm_signed_at: string | null;
  expires_at: string | null;
  items: LetterItem[];
  brand: {
    firm_name: string;
    logo_url: string | null;
    brand_color: string;
    letter_footer: string | null;
  };
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/* Reminders — GET /reminders. Mirrors backend/app/schemas.py ReminderRead.     */
/* -------------------------------------------------------------------------- */
export type ReminderKind = "deadline" | "task" | "letter" | "portal";
export type ReminderStatus = "open" | "acknowledged" | "snoozed" | "done" | "dismissed";
export type ReminderSeverity = "info" | "warning" | "critical";
export type ReminderUrgency = "overdue" | "due_today" | "due_soon" | "upcoming";

export interface Reminder {
  id: string;
  kind: ReminderKind;
  title: string;
  body: string | null;
  link: string | null;
  due_date: string;
  /** The lead-time rung that fired: 10 = "10 days left", -3 = "3 days overdue". */
  days_before: number;
  severity: ReminderSeverity;
  status: ReminderStatus;
  snoozed_until: string | null;
  emailed_at: string | null;
  acknowledged_at: string | null;
  client_id: string | null;
  deadline_id: string | null;
  task_id: string | null;
  letter_id: string | null;
  assignee_id: string | null;
  created_at: string;
  client_name: string | null;
  assignee_name: string | null;
  days_remaining: number;
  urgency: ReminderUrgency;
}

export interface ReminderCounts {
  open: number;
  overdue: number;
  due_today: number;
  due_soon: number;
  upcoming: number;
  /** Still status "open" — nobody has looked at it yet. */
  unacknowledged: number;
}

export interface ReminderBoard {
  generated_at: string;
  counts: ReminderCounts;
  reminders: Reminder[];
}

export interface ReminderSweepResult {
  created: number;
  skipped: number;
  emailed: number;
  scanned: number;
  message: string;
}

/* -------------------------------------------------------------------------- */
/* Platform accounts — GET /users                                              */
/* -------------------------------------------------------------------------- */
export interface PlatformAccount extends Profile {
  source: "team" | "client";
  client_name: string | null;
  last_sign_in: string | null;
}

/** POST /team, POST /users, POST /users/{id}/resend-credentials. */
export interface CredentialResult {
  profile_id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  /** Shown once so an admin can pass it on when email isn't configured. */
  temp_password: string;
  login_url: string;
  email_sent: boolean;
  message: string;
}

export interface UserImportOutcome {
  email: string;
  full_name: string | null;
  created: boolean;
  temp_password: string | null;
  email_sent: boolean;
  error: string | null;
}

export interface UserImportResult {
  created: number;
  failed: number;
  emailed: number;
  accounts: UserImportOutcome[];
  errors: string[];
}

export interface TenantImportOutcome {
  name: string;
  slug: string | null;
  admin_email: string;
  created: boolean;
  temp_password: string | null;
  email_sent: boolean;
  error: string | null;
}

export interface TenantImportResult {
  created: number;
  failed: number;
  emailed: number;
  tenants: TenantImportOutcome[];
  errors: string[];
}

export interface CustomField {
  id: string;
  entity: CustomEntity;
  key: string;
  label: string;
  field_type: FieldType;
  options: string[];
  help_text: string | null;
  is_required: boolean;
  position: number;
}

export interface AuditEntry {
  id: number;
  actor_email: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  summary: string | null;
  created_at: string;
}

export interface Dashboard {
  firm_name: string;
  clients_total: number;
  clients_active: number;
  deadlines: {
    overdue: number;
    due_soon: number;
    upcoming: number;
    filed_this_month: number;
  };
  tasks_open: number;
  tasks_due_this_week: number;
  letters_awaiting_signature: number;
  revenue_under_contract: number;
  /** Real invoice-derived figures (ClientInvoice.status) — distinct from the
   * contract-value projection above; an unpaid invoice is never "paid". */
  revenue: { invoiced: number; paid: number; outstanding: number; overdue: number };
  next_deadlines: Deadline[];
  recent_activity: AuditEntry[];
  workload: { id: string; name: string; open_tasks: number }[];
}

export interface Reporting {
  generated_at: string;
  clients_by_status: { key: string; count: number }[];
  clients_by_type: { key: string; count: number }[];
  revenue_by_service: { key: string; category: string; amount: number; clients: number }[];
  deadlines_by_month: { key: string; count: number; filed: number }[];
  tasks_by_status: { key: string; count: number }[];
  workload: {
    key: string;
    open_tasks: number;
    estimated_hours: number;
    weekly_capacity: number;
  }[];
  on_time_filing_rate: number;
  total_annual_fees: number;
  average_fee: number;
  letters: Record<string, number>;
  deadlines_open: { overdue: number; due_soon: number; upcoming: number };
  portal_enabled_clients: number;
}

export interface ImportPreview {
  columns: string[];
  detected_mapping: Record<string, string>;
  rows: { row: number; data: Record<string, unknown>; errors: string[] }[];
  total_rows: number;
  valid_rows: number;
}

export interface ImportResult {
  created: number;
  updated: number;
  failed: number;
  errors: string[];
}

/* -------------------------------------------------------------------------- */
/* Client-portal books (invoices, expenses, payroll, taxes, documents)        */
/*                                                                            */
/* Backs /dashboard/*. lib/demo.ts is the current source for those pages —   */
/* swap a page to these once NEXT_PUBLIC_API_URL is configured and a         */
/* session exists to call /api/v1/client-portal/*. Field names match         */
/* schemas.py exactly (snake_case), unlike demo.ts's camelCase.              */
/* -------------------------------------------------------------------------- */
export type PortalInvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "void";
export type PortalExpenseStatus = "pending" | "approved" | "rejected";
export type EmploymentType = "full_time" | "part_time" | "contract";
export type PayRunStatus = "draft" | "scheduled" | "processed";
export type TaxFilingStatus = "open" | "filed" | "overdue";
export type PortalDocumentKind = "invoice" | "receipt" | "tax" | "contract" | "statement" | "other";

export interface ClientInvoice {
  id: string;
  client_id: string;
  client_name: string | null;
  number: string;
  customer_name: string;
  description: string | null;
  issued_on: string;
  due_on: string;
  amount: number;
  tax: number;
  currency: string;
  status: PortalInvoiceStatus;
  paid_on: string | null;
  notes: string | null;
  created_at: string | null;
}

export interface ClientInvoiceTotals {
  billed: number;
  collected: number;
  outstanding: number;
  overdue: number;
  count: number;
  overdue_count: number;
}

export interface ClientExpense {
  id: string;
  client_id: string;
  client_name: string | null;
  vendor: string;
  category: string;
  spent_on: string;
  amount: number;
  gst: number;
  status: PortalExpenseStatus;
  method: string | null;
  has_receipt: boolean;
  notes: string | null;
  created_at: string | null;
}

export interface CategoryTotal {
  label: string;
  value: number;
}

/* -------------------------------------------------------------------------- */
/* Client-portal messages — GET/POST /client-portal/messages.                  */
/* -------------------------------------------------------------------------- */
export interface ClientMessage {
  id: string;
  client_id: string;
  client_name: string | null;
  sender_name: string;
  is_from_client: boolean;
  subject: string | null;
  body: string;
  is_read: boolean;
  created_at: string;
}

export interface ClientExpenseTotals {
  total: number;
  approved: number;
  pending: number;
  pending_value: number;
  categories: number;
  gst_paid: number;
}

export interface ClientEmployee {
  id: string;
  client_id: string;
  full_name: string;
  role: string | null;
  employment_type: EmploymentType;
  province: string;
  gross: number;
  cpp: number;
  ei: number;
  income_tax: number;
  net: number;
  is_active: boolean;
  started_on: string | null;
  ended_on: string | null;
}

export interface ClientPayRun {
  id: string;
  client_id: string;
  period_label: string;
  period_start: string | null;
  period_end: string | null;
  pay_date: string;
  employee_count: number;
  gross: number;
  deductions: number;
  net: number;
  status: PayRunStatus;
}

export interface PayrollTotals {
  active: number;
  monthly_gross: number;
  monthly_net: number;
  remittance: number;
  next_run: ClientPayRun | null;
}

export interface ClientTaxObligation {
  id: string;
  client_id: string;
  client_name: string | null;
  deadline_id: string | null;
  name: string;
  authority: string;
  period_label: string | null;
  due_on: string;
  amount: number;
  status: TaxFilingStatus;
  filed_at: string | null;
  reference: string | null;
  notes: string | null;
  days_remaining: number;
}

export interface TaxTotals {
  gst_owing: number;
  corporate_estimate: number;
  input_tax_credits: number;
  total_owing: number;
  next: ClientTaxObligation | null;
}

export interface ClientDocument {
  id: string;
  client_id: string | null;
  name: string;
  kind: PortalDocumentKind;
  mime_type: string | null;
  size_bytes: number | null;
  is_client_visible: boolean;
  uploaded_by_name: string | null;
  created_at: string | null;
}

export interface TaskAttachment {
  id: string;
  task_id: string;
  name: string;
  kind: PortalDocumentKind;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by_name: string | null;
  created_at: string | null;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string | null;
  author_name: string | null;
  body: string;
  is_client_visible: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface DocumentTotals {
  count: number;
  bytes: number;
  shared: number;
}

export interface PortalMonthPoint {
  x: string;
  revenue: number;
  expenses: number;
  net: number;
}

export interface ClientBookOverview {
  revenue_mtd: number;
  revenue_change: number;
  expenses_mtd: number;
  expenses_change: number;
  net_mtd: number;
  net_change: number;
  cash_position: number;
  cash_change: number;
  outstanding: number;
  overdue_count: number;
  tax_owing: number;
  pending_expenses: number;
  monthly: PortalMonthPoint[];
  client_first_name: string | null;
  client_business_name: string | null;
  fiscal_year_end: string | null;
  accountant_name: string | null;
}

export interface AdminTenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  seats: number;
  is_active: boolean;
  custom_domain: string | null;
  trial_ends_at: string | null;
  created_at: string | null;
  clients: number;
  users: number;
  signed_letters: number;
}

/** GET /desktop/latest — public, unauthenticated. Mirrors
 * backend/app/schemas.py's DesktopReleasePublic. */
export interface DesktopRelease {
  version: string;
  platform: string;
  installer: string;
  sha256: string;
  released_at: string;
  release_notes: string | null;
}
