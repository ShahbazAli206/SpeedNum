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
  email: string;
  full_name: string | null;
  title: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: UserRole;
  weekly_capacity: number;
  is_active: boolean;
  is_superadmin: boolean;
  created_at: string | null;
}

export interface TeamMember extends Profile {
  open_tasks: number;
  clients: number;
  overdue: number;
}

export interface Me {
  profile: Profile;
  tenant: Tenant | null;
  unread_notifications: number;
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
  expires_at: string | null;
  created_at: string | null;
  items: LetterItem[];
  share_url: string | null;
}

export interface PortalLetter {
  id: string;
  title: string;
  body: string | null;
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
  signature_data: string | null;
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
