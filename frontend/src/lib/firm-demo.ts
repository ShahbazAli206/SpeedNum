/**
 * Demo data for the firm-side app.
 *
 * Shapes deliberately mirror `backend/app/schemas.py` (and therefore
 * `src/lib/types.ts`), so replacing these getters with `api<T>()` calls is a
 * per-page change rather than a rewrite. Where a field is computed by the
 * backend (open_tasks, overdue counts, next_due_date) it is computed here too,
 * from the same underlying records — never hand-typed, so the numbers on every
 * page agree the way they would in production.
 *
 * Deterministic throughout: no Math.random, no Date.now. "Today" is pinned to
 * TODAY below so day-counts are stable between server and client renders.
 */

import type {
  ClientStatus,
  ClientType,
  DeadlineStatus,
  Frequency,
  LetterStatus,
  ProjectStatus,
  TaskPriority,
  TaskStatus,
  Urgency,
  UserRole,
} from "./types";

/** Pinned "today" — the whole dataset is dated relative to this. */
export const TODAY = "2026-08-05";

const MS_PER_DAY = 86_400_000;

function parse(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Whole days from TODAY to `date`. Negative means the date has passed. */
export function daysFromToday(date: string): number {
  return Math.round((parse(date) - parse(TODAY)) / MS_PER_DAY);
}

function urgencyFor(days: number, status: DeadlineStatus): Urgency {
  if (status === "filed") return "filed";
  if (status === "dismissed") return "dismissed";
  if (status === "snoozed") return "snoozed";
  if (days < 0) return "overdue";
  if (days <= 14) return "due_soon";
  return "upcoming";
}

/* -------------------------------------------------------------------------- */
/* The firm                                                                    */
/* -------------------------------------------------------------------------- */

export const FIRM = {
  name: "Harrison CPA",
  legalName: "Harrison Chartered Professional Accountants LLP",
  slug: "harrison-cpa",
  city: "Toronto",
  province: "ON",
  plan: "Full platform",
  brandColor: "#0a8f4e",
  signedInAs: {
    name: "Sarah Johnson",
    email: "sarah@harrisoncpa.ca",
    title: "Managing Partner",
    role: "owner" as UserRole,
  },
};

/* -------------------------------------------------------------------------- */
/* Team                                                                        */
/* -------------------------------------------------------------------------- */

export interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  title: string;
  role: UserRole;
  weekly_capacity: number;
  is_active: boolean;
}

const TEAM: TeamMember[] = [
  { id: "u1", full_name: "Sarah Johnson", email: "sarah@harrisoncpa.ca", title: "Managing Partner", role: "owner", weekly_capacity: 30, is_active: true },
  { id: "u2", full_name: "Michael Chen", email: "michael@harrisoncpa.ca", title: "Tax Partner", role: "admin", weekly_capacity: 34, is_active: true },
  { id: "u3", full_name: "Emily Carter", email: "emily@harrisoncpa.ca", title: "Senior Accountant", role: "member", weekly_capacity: 37.5, is_active: true },
  { id: "u4", full_name: "David Thompson", email: "david@harrisoncpa.ca", title: "Accountant", role: "member", weekly_capacity: 37.5, is_active: true },
  { id: "u5", full_name: "Jessica Williams", email: "jessica@harrisoncpa.ca", title: "Bookkeeper", role: "member", weekly_capacity: 37.5, is_active: true },
  { id: "u6", full_name: "Daniel Kim", email: "daniel@harrisoncpa.ca", title: "Practice Administrator", role: "admin", weekly_capacity: 37.5, is_active: true },
  { id: "u7", full_name: "Priya Raman", email: "priya@harrisoncpa.ca", title: "Junior Accountant", role: "member", weekly_capacity: 37.5, is_active: true },
  { id: "u8", full_name: "Owen Fraser", email: "owen@harrisoncpa.ca", title: "Seasonal Preparer", role: "viewer", weekly_capacity: 20, is_active: false },
];

const NAME_BY_ID = new Map(TEAM.map((member) => [member.id, member.full_name]));

/* -------------------------------------------------------------------------- */
/* Services catalogue                                                          */
/* -------------------------------------------------------------------------- */

export interface Service {
  id: string;
  code: string;
  name: string;
  category: string;
  frequency: Frequency;
  default_price: number;
  lead_time_days: number;
  is_active: boolean;
  due_rule: string;
}

const SERVICES: Service[] = [
  { id: "s1", code: "T2", name: "Corporate tax return (T2)", category: "Tax", frequency: "annual", default_price: 1850, lead_time_days: 45, is_active: true, due_rule: "6 months after fiscal year-end" },
  { id: "s2", code: "T1", name: "Personal tax return (T1)", category: "Tax", frequency: "annual", default_price: 320, lead_time_days: 30, is_active: true, due_rule: "April 30" },
  { id: "s3", code: "GST-Q", name: "GST/HST return — quarterly", category: "Sales tax", frequency: "quarterly", default_price: 300, lead_time_days: 14, is_active: true, due_rule: "1 month after period end" },
  { id: "s4", code: "GST-M", name: "GST/HST return — monthly", category: "Sales tax", frequency: "monthly", default_price: 180, lead_time_days: 10, is_active: true, due_rule: "1 month after period end" },
  { id: "s5", code: "BK-M", name: "Monthly bookkeeping", category: "Bookkeeping", frequency: "monthly", default_price: 425, lead_time_days: 10, is_active: true, due_rule: "15th of following month" },
  { id: "s6", code: "BK-Q", name: "Quarterly bookkeeping", category: "Bookkeeping", frequency: "quarterly", default_price: 900, lead_time_days: 21, is_active: true, due_rule: "1 month after period end" },
  { id: "s7", code: "PAY", name: "Payroll processing", category: "Payroll", frequency: "monthly", default_price: 145, lead_time_days: 5, is_active: true, due_rule: "15th of following month" },
  { id: "s8", code: "T4", name: "T4 information return", category: "Payroll", frequency: "annual", default_price: 275, lead_time_days: 21, is_active: true, due_rule: "Last day of February" },
  { id: "s9", code: "T5", name: "T5 information return", category: "Payroll", frequency: "annual", default_price: 210, lead_time_days: 21, is_active: true, due_rule: "Last day of February" },
  { id: "s10", code: "YE", name: "Year-end financial statements", category: "Assurance", frequency: "annual", default_price: 2400, lead_time_days: 60, is_active: true, due_rule: "1 month before fiscal close" },
  { id: "s11", code: "NTR", name: "Notice to reader", category: "Assurance", frequency: "annual", default_price: 1100, lead_time_days: 45, is_active: true, due_rule: "6 months after fiscal year-end" },
  { id: "s12", code: "ADV", name: "Advisory retainer", category: "Advisory", frequency: "monthly", default_price: 650, lead_time_days: 0, is_active: false, due_rule: "No filing obligation" },
];

const SERVICE_BY_ID = new Map(SERVICES.map((service) => [service.id, service]));

/* -------------------------------------------------------------------------- */
/* Clients                                                                     */
/* -------------------------------------------------------------------------- */

export interface Contact {
  id: string;
  client_id: string;
  full_name: string;
  email: string;
  phone: string;
  role: string;
  is_primary: boolean;
}

export interface Client {
  id: string;
  code: string;
  legal_name: string;
  business_name: string;
  client_type: ClientType;
  status: ClientStatus;
  business_number: string;
  city: string;
  province: string;
  year_end_month: number;
  year_end_day: number;
  owner_id: string;
  annual_fee: number;
  portal_enabled: boolean;
  tags: string[];
  plan: string;
  joined: string;
  custom: Record<string, string>;
  service_ids: string[];
}

const CLIENTS: Client[] = [
  { id: "c1", code: "MAP-001", legal_name: "Maple Leaf Consulting Inc.", business_name: "Maple Leaf Consulting", client_type: "corporation", status: "active", business_number: "80112 3345 RC0001", city: "Toronto", province: "ON", year_end_month: 12, year_end_day: 31, owner_id: "u1", annual_fee: 15000, portal_enabled: true, tags: ["Growth", "Priority"], plan: "Growth", joined: "2024-05-13", custom: { "Referral source": "Partner referral", "Signing officer": "Alison Wu", "PAD enrolled": "Yes" }, service_ids: ["s1", "s3", "s5", "s10", "s7"] },
  { id: "c2", code: "BRI-002", legal_name: "BrightPath Logistics Ltd.", business_name: "BrightPath Logistics", client_type: "corporation", status: "active", business_number: "80445 6621 RC0001", city: "Mississauga", province: "ON", year_end_month: 6, year_end_day: 30, owner_id: "u2", annual_fee: 11400, portal_enabled: true, tags: ["Professional"], plan: "Professional", joined: "2024-04-29", custom: { "Referral source": "Inbound", "Signing officer": "Marcus Bell", "PAD enrolled": "Yes" }, service_ids: ["s1", "s3", "s5", "s8"] },
  { id: "c3", code: "SUM-003", legal_name: "Summit Retail Group Inc.", business_name: "Summit Retail Group", client_type: "corporation", status: "active", business_number: "80778 9012 RC0001", city: "Toronto", province: "ON", year_end_month: 3, year_end_day: 31, owner_id: "u3", annual_fee: 7800, portal_enabled: false, tags: ["Starter"], plan: "Starter", joined: "2024-06-02", custom: { "Referral source": "Cold outreach", "Signing officer": "Nadia Okonkwo", "PAD enrolled": "No" }, service_ids: ["s1", "s4", "s6"] },
  { id: "c4", code: "NOR-004", legal_name: "NorthCo Manufacturing Ltd.", business_name: "NorthCo Manufacturing", client_type: "corporation", status: "active", business_number: "81023 4455 RC0001", city: "Hamilton", province: "ON", year_end_month: 9, year_end_day: 30, owner_id: "u4", annual_fee: 17400, portal_enabled: true, tags: ["Growth", "Payroll"], plan: "Growth", joined: "2024-03-19", custom: { "Referral source": "Partner referral", "Signing officer": "Greg Halloran", "PAD enrolled": "Yes" }, service_ids: ["s1", "s4", "s5", "s7", "s8", "s10"] },
  { id: "c5", code: "CLE-005", legal_name: "Clearwater Studios Inc.", business_name: "Clearwater Studios", client_type: "corporation", status: "active", business_number: "81334 5566 RC0001", city: "Ottawa", province: "ON", year_end_month: 12, year_end_day: 31, owner_id: "u5", annual_fee: 10920, portal_enabled: true, tags: ["Professional"], plan: "Professional", joined: "2024-05-05", custom: { "Referral source": "Inbound", "Signing officer": "Rosa Klein", "PAD enrolled": "Yes" }, service_ids: ["s1", "s3", "s5"] },
  // The reference UI shows a "Trial" chip, but the backend's ClientStatus enum
  // has no such member — it is a plan state, not a client state. Kept as a tag.
  { id: "c6", code: "VAL-006", legal_name: "Valley Construction Ltd.", business_name: "Valley Construction", client_type: "corporation", status: "prospect", business_number: "81667 7788 RC0001", city: "Barrie", province: "ON", year_end_month: 12, year_end_day: 31, owner_id: "u4", annual_fee: 6600, portal_enabled: false, tags: ["Trial"], plan: "Starter", joined: "2024-06-01", custom: { "Referral source": "Cold outreach", "Signing officer": "Tom Vasquez", "PAD enrolled": "No" }, service_ids: ["s3", "s5"] },
  { id: "c7", code: "OCE-007", legal_name: "Oceanview Services Inc.", business_name: "Oceanview Services", client_type: "corporation", status: "active", business_number: "81990 8899 RC0001", city: "Toronto", province: "ON", year_end_month: 12, year_end_day: 31, owner_id: "u1", annual_fee: 15000, portal_enabled: true, tags: ["Growth"], plan: "Growth", joined: "2024-02-28", custom: { "Referral source": "Partner referral", "Signing officer": "Iris Bhatt", "PAD enrolled": "Yes" }, service_ids: ["s1", "s3", "s5", "s10"] },
  { id: "c8", code: "PIN-008", legal_name: "Pinnacle Enterprises Ltd.", business_name: "Pinnacle Enterprises", client_type: "corporation", status: "active", business_number: "82223 9900 RC0001", city: "Vaughan", province: "ON", year_end_month: 8, year_end_day: 31, owner_id: "u2", annual_fee: 11400, portal_enabled: true, tags: ["Professional"], plan: "Professional", joined: "2024-04-10", custom: { "Referral source": "Inbound", "Signing officer": "Peter Nowak", "PAD enrolled": "Yes" }, service_ids: ["s1", "s3", "s11"] },
  { id: "c9", code: "CED-009", legal_name: "Cedar Lane Grocers Ltd.", business_name: "Cedar Lane Grocers", client_type: "corporation", status: "active", business_number: "82556 1122 RC0001", city: "Toronto", province: "ON", year_end_month: 12, year_end_day: 31, owner_id: "u5", annual_fee: 8400, portal_enabled: true, tags: ["Bookkeeping"], plan: "Starter", joined: "2025-01-15", custom: { "Referral source": "Inbound", "Signing officer": "Yuki Sato", "PAD enrolled": "Yes" }, service_ids: ["s4", "s5", "s7"] },
  { id: "c10", code: "PRA-010", legal_name: "Prairie Roofing Inc.", business_name: "Prairie Roofing", client_type: "corporation", status: "active", business_number: "82889 2233 RC0001", city: "London", province: "ON", year_end_month: 12, year_end_day: 31, owner_id: "u3", annual_fee: 9600, portal_enabled: true, tags: ["Professional"], plan: "Professional", joined: "2025-02-20", custom: { "Referral source": "Partner referral", "Signing officer": "Chris Dube", "PAD enrolled": "No" }, service_ids: ["s1", "s3", "s5", "s7"] },
  { id: "c11", code: "BIR-011", legal_name: "Birchwood Interiors Ltd.", business_name: "Birchwood Interiors", client_type: "corporation", status: "active", business_number: "83112 3344 RC0001", city: "Toronto", province: "ON", year_end_month: 5, year_end_day: 31, owner_id: "u7", annual_fee: 7200, portal_enabled: false, tags: ["Starter"], plan: "Starter", joined: "2025-03-11", custom: { "Referral source": "Inbound", "Signing officer": "Hana Meyer", "PAD enrolled": "No" }, service_ids: ["s1", "s6"] },
  { id: "c12", code: "NOR-012", legal_name: "Northern Light Logistics Inc.", business_name: "Northern Light Logistics", client_type: "corporation", status: "active", business_number: "83445 4455 RC0001", city: "Sudbury", province: "ON", year_end_month: 11, year_end_day: 30, owner_id: "u4", annual_fee: 13200, portal_enabled: true, tags: ["Growth", "Payroll"], plan: "Growth", joined: "2025-04-08", custom: { "Referral source": "Cold outreach", "Signing officer": "Leo Marchand", "PAD enrolled": "Yes" }, service_ids: ["s1", "s3", "s5", "s7", "s8"] },
  { id: "c13", code: "SAT-013", legal_name: "Sato & Daughters LLP", business_name: "Sato & Daughters", client_type: "partnership", status: "active", business_number: "83778 5566 RC0001", city: "Toronto", province: "ON", year_end_month: 12, year_end_day: 31, owner_id: "u1", annual_fee: 10800, portal_enabled: true, tags: ["Professional"], plan: "Professional", joined: "2025-05-19", custom: { "Referral source": "Partner referral", "Signing officer": "Aiko Sato", "PAD enrolled": "Yes" }, service_ids: ["s1", "s3", "s6"] },
  { id: "c14", code: "HAR-014", legal_name: "Harbourfront Dental Corp.", business_name: "Harbourfront Dental", client_type: "corporation", status: "active", business_number: "84001 6677 RC0001", city: "Toronto", province: "ON", year_end_month: 7, year_end_day: 31, owner_id: "u2", annual_fee: 12600, portal_enabled: true, tags: ["Professional", "Payroll"], plan: "Professional", joined: "2025-06-30", custom: { "Referral source": "Inbound", "Signing officer": "Dr. Ravi Menon", "PAD enrolled": "Yes" }, service_ids: ["s1", "s3", "s5", "s7"] },
  { id: "c15", code: "GRE-015", legal_name: "Greenfield Landscaping Ltd.", business_name: "Greenfield Landscaping", client_type: "corporation", status: "prospect", business_number: "—", city: "Guelph", province: "ON", year_end_month: 12, year_end_day: 31, owner_id: "u3", annual_fee: 0, portal_enabled: false, tags: ["Prospect"], plan: "—", joined: "2026-07-22", custom: { "Referral source": "Inbound", "Signing officer": "—", "PAD enrolled": "No" }, service_ids: [] },
  { id: "c16", code: "STO-016", legal_name: "Stonebridge Legal Services", business_name: "Stonebridge Legal", client_type: "partnership", status: "inactive", business_number: "84334 7788 RC0001", city: "Kitchener", province: "ON", year_end_month: 12, year_end_day: 31, owner_id: "u7", annual_fee: 0, portal_enabled: false, tags: ["Churned"], plan: "—", joined: "2024-09-02", custom: { "Referral source": "Cold outreach", "Signing officer": "—", "PAD enrolled": "No" }, service_ids: [] },
  { id: "c17", code: "RIV-017", legal_name: "Riverstone Physiotherapy Inc.", business_name: "Riverstone Physio", client_type: "corporation", status: "active", business_number: "84667 8899 RC0001", city: "Oakville", province: "ON", year_end_month: 10, year_end_day: 31, owner_id: "u5", annual_fee: 9000, portal_enabled: true, tags: ["Professional"], plan: "Professional", joined: "2025-08-14", custom: { "Referral source": "Partner referral", "Signing officer": "Dana Poulin", "PAD enrolled": "Yes" }, service_ids: ["s1", "s3", "s5"] },
  { id: "c18", code: "ALP-018", legal_name: "Alpine Fitness Studios Ltd.", business_name: "Alpine Fitness", client_type: "corporation", status: "active", business_number: "84990 9900 RC0001", city: "Toronto", province: "ON", year_end_month: 12, year_end_day: 31, owner_id: "u7", annual_fee: 8400, portal_enabled: true, tags: ["Starter"], plan: "Starter", joined: "2025-10-06", custom: { "Referral source": "Inbound", "Signing officer": "Mei Lin", "PAD enrolled": "Yes" }, service_ids: ["s1", "s4", "s5"] },
];

const CONTACTS: Contact[] = [
  { id: "ct1", client_id: "c1", full_name: "Alison Wu", email: "alison@mapleleaf.ca", phone: "+1 416 555 0110", role: "Signing officer", is_primary: true },
  { id: "ct2", client_id: "c1", full_name: "Ben Ortega", email: "ben@mapleleaf.ca", phone: "+1 416 555 0111", role: "Bookkeeper", is_primary: false },
  { id: "ct3", client_id: "c1", full_name: "Carla Reyes", email: "payroll@mapleleaf.ca", phone: "+1 416 555 0112", role: "Payroll contact", is_primary: false },
  { id: "ct4", client_id: "c2", full_name: "Marcus Bell", email: "marcus@brightpath.ca", phone: "+1 905 555 0120", role: "Signing officer", is_primary: true },
  { id: "ct5", client_id: "c2", full_name: "Sofia Marino", email: "accounts@brightpath.ca", phone: "+1 905 555 0121", role: "Accounts payable", is_primary: false },
  { id: "ct6", client_id: "c3", full_name: "Nadia Okonkwo", email: "nadia@summitretail.ca", phone: "+1 416 555 0130", role: "Signing officer", is_primary: true },
  { id: "ct7", client_id: "c4", full_name: "Greg Halloran", email: "greg@northco.ca", phone: "+1 289 555 0140", role: "Signing officer", is_primary: true },
  { id: "ct8", client_id: "c4", full_name: "Amara Okafor", email: "hr@northco.ca", phone: "+1 289 555 0141", role: "Payroll contact", is_primary: false },
  { id: "ct9", client_id: "c5", full_name: "Rosa Klein", email: "rosa@clearwater.ca", phone: "+1 613 555 0150", role: "Signing officer", is_primary: true },
  { id: "ct10", client_id: "c7", full_name: "Iris Bhatt", email: "iris@oceanview.ca", phone: "+1 416 555 0170", role: "Signing officer", is_primary: true },
];

/* -------------------------------------------------------------------------- */
/* Deadlines                                                                   */
/* -------------------------------------------------------------------------- */

interface RawDeadline {
  id: string;
  client_id: string;
  service_id: string;
  title: string;
  period_label: string;
  due_date: string;
  status: DeadlineStatus;
  assignee_id: string;
  /** Set only when status is "filed". On-time rate compares this to due_date. */
  filed_at?: string;
}

const RAW_DEADLINES: RawDeadline[] = [
  { id: "d1", client_id: "c1", service_id: "s3", title: "GST/HST return", period_label: "Q2 2026", due_date: "2026-07-31", status: "open", assignee_id: "u5" },
  { id: "d2", client_id: "c2", service_id: "s1", title: "T2 corporate tax return", period_label: "FY2025", due_date: "2026-07-28", status: "open", assignee_id: "u2" },
  { id: "d3", client_id: "c6", service_id: "s3", title: "WSIB reconciliation", period_label: "Q2 2026", due_date: "2026-08-01", status: "open", assignee_id: "u4" },
  { id: "d4", client_id: "c3", service_id: "s4", title: "GST/HST return", period_label: "Jul 2026", due_date: "2026-08-11", status: "open", assignee_id: "u3" },
  { id: "d5", client_id: "c4", service_id: "s7", title: "Payroll remittance", period_label: "Jul 2026", due_date: "2026-08-15", status: "open", assignee_id: "u5" },
  { id: "d6", client_id: "c5", service_id: "s5", title: "Monthly bookkeeping", period_label: "Jul 2026", due_date: "2026-08-15", status: "open", assignee_id: "u5" },
  { id: "d7", client_id: "c2", service_id: "s8", title: "T4 information return", period_label: "2026", due_date: "2026-08-18", status: "open", assignee_id: "u7" },
  { id: "d8", client_id: "c9", service_id: "s4", title: "GST/HST return", period_label: "Jul 2026", due_date: "2026-08-19", status: "open", assignee_id: "u5" },
  { id: "d9", client_id: "c14", service_id: "s10", title: "Year-end financial statements", period_label: "FY2026", due_date: "2026-08-21", status: "open", assignee_id: "u2" },
  { id: "d10", client_id: "c7", service_id: "s5", title: "Monthly bookkeeping", period_label: "Jul 2026", due_date: "2026-08-25", status: "open", assignee_id: "u5" },
  { id: "d11", client_id: "c8", service_id: "s10", title: "Year-end financial statements", period_label: "FY2026", due_date: "2026-08-31", status: "open", assignee_id: "u2" },
  { id: "d12", client_id: "c10", service_id: "s7", title: "Payroll remittance", period_label: "Jul 2026", due_date: "2026-09-15", status: "open", assignee_id: "u5" },
  { id: "d13", client_id: "c13", service_id: "s1", title: "T2 corporate tax return", period_label: "FY2025", due_date: "2026-09-30", status: "open", assignee_id: "u1" },
  { id: "d14", client_id: "c4", service_id: "s10", title: "Year-end financial statements", period_label: "FY2026", due_date: "2026-08-30", status: "open", assignee_id: "u4" },
  { id: "d15", client_id: "c12", service_id: "s3", title: "GST/HST return", period_label: "Q3 2026", due_date: "2026-10-31", status: "open", assignee_id: "u4" },
  { id: "d16", client_id: "c17", service_id: "s1", title: "T2 corporate tax return", period_label: "FY2025", due_date: "2026-10-31", status: "open", assignee_id: "u5" },
  { id: "d17", client_id: "c18", service_id: "s5", title: "Monthly bookkeeping", period_label: "Jul 2026", due_date: "2026-08-14", status: "open", assignee_id: "u7" },
  { id: "d18", client_id: "c11", service_id: "s6", title: "Quarterly bookkeeping", period_label: "Q2 2026", due_date: "2026-08-08", status: "snoozed", assignee_id: "u7" },
  { id: "d19", client_id: "c1", service_id: "s5", title: "Monthly bookkeeping", period_label: "Jun 2026", due_date: "2026-07-15", status: "filed", assignee_id: "u5", filed_at: "2026-07-14" },
  { id: "d20", client_id: "c2", service_id: "s3", title: "GST/HST return", period_label: "Q1 2026", due_date: "2026-04-30", status: "filed", assignee_id: "u5", filed_at: "2026-04-28" },
  { id: "d21", client_id: "c7", service_id: "s1", title: "T2 corporate tax return", period_label: "FY2024", due_date: "2026-06-30", status: "filed", assignee_id: "u1", filed_at: "2026-07-06" },
  { id: "d22", client_id: "c9", service_id: "s7", title: "Payroll remittance", period_label: "Jun 2026", due_date: "2026-07-15", status: "filed", assignee_id: "u5", filed_at: "2026-07-15" },
  { id: "d23", client_id: "c10", service_id: "s3", title: "GST/HST return", period_label: "Q2 2026", due_date: "2026-07-31", status: "filed", assignee_id: "u3", filed_at: "2026-07-29" },
  { id: "d24", client_id: "c14", service_id: "s5", title: "Monthly bookkeeping", period_label: "Jun 2026", due_date: "2026-07-15", status: "filed", assignee_id: "u5", filed_at: "2026-07-13" },
];

export interface Deadline extends RawDeadline {
  client_name: string;
  service_code: string;
  assignee_name: string;
  days_remaining: number;
  urgency: Urgency;
}

const CLIENT_NAME = new Map(CLIENTS.map((client) => [client.id, client.business_name]));

const DEADLINES: Deadline[] = RAW_DEADLINES.map((deadline) => {
  const days = daysFromToday(deadline.due_date);
  return {
    ...deadline,
    client_name: CLIENT_NAME.get(deadline.client_id) ?? "—",
    service_code: SERVICE_BY_ID.get(deadline.service_id)?.code ?? "—",
    assignee_name: NAME_BY_ID.get(deadline.assignee_id) ?? "Unassigned",
    days_remaining: days,
    urgency: urgencyFor(days, deadline.status),
  };
});

/* -------------------------------------------------------------------------- */
/* Projects & tasks (Task Master)                                              */
/* -------------------------------------------------------------------------- */

export interface Task {
  id: string;
  project_id: string;
  client_id: string;
  client_name: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string;
  assignee_name: string;
  due_date: string;
  estimate_hours: number;
}

export interface Project {
  id: string;
  client_id: string;
  client_name: string;
  service_id: string;
  name: string;
  period_label: string;
  due_date: string;
  status: ProjectStatus;
  assignee_id: string;
  assignee_name: string;
  task_count: number;
  completed_tasks: number;
}

interface RawTask {
  id: string;
  project_id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string;
  due_date: string;
  estimate_hours: number;
}

interface RawProject {
  id: string;
  client_id: string;
  service_id: string;
  name: string;
  period_label: string;
  due_date: string;
  status: ProjectStatus;
  assignee_id: string;
}

const RAW_PROJECTS: RawProject[] = [
  { id: "p1", client_id: "c1", service_id: "s3", name: "GST/HST — Q2", period_label: "Q2 2026", due_date: "2026-07-31", status: "in_progress", assignee_id: "u5" },
  { id: "p2", client_id: "c2", service_id: "s1", name: "T2 corporate filing", period_label: "FY2025", due_date: "2026-07-28", status: "review", assignee_id: "u2" },
  { id: "p3", client_id: "c4", service_id: "s10", name: "Year-end working papers", period_label: "FY2026", due_date: "2026-08-30", status: "in_progress", assignee_id: "u4" },
  { id: "p4", client_id: "c5", service_id: "s5", name: "Monthly bookkeeping", period_label: "Jul 2026", due_date: "2026-08-15", status: "in_progress", assignee_id: "u5" },
  { id: "p5", client_id: "c3", service_id: "s4", name: "GST/HST — July", period_label: "Jul 2026", due_date: "2026-08-11", status: "not_started", assignee_id: "u3" },
  { id: "p6", client_id: "c14", service_id: "s10", name: "Year-end financial statements", period_label: "FY2026", due_date: "2026-08-21", status: "in_progress", assignee_id: "u2" },
  { id: "p7", client_id: "c7", service_id: "s5", name: "Monthly bookkeeping", period_label: "Jul 2026", due_date: "2026-08-25", status: "not_started", assignee_id: "u5" },
  { id: "p8", client_id: "c12", service_id: "s8", name: "T4 slips", period_label: "2026", due_date: "2026-08-18", status: "on_hold", assignee_id: "u7" },
  { id: "p9", client_id: "c10", service_id: "s3", name: "GST/HST — Q2", period_label: "Q2 2026", due_date: "2026-07-31", status: "complete", assignee_id: "u3" },
  { id: "p10", client_id: "c9", service_id: "s7", name: "Payroll — July", period_label: "Jul 2026", due_date: "2026-08-15", status: "in_progress", assignee_id: "u5" },
  { id: "p11", client_id: "c8", service_id: "s11", name: "Notice to reader", period_label: "FY2026", due_date: "2026-08-31", status: "not_started", assignee_id: "u2" },
  { id: "p12", client_id: "c13", service_id: "s6", name: "Quarterly bookkeeping", period_label: "Q2 2026", due_date: "2026-08-05", status: "review", assignee_id: "u7" },
];

const RAW_TASKS: RawTask[] = [
  { id: "t1", project_id: "p1", title: "Reconcile bank feed", status: "complete", priority: "medium", assignee_id: "u5", due_date: "2026-07-20", estimate_hours: 2 },
  { id: "t2", project_id: "p1", title: "Review ITC claims", status: "in_progress", priority: "high", assignee_id: "u5", due_date: "2026-07-28", estimate_hours: 1.5 },
  { id: "t3", project_id: "p1", title: "File return with CRA", status: "blocked", priority: "urgent", assignee_id: "u5", due_date: "2026-07-31", estimate_hours: 0.5 },
  { id: "t4", project_id: "p2", title: "Prepare T2 schedules", status: "complete", priority: "high", assignee_id: "u7", due_date: "2026-07-18", estimate_hours: 6 },
  { id: "t5", project_id: "p2", title: "Partner review", status: "review", priority: "urgent", assignee_id: "u2", due_date: "2026-07-26", estimate_hours: 2 },
  { id: "t6", project_id: "p2", title: "Client sign-off", status: "todo", priority: "high", assignee_id: "u2", due_date: "2026-07-28", estimate_hours: 0.5 },
  { id: "t7", project_id: "p3", title: "Trial balance tie-out", status: "in_progress", priority: "medium", assignee_id: "u4", due_date: "2026-08-12", estimate_hours: 5 },
  { id: "t8", project_id: "p3", title: "Depreciation schedule", status: "todo", priority: "medium", assignee_id: "u4", due_date: "2026-08-18", estimate_hours: 3 },
  { id: "t9", project_id: "p3", title: "Inventory count review", status: "todo", priority: "low", assignee_id: "u7", due_date: "2026-08-22", estimate_hours: 4 },
  { id: "t10", project_id: "p4", title: "Import July transactions", status: "complete", priority: "medium", assignee_id: "u5", due_date: "2026-08-05", estimate_hours: 1 },
  { id: "t11", project_id: "p4", title: "Categorise expenses", status: "in_progress", priority: "medium", assignee_id: "u5", due_date: "2026-08-11", estimate_hours: 2.5 },
  { id: "t12", project_id: "p5", title: "Request July records", status: "todo", priority: "high", assignee_id: "u3", due_date: "2026-08-07", estimate_hours: 0.5 },
  { id: "t13", project_id: "p6", title: "Draft financial statements", status: "in_progress", priority: "high", assignee_id: "u2", due_date: "2026-08-15", estimate_hours: 8 },
  { id: "t14", project_id: "p6", title: "Note disclosures", status: "todo", priority: "medium", assignee_id: "u7", due_date: "2026-08-18", estimate_hours: 4 },
  { id: "t15", project_id: "p7", title: "Chase missing receipts", status: "todo", priority: "medium", assignee_id: "u5", due_date: "2026-08-19", estimate_hours: 1 },
  { id: "t16", project_id: "p8", title: "Confirm employee list", status: "blocked", priority: "high", assignee_id: "u7", due_date: "2026-08-12", estimate_hours: 1 },
  { id: "t17", project_id: "p9", title: "File return with CRA", status: "complete", priority: "high", assignee_id: "u3", due_date: "2026-07-30", estimate_hours: 0.5 },
  { id: "t18", project_id: "p10", title: "Run July pay cycle", status: "in_progress", priority: "high", assignee_id: "u5", due_date: "2026-08-10", estimate_hours: 2 },
  { id: "t19", project_id: "p11", title: "Engagement letter to client", status: "todo", priority: "medium", assignee_id: "u2", due_date: "2026-08-14", estimate_hours: 0.5 },
  { id: "t20", project_id: "p12", title: "Manager review", status: "review", priority: "medium", assignee_id: "u7", due_date: "2026-08-04", estimate_hours: 1.5 },
  { id: "t21", project_id: "p12", title: "Post adjusting entries", status: "complete", priority: "medium", assignee_id: "u7", due_date: "2026-08-01", estimate_hours: 2 },
  { id: "t22", project_id: "p3", title: "Accrual review", status: "review", priority: "high", assignee_id: "u4", due_date: "2026-08-20", estimate_hours: 3 },
];

const PROJECT_CLIENT = new Map(RAW_PROJECTS.map((project) => [project.id, project.client_id]));

const TASKS: Task[] = RAW_TASKS.map((task) => {
  const clientId = PROJECT_CLIENT.get(task.project_id) ?? "";
  return {
    ...task,
    client_id: clientId,
    client_name: CLIENT_NAME.get(clientId) ?? "—",
    assignee_name: NAME_BY_ID.get(task.assignee_id) ?? "Unassigned",
  };
});

const PROJECTS: Project[] = RAW_PROJECTS.map((project) => {
  const tasks = TASKS.filter((task) => task.project_id === project.id);
  return {
    ...project,
    client_name: CLIENT_NAME.get(project.client_id) ?? "—",
    assignee_name: NAME_BY_ID.get(project.assignee_id) ?? "Unassigned",
    task_count: tasks.length,
    completed_tasks: tasks.filter((task) => task.status === "complete").length,
  };
});

/* -------------------------------------------------------------------------- */
/* Engagement letters                                                          */
/* -------------------------------------------------------------------------- */

export interface LetterItem {
  description: string;
  amount: number;
}

export interface Letter {
  id: string;
  client_id: string;
  client_name: string;
  title: string;
  status: LetterStatus;
  currency: string;
  subtotal: number;
  tax_rate: number;
  recipient_name: string;
  recipient_email: string;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  signer_name: string | null;
  items: LetterItem[];
}

const RAW_LETTERS: Omit<Letter, "client_name" | "subtotal">[] = [
  { id: "l1", client_id: "c1", title: "Engagement letter 2026-27", status: "signed", currency: "CAD", tax_rate: 13, recipient_name: "Alison Wu", recipient_email: "alison@mapleleaf.ca", sent_at: "2026-06-28", viewed_at: "2026-06-28", signed_at: "2026-06-29", signer_name: "Alison Wu", items: [{ description: "Corporate tax return (T2)", amount: 1850 }, { description: "GST/HST returns (quarterly)", amount: 1200 }, { description: "Monthly bookkeeping", amount: 5100 }, { description: "Year-end financial statements", amount: 2400 }] },
  { id: "l2", client_id: "c2", title: "Engagement letter 2026-27", status: "signed", currency: "CAD", tax_rate: 13, recipient_name: "Marcus Bell", recipient_email: "marcus@brightpath.ca", sent_at: "2026-07-02", viewed_at: "2026-07-02", signed_at: "2026-07-03", signer_name: "Marcus Bell", items: [{ description: "Corporate tax return (T2)", amount: 1850 }, { description: "GST/HST returns (quarterly)", amount: 1200 }, { description: "Monthly bookkeeping", amount: 5100 }] },
  { id: "l3", client_id: "c14", title: "Engagement letter 2026-27", status: "viewed", currency: "CAD", tax_rate: 13, recipient_name: "Dr. Ravi Menon", recipient_email: "ravi@harbourfrontdental.ca", sent_at: "2026-07-29", viewed_at: "2026-08-01", signed_at: null, signer_name: null, items: [{ description: "Corporate tax return (T2)", amount: 1850 }, { description: "GST/HST returns (quarterly)", amount: 1200 }, { description: "Payroll processing", amount: 1740 }] },
  { id: "l4", client_id: "c8", title: "Notice to reader engagement", status: "sent", currency: "CAD", tax_rate: 13, recipient_name: "Peter Nowak", recipient_email: "peter@pinnacle.ca", sent_at: "2026-08-01", viewed_at: null, signed_at: null, signer_name: null, items: [{ description: "Notice to reader", amount: 1100 }, { description: "Corporate tax return (T2)", amount: 1850 }] },
  { id: "l5", client_id: "c15", title: "Proposal — Greenfield Landscaping", status: "draft", currency: "CAD", tax_rate: 13, recipient_name: "—", recipient_email: "—", sent_at: null, viewed_at: null, signed_at: null, signer_name: null, items: [{ description: "Corporate tax return (T2)", amount: 1850 }, { description: "Quarterly bookkeeping", amount: 3600 }] },
  { id: "l6", client_id: "c11", title: "Engagement letter 2026-27", status: "declined", currency: "CAD", tax_rate: 13, recipient_name: "Hana Meyer", recipient_email: "hana@birchwood.ca", sent_at: "2026-07-10", viewed_at: "2026-07-11", signed_at: null, signer_name: null, items: [{ description: "Corporate tax return (T2)", amount: 1850 }, { description: "Quarterly bookkeeping", amount: 3600 }] },
  { id: "l7", client_id: "c17", title: "Engagement letter 2026-27", status: "signed", currency: "CAD", tax_rate: 13, recipient_name: "Dana Poulin", recipient_email: "dana@riverstone.ca", sent_at: "2026-06-15", viewed_at: "2026-06-15", signed_at: "2026-06-16", signer_name: "Dana Poulin", items: [{ description: "Corporate tax return (T2)", amount: 1850 }, { description: "GST/HST returns (quarterly)", amount: 1200 }, { description: "Monthly bookkeeping", amount: 5100 }] },
  { id: "l8", client_id: "c12", title: "Engagement letter 2026-27", status: "sent", currency: "CAD", tax_rate: 13, recipient_name: "Leo Marchand", recipient_email: "leo@northernlight.ca", sent_at: "2026-08-03", viewed_at: null, signed_at: null, signer_name: null, items: [{ description: "Corporate tax return (T2)", amount: 1850 }, { description: "Payroll processing", amount: 1740 }, { description: "Monthly bookkeeping", amount: 5100 }] },
];

const LETTERS: Letter[] = RAW_LETTERS.map((letter) => ({
  ...letter,
  client_name: CLIENT_NAME.get(letter.client_id) ?? "—",
  subtotal: letter.items.reduce((total, item) => total + item.amount, 0),
}));

/* -------------------------------------------------------------------------- */
/* Notifications, custom fields, audit, tenants                                */
/* -------------------------------------------------------------------------- */

export interface Notification {
  id: string;
  type: "deadline" | "letter" | "task" | "client" | "system";
  title: string;
  body: string;
  link: string;
  is_read: boolean;
  when: string;
}

const NOTIFICATIONS: Notification[] = [
  { id: "n1", type: "deadline", title: "GST/HST return is overdue", body: "Maple Leaf Consulting · Q2 2026 · was due Jul 31", link: "/deadlines", is_read: false, when: "5 days ago" },
  { id: "n2", type: "letter", title: "Engagement letter viewed", body: "Harbourfront Dental opened the 2026-27 letter", link: "/engagements", is_read: false, when: "4 days ago" },
  { id: "n3", type: "task", title: "Task blocked", body: "\"File return with CRA\" — Maple Leaf Consulting", link: "/workflows", is_read: false, when: "4 days ago" },
  { id: "n4", type: "letter", title: "Engagement letter declined", body: "Birchwood Interiors declined the 2026-27 letter", link: "/engagements", is_read: true, when: "Jul 11" },
  { id: "n5", type: "client", title: "New prospect added", body: "Greenfield Landscaping · assigned to Emily Carter", link: "/clients", is_read: true, when: "Jul 22" },
  { id: "n6", type: "deadline", title: "T2 due in 3 days", body: "BrightPath Logistics · FY2025", link: "/deadlines", is_read: true, when: "Jul 25" },
  { id: "n7", type: "letter", title: "Engagement letter signed", body: "BrightPath Logistics · signed by Marcus Bell", link: "/engagements", is_read: true, when: "Jul 3" },
  { id: "n8", type: "system", title: "CSV import completed", body: "18 clients created, 0 failed", link: "/import", is_read: true, when: "Jul 1" },
];

export interface CustomField {
  id: string;
  entity: "client" | "task" | "project";
  key: string;
  label: string;
  field_type: "text" | "number" | "date" | "select" | "checkbox" | "email" | "phone";
  options: string[];
  help_text: string;
  is_required: boolean;
  position: number;
}

const CUSTOM_FIELDS: CustomField[] = [
  { id: "cf1", entity: "client", key: "referral_source", label: "Referral source", field_type: "select", options: ["Partner referral", "Inbound", "Cold outreach", "Event"], help_text: "How the client found the firm.", is_required: true, position: 1 },
  { id: "cf2", entity: "client", key: "signing_officer", label: "Signing officer", field_type: "text", options: [], help_text: "Who signs engagement letters and returns.", is_required: true, position: 2 },
  { id: "cf3", entity: "client", key: "pad_enrolled", label: "PAD enrolled", field_type: "checkbox", options: [], help_text: "Pre-authorised debit set up for fees.", is_required: false, position: 3 },
  { id: "cf4", entity: "client", key: "cra_rep_expiry", label: "CRA rep authorisation expires", field_type: "date", options: [], help_text: "Renew before this date or filings will fail.", is_required: false, position: 4 },
  { id: "cf5", entity: "task", key: "review_required", label: "Partner review required", field_type: "checkbox", options: [], help_text: "Blocks completion until a partner signs off.", is_required: false, position: 1 },
  { id: "cf6", entity: "project", key: "budget_code", label: "Budget code", field_type: "text", options: [], help_text: "Internal cost centre.", is_required: false, position: 1 },
];

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  entity: string;
  summary: string;
  when: string;
}

const AUDIT: AuditEntry[] = [
  { id: "a1", actor: "Sarah Johnson", action: "updated", entity: "client", summary: "Maple Leaf Consulting — annual fee 14,000 → 15,000", when: "2 hours ago" },
  { id: "a2", actor: "Emily Carter", action: "created", entity: "project", summary: "GST/HST — July for Summit Retail Group", when: "Yesterday" },
  { id: "a3", actor: "System", action: "generated", entity: "deadline", summary: "14 deadlines from service cadences", when: "Yesterday" },
  { id: "a4", actor: "Michael Chen", action: "sent", entity: "letter", summary: "Notice to reader engagement → Pinnacle Enterprises", when: "4 days ago" },
  { id: "a5", actor: "Jessica Williams", action: "filed", entity: "deadline", summary: "GST/HST Q2 2026 — Prairie Roofing", when: "6 days ago" },
  { id: "a6", actor: "Daniel Kim", action: "invited", entity: "user", summary: "priya@harrisoncpa.ca as member", when: "Jul 28" },
  { id: "a7", actor: "Sarah Johnson", action: "archived", entity: "client", summary: "Stonebridge Legal Services marked inactive", when: "Jul 20" },
];

export interface AdminTenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  seats: number;
  is_active: boolean;
  custom_domain: string | null;
  clients: number;
  users: number;
  signed_letters: number;
  created_at: string;
}

const TENANTS: AdminTenant[] = [
  { id: "t-1", name: "Harrison CPA", slug: "harrison-cpa", plan: "Full platform", seats: 8, is_active: true, custom_domain: "portal.harrisoncpa.ca", clients: 18, users: 8, signed_letters: 3, created_at: "2024-02-11" },
  { id: "t-2", name: "Cedar & Co.", slug: "cedar-co", plan: "Full platform", seats: 4, is_active: true, custom_domain: null, clients: 42, users: 4, signed_letters: 38, created_at: "2024-08-03" },
  { id: "t-3", name: "Aurora Tax", slug: "aurora-tax", plan: "Full platform", seats: 11, is_active: true, custom_domain: "app.auroratax.ca", clients: 96, users: 11, signed_letters: 84, created_at: "2025-01-22" },
  { id: "t-4", name: "Lakeshore Bookkeeping", slug: "lakeshore", plan: "Full platform", seats: 3, is_active: true, custom_domain: null, clients: 27, users: 3, signed_letters: 19, created_at: "2025-06-14" },
  { id: "t-5", name: "Northwind Advisory", slug: "northwind", plan: "Trial", seats: 2, is_active: false, custom_domain: null, clients: 5, users: 2, signed_letters: 0, created_at: "2026-07-30" },
];

/* -------------------------------------------------------------------------- */
/* Accessors                                                                   */
/* -------------------------------------------------------------------------- */

export const getServices = (): Service[] => SERVICES;
export const getContacts = (): Contact[] => CONTACTS;
export const getDeadlines = (): Deadline[] => DEADLINES;
export const getProjects = (): Project[] => PROJECTS;
export const getTasks = (): Task[] => TASKS;
export const getLetters = (): Letter[] => LETTERS;
export const getNotifications = (): Notification[] => NOTIFICATIONS;
export const getCustomFields = (): CustomField[] => CUSTOM_FIELDS;
export const getAudit = (): AuditEntry[] => AUDIT;
export const getTenants = (): AdminTenant[] => TENANTS;

/** Clients, with the counts the backend computes server-side. */
export interface ClientRow extends Client {
  owner_name: string;
  open_tasks: number;
  open_deadlines: number;
  overdue_deadlines: number;
  next_due_date: string | null;
  service_count: number;
  monthly_fee: number;
}

export function getClients(): ClientRow[] {
  return CLIENTS.map((client) => {
    const deadlines = DEADLINES.filter(
      (deadline) => deadline.client_id === client.id && deadline.status === "open",
    );
    const upcoming = [...deadlines].sort(
      (a, b) => a.days_remaining - b.days_remaining,
    );
    return {
      ...client,
      owner_name: NAME_BY_ID.get(client.owner_id) ?? "Unassigned",
      open_tasks: TASKS.filter(
        (task) => task.client_id === client.id && task.status !== "complete",
      ).length,
      open_deadlines: deadlines.length,
      overdue_deadlines: deadlines.filter((deadline) => deadline.days_remaining < 0).length,
      next_due_date: upcoming[0]?.due_date ?? null,
      service_count: client.service_ids.length,
      monthly_fee: Math.round(client.annual_fee / 12),
    };
  });
}

export function getClient(id: string): ClientRow | undefined {
  return getClients().find((client) => client.id === id);
}

export const CLIENT_IDS = CLIENTS.map((client) => client.id);

/** Team roster with workload computed from the task records. */
export interface TeamRow extends TeamMember {
  clients: number;
  open_tasks: number;
  overdue: number;
  estimated_hours: number;
}

export function getTeam(): TeamRow[] {
  return TEAM.map((member) => {
    const tasks = TASKS.filter(
      (task) => task.assignee_id === member.id && task.status !== "complete",
    );
    return {
      ...member,
      clients: CLIENTS.filter((client) => client.owner_id === member.id).length,
      open_tasks: tasks.length,
      overdue: DEADLINES.filter(
        (deadline) =>
          deadline.assignee_id === member.id &&
          deadline.status === "open" &&
          deadline.days_remaining < 0,
      ).length,
      estimated_hours: tasks.reduce((total, task) => total + task.estimate_hours, 0),
    };
  });
}

/** Services with their live client counts. */
export function getServicesWithUsage() {
  return SERVICES.map((service) => ({
    ...service,
    client_count: CLIENTS.filter((client) => client.service_ids.includes(service.id)).length,
    annual_value: CLIENTS.filter((client) => client.service_ids.includes(service.id)).length
      * service.default_price
      * (service.frequency === "monthly" ? 12 : service.frequency === "quarterly" ? 4 : 1),
  }));
}

/** Firm-wide roll-up for the overview page and reporting. */
export function getFirmOverview() {
  const clients = getClients();
  const open = DEADLINES.filter((deadline) => deadline.status === "open");
  const filed = DEADLINES.filter((deadline) => deadline.status === "filed");
  // On time means filed on or before the due date. Comparing the due date to
  // *today* instead would make this structurally 100% — every filed item has a
  // past due date — which is a meaningless metric dressed up as a measured one.
  const onTime = filed.filter(
    (deadline) => deadline.filed_at !== undefined && deadline.filed_at <= deadline.due_date,
  ).length;

  return {
    clients_total: clients.length,
    clients_active: clients.filter((client) => client.status === "active").length,
    clients_prospect: clients.filter((client) => client.status === "prospect").length,
    recurring_revenue: clients.reduce((total, client) => total + client.annual_fee, 0),
    average_fee: Math.round(
      clients.filter((c) => c.annual_fee > 0).reduce((t, c) => t + c.annual_fee, 0) /
        Math.max(1, clients.filter((c) => c.annual_fee > 0).length),
    ),
    deadlines: {
      overdue: open.filter((deadline) => deadline.days_remaining < 0).length,
      due_soon: open.filter(
        (deadline) => deadline.days_remaining >= 0 && deadline.days_remaining <= 14,
      ).length,
      upcoming: open.filter((deadline) => deadline.days_remaining > 14).length,
      filed: filed.length,
    },
    on_time_rate: filed.length === 0 ? 100 : Math.round((onTime / filed.length) * 100),
    tasks_open: TASKS.filter((task) => task.status !== "complete").length,
    tasks_blocked: TASKS.filter((task) => task.status === "blocked").length,
    letters_awaiting: LETTERS.filter(
      (letter) => letter.status === "sent" || letter.status === "viewed",
    ).length,
    portal_enabled: clients.filter((client) => client.portal_enabled).length,
    unread_notifications: NOTIFICATIONS.filter((n) => !n.is_read).length,
  };
}

/** Deadline volume by month, for the reporting chart. */
export function getDeadlinesByMonth() {
  const months = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"];
  const index = new Map(months.map((month, i) => [i + 4, month]));
  const rows = months.map((month) => ({ x: month, due: 0, filed: 0 }));

  for (const deadline of DEADLINES) {
    const month = Number(deadline.due_date.slice(5, 7));
    const label = index.get(month);
    if (!label) continue;
    const row = rows.find((entry) => entry.x === label);
    if (!row) continue;
    row.due += 1;
    if (deadline.status === "filed") row.filed += 1;
  }
  return rows;
}

/** Monthly recurring revenue, last 6 months, for the overview trend chart. */
export function getRecurringRevenueTrend() {
  const monthShort = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const monthlyNow = getFirmOverview().recurring_revenue / 12;
  // A gentle, deterministic ramp up to the current run-rate — no Math.random,
  // so the chart is stable across renders and snapshots.
  const factors = [0.82, 0.86, 0.89, 0.93, 0.97, 1];
  const currentMonth = Number(TODAY.slice(5, 7)); // 1–12

  const rows = factors.map((factor, i) => {
    const monthNumber = ((currentMonth - 1 - (factors.length - 1 - i) + 12 * 10) % 12) + 1;
    return {
      x: monthShort[monthNumber - 1],
      revenue: Math.round((monthlyNow * factor) / 100) * 100,
    };
  });

  const last = rows.at(-1)!.revenue;
  const prev = rows.at(-2)!.revenue;
  const change_pct = prev === 0 ? 0 : ((last - prev) / prev) * 100;

  return { rows, change_pct };
}

/** Recurring revenue by service category, for the part-to-whole chart. */
export function getRevenueByCategory() {
  const totals = new Map<string, number>();
  for (const service of getServicesWithUsage()) {
    if (service.annual_value === 0) continue;
    totals.set(service.category, (totals.get(service.category) ?? 0) + service.annual_value);
  }
  return [...totals.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}
