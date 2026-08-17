/**
 * Single source of truth for brand, contact and navigation.
 * Marketing pages, the footer, structured data and the legal pages all read
 * from here so a change to a phone number or address lands everywhere at once.
 */

export const SITE = {
  name: "SpeedNum",
  legalName: "SpeedNum Technologies Inc.",
  tagline: "Practice management for accounting firms",
  domain: "speednum.com",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://speednum.com",
  description:
    "One home for every client, every task and every CRA deadline. Colour-coded reminders, e-signed engagement letters and a live SLA dashboard — so nothing slips and everything is on record.",
  founded: 2026,
  phones: ["+1-780-952-6108", "+1-780-932-6405"],
  email: "hello@speednum.com",
  salesEmail: "sales@speednum.com",
  privacyEmail: "privacy@speednum.com",
  address: {
    line1: "MOSAIC ENCOR 56-4850 Terwillegar Common N.W.",
    city: "Edmonton",
    province: "Alberta",
    postalCode: "T6R 0T6",
    country: "Canada",
  },
  developer: { name: "Axelytix", url: "https://axelytix.com" },
  social: [
    { label: "LinkedIn", href: "https://linkedin.com", icon: "linkedin" },
    { label: "Facebook", href: "https://facebook.com", icon: "facebook" },
    { label: "Instagram", href: "https://instagram.com", icon: "instagram" },
    { label: "X", href: "https://x.com", icon: "x" },
    { label: "YouTube", href: "https://youtube.com", icon: "youtube" },
  ],
} as const;

export const PRIMARY_PHONE = SITE.phones[0];

export const ADDRESS_LINES = [
  SITE.address.line1,
  `${SITE.address.city}, ${SITE.address.province} ${SITE.address.postalCode}`,
  SITE.address.country,
];

/** Flat annual price shown on /pricing and the home pricing band. */
export const PRICING = {
  currency: "USD",
  annual: 1200,
  monthlyEquivalent: 100,
  trialDays: 14,
  includes: [
    "Unlimited clients & team members",
    "Client CRM, Task Master & SLA dashboard",
    "Colour-coded deadline reminders & email digests",
    "Engagement letters with client e-signature",
    "Services catalogue & branded client portal",
    "White-label branding — your logo, colours & emails",
    "CSV/XLSX import and export, no lock-in",
    "Canadian data residency & audit log",
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* Navigation                                                                  */
/* -------------------------------------------------------------------------- */

export interface NavLink {
  label: string;
  href: string;
  description?: string;
}

/** Top-level header links, in the order the existing site uses. */
export const MAIN_NAV: NavLink[] = [
  { label: "Home", href: "/" },
  { label: "Pricing", href: "/pricing" },
  { label: "Blog", href: "/blog" },
  { label: "Case Studies", href: "/case-studies" },
];

export const FOOTER_PRODUCT: NavLink[] = [
  { label: "Client CRM", href: "/features/client-management" },
  { label: "Client onboarding", href: "/features/client-onboarding" },
  { label: "CSV/XLSX import", href: "/features/csv-import" },
  { label: "Custom fields", href: "/features/custom-fields" },
  { label: "Services catalogue", href: "/features/services-catalogue" },
  { label: "Workflow", href: "/features/workflow" },
  { label: "Internal Team", href: "/features/internal-team" },
  { label: "Deadlines", href: "/features/deadlines" },
  { label: "All features", href: "/features" },
];

export const FOOTER_RESOURCES: NavLink[] = [
  { label: "Blog", href: "/blog" },
  { label: "Case studies", href: "/case-studies" },
  { label: "Guides", href: "/blog" },
  { label: "Accounting resources", href: "/blog" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
];

/* -------------------------------------------------------------------------- */
/* Firm-side application navigation                                            */
/* -------------------------------------------------------------------------- */

/**
 * The staff-facing app. Distinct from DASHBOARD_NAV, which is the *client*
 * portal — these are the routes `src/proxy.ts` protects and that the FastAPI
 * routers in `backend/app/routers/` serve.
 */
export const FIRM_NAV: { group: string; items: DashboardNavItem[] }[] = [
  {
    group: "Practice",
    items: [
      {
        label: "Overview",
        href: "/overview",
        icon: "layout-dashboard",
        description: "Firm health, needs-attention and workload",
      },
      {
        label: "Clients",
        href: "/clients",
        icon: "users",
        description: "The client book — records, contacts and services",
      },
      {
        label: "Task Master",
        href: "/workflows",
        icon: "kanban",
        description: "Projects and tasks, table or Kanban",
      },
      {
        label: "Deadlines",
        href: "/deadlines",
        icon: "calendar-clock",
        description: "The SLA board — overdue, due soon, upcoming",
      },
      {
        label: "Reminders",
        href: "/reminders",
        icon: "bell-ring",
        description: "Countdown alerts — 10 days left, due today, overdue",
      },
    ],
  },
  {
    group: "Commercial",
    items: [
      {
        label: "Services",
        href: "/services",
        icon: "tag",
        description: "Catalogue, cadences and default pricing",
      },
      {
        label: "Engagements",
        href: "/engagements",
        icon: "file-signature",
        description: "Letters, signatures and scope on record",
      },
      {
        label: "Reporting",
        href: "/reporting",
        icon: "bar-chart-3",
        description: "Recurring revenue, on-time rate and workload",
      },
    ],
  },
  {
    group: "Administration",
    items: [
      {
        label: "Accountants",
        href: "/team",
        icon: "network",
        description: "Your internal team of CPAs — roster, roles and live workload",
      },
      {
        label: "Users",
        href: "/users",
        icon: "users",
        description: "Every platform account — staff and client-portal logins",
      },
      {
        label: "Notifications",
        href: "/notifications",
        icon: "bell",
        description: "In-app feed of everything that changed",
      },
      {
        label: "Integrations",
        href: "/integrations",
        icon: "plug",
        description: "Email, Google Calendar, Drive and Gmail",
      },
      {
        label: "Settings",
        href: "/settings",
        icon: "settings",
        description: "Branding, colours, font and alert preferences",
      },
      {
        label: "Custom fields",
        href: "/custom-fields",
        icon: "sliders-horizontal",
        description: "Admin-defined fields on client records",
      },
      {
        label: "Import",
        href: "/import",
        icon: "file-spreadsheet",
        description: "CSV/XLSX import with mapping and preview",
      },
      {
        label: "Admin console",
        href: "/admin",
        icon: "shield-check",
        description: "Super-admin: tenants, plans and audit log",
      },
      {
        label: "Backup & Recovery",
        href: "/admin/backups",
        icon: "hard-drive",
        description: "Superadmin: snapshots, devices, and disaster recovery",
      },
    ],
  },
];

export const FIRM_NAV_FLAT = FIRM_NAV.flatMap((group) =>
  group.items.map((item) => ({ ...item, group: group.group })),
);

/** Signed-in areas, used by the dashboard sidebar and the command palette. */
export interface DashboardNavItem {
  label: string;
  href: string;
  icon: string;
  description: string;
}

export const DASHBOARD_NAV: { group: string; items: DashboardNavItem[] }[] = [
  {
    group: "General",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: "layout-dashboard",
        description: "Your financial overview at a glance",
      },
    ],
  },
  {
    group: "Finance",
    items: [
      {
        label: "Invoices",
        href: "/dashboard/invoices",
        icon: "file-text",
        description: "Billing issued to your account",
      },
      {
        label: "Expenses",
        href: "/dashboard/expenses",
        icon: "receipt",
        description: "Spending by category and vendor",
      },
      {
        label: "Payroll",
        href: "/dashboard/payroll",
        icon: "users",
        description: "Pay runs, employees and remittances",
      },
      {
        label: "Taxes",
        href: "/dashboard/taxes",
        icon: "landmark",
        description: "GST/HST, corporate and payroll tax",
      },
      {
        label: "Services",
        href: "/dashboard/services",
        icon: "tag",
        description: "What you're engaged for, and at what cadence",
      },
    ],
  },
  {
    group: "Insights",
    items: [
      {
        label: "Reports",
        href: "/dashboard/reports",
        icon: "bar-chart-3",
        description: "Profit & loss, cash flow and trends",
      },
      {
        label: "Documents",
        href: "/dashboard/documents",
        icon: "folder",
        description: "Invoices, receipts, tax forms and contracts",
      },
    ],
  },
  {
    group: "Account",
    items: [
      {
        label: "Settings",
        href: "/dashboard/settings",
        icon: "settings",
        description: "Business profile, notifications and security",
      },
    ],
  },
];

export const DASHBOARD_NAV_FLAT = DASHBOARD_NAV.flatMap((group) =>
  group.items.map((item) => ({ ...item, group: group.group })),
);

/** Short trust claims used under the hero and in the footer strip. */
export const TRUST_POINTS = [
  { label: "Data hosted in Canada", icon: "map-pin" },
  { label: "Row-level tenant isolation", icon: "lock" },
  { label: "PIPEDA-aligned", icon: "shield-check" },
  { label: "Branded client emails", icon: "mail" },
  { label: "24/7 availability", icon: "calendar-check" },
];
