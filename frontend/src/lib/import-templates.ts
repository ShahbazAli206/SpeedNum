/**
 * Column specs and example rows for the bulk-import CSV/XLSX templates.
 *
 * Shared between the Import page (`app/(firm)/import/import-client.tsx`) and
 * any page that offers a shortcut "Download template" button for one entity
 * type — e.g. the clients list — so both stay in sync with a single source
 * instead of drifting copies.
 */

export interface ColumnSpec {
  column: string;
  required: boolean;
  note: string;
}

/** Mirrors `detect_mapping` in backend/app/routers/imports.py. */
export const CLIENT_COLUMNS: ColumnSpec[] = [
  { column: "legal_name", required: true, note: "Registered legal name" },
  {
    column: "business_name",
    required: false,
    note: "Operating name, if different — a bare 'Business' column also matches",
  },
  {
    column: "client_type",
    required: false,
    note: "corporation | sole_proprietor | partnership | individual | nonprofit | trust",
  },
  { column: "status", required: false, note: "prospect | active | inactive | archived — defaults to active" },
  { column: "business_number", required: false, note: "CRA business number" },
  { column: "email", required: false, note: "Primary contact email" },
  { column: "phone", required: false, note: "Primary contact phone" },
  { column: "city", required: false, note: "" },
  { column: "province", required: false, note: "Two-letter code, e.g. ON" },
  { column: "year_end_month", required: false, note: "1–12 — drives every generated deadline" },
  { column: "year_end_day", required: false, note: "1–31" },
  {
    column: "annual_fee",
    required: false,
    note: "Numeric, no currency symbol. A monthly 'MRR' column is also accepted and converted (×12).",
  },
  { column: "plan", required: false, note: "e.g. Growth | Professional | Starter — stored as a tag" },
  {
    column: "owner",
    required: false,
    note:
      "Accountant/manager's full name — matched against your team roster (also matches 'Accountant'). " +
      "No match just leaves the client unassigned; the name is kept as a custom field either way.",
  },
];

/** Mirrors `detect_user_mapping` in backend/app/routers/imports.py. */
export const USER_COLUMNS: ColumnSpec[] = [
  { column: "email", required: true, note: "Their sign-in address — must be unique" },
  { column: "full_name", required: false, note: "Derived from the email if blank" },
  { column: "role", required: false, note: "owner | admin | member | viewer (partner→owner, accountant→member)" },
  { column: "title", required: false, note: "Shown on the roster, e.g. Senior Accountant" },
  { column: "phone", required: false, note: "" },
  {
    column: "client",
    required: false,
    note: "Client name or code — set this to create a portal login instead of staff",
  },
];

/** Mirrors `detect_service_mapping` in backend/app/routers/imports.py. */
export const SERVICE_COLUMNS: ColumnSpec[] = [
  { column: "code", required: true, note: "Short, unique — e.g. T2" },
  { column: "name", required: true, note: "Shown on the catalogue and engagement letters" },
  { column: "category", required: false, note: "Defaults to General" },
  { column: "frequency", required: false, note: "monthly | quarterly | semi_annual | annual | one_time" },
  { column: "default_price", required: false, note: "Numeric, no currency symbol" },
  { column: "lead_time_days", required: false, note: "How early work should start before the due date" },
  {
    column: "months_after_period_end",
    required: false,
    note: "Drives the due date — months after the fiscal year end",
  },
  { column: "description", required: false, note: "Shown on engagement letters" },
  { column: "is_active", required: false, note: "Yes/No — defaults to Yes" },
];

/** Mirrors `detect_tenant_mapping` in backend/app/routers/imports.py — superadmin only. */
export const TENANT_COLUMNS: ColumnSpec[] = [
  { column: "name", required: true, note: "The firm's name" },
  { column: "admin_email", required: true, note: "The first admin's sign-in address" },
  { column: "admin_name", required: false, note: "" },
  { column: "slug", required: false, note: "Blank auto-generates from the name" },
  { column: "plan", required: false, note: "trial | starter | growth | pro | enterprise" },
  { column: "custom_domain", required: false, note: "White-label domain, optional" },
  { column: "max_clients", required: false, note: "Blank = unlimited" },
  { column: "max_users", required: false, note: "Blank = unlimited" },
  { column: "is_demo", required: false, note: "Yes/No — defaults to No" },
];

export const CLIENT_EXAMPLE = [
  "Lakeview Dental Corp.",
  "Lakeview Dental",
  "corporation",
  "active",
  "80112 3345 RC0001",
  "hello@lakeview.ca",
  "+1 416 555 0100",
  "Toronto",
  "ON",
  "12",
  "31",
  "9600",
  "Growth",
  "Jane Doe",
];

export const USER_EXAMPLE = ["jane@harrisoncpa.ca", "Jane Doe", "member", "Senior Accountant", "+1 416 555 0142", ""];

export const SERVICE_EXAMPLE = [
  "T2",
  "Corporate tax return",
  "Tax",
  "annual",
  "1200",
  "30",
  "6",
  "Preparation and filing of the T2 corporate income tax return.",
  "Yes",
];

export const TENANT_EXAMPLE = [
  "Lakeview Dental Corp.",
  "admin@lakeview.ca",
  "Priya Shah",
  "lakeview-dental",
  "trial",
  "",
  "",
  "",
  "No",
];
