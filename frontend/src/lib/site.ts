/**
 * Single source of truth for brand, contact and navigation.
 * Marketing pages, the footer, structured data and the legal pages all read
 * from here so a change to a phone number or address lands everywhere at once.
 */

export const SITE = {
  name: "SpidNums",
  legalName: "SpidNums Technologies Inc.",
  tagline: "Practice management for accounting firms",
  domain: "spidnums.com",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://spidnums.com",
  description:
    "One home for every client, every task and every CRA deadline. Colour-coded reminders, e-signed engagement letters and a live SLA dashboard — so nothing slips and everything is on record.",
  founded: 2026,
  phones: ["+1-780-952-6108", "+1-780-932-6405"],
  email: "hello@spidnums.com",
  salesEmail: "sales@spidnums.com",
  privacyEmail: "privacy@spidnums.com",
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
        // The single dashboard entry for the whole firm side. For ordinary
        // firm staff /overview is their own practice dashboard; for a
        // provider-only superadmin (isProviderOnly in components/firm/shell.tsx)
        // the same route's page.tsx swaps in the cross-tenant
        // PlatformOverviewClient. The shell's provider-only filter keeps this
        // one Practice item visible even though the rest of the group is hidden
        // for that account.
        label: "Dashboard",
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
        // Everyone on the firm's team — renamed from "Accountants" and moved up
        // next to Clients so the two "who's involved" lists sit together. Still
        // hiddenFromAdmin: the backend's require_team_visible gates /team to the
        // Owner and platform superadmin (a plain admin gets a 403).
        label: "Staff",
        href: "/team",
        icon: "network",
        description: "Everyone on your team — roster, roles and live workload",
        hiddenFromAdmin: true,
      },
      {
        label: "Messages",
        href: "/messages",
        icon: "message-square",
        description: "Questions and complaints clients send from the portal",
      },
      {
        label: "Task Master",
        href: "/workflows",
        icon: "kanban",
        description: "Projects and tasks, table or Kanban",
      },
      {
        // Everyone sees this — an Owner gets the full roster view with edit/
        // export, everyone else sees only their own attendance and task
        // hours. See src/app/(firm)/timesheet/timesheet-client.tsx.
        label: "Timesheet",
        href: "/timesheet",
        icon: "clock",
        description: "Daily sign-in/out and hours spent on client tasks",
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
        label: "Invoices",
        href: "/invoices",
        icon: "file-text",
        description: "Invoices you and your team send clients, tracked to payment",
      },
      {
        label: "Bills",
        href: "/bills",
        icon: "receipt",
        description: "What the firm spends running the practice, including your SpidNums subscription",
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
      // Order matters here, not just the filtering flags below: this is the
      // literal render order for every account that can see a given item
      // (visibleNav in components/firm/shell.tsx filters but never
      // re-sorts). Superadmin/provider-console pages lead; the everyday
      // firm-facing pages that survive filtering for a provider-only
      // account (Notifications, Settings) come last on purpose.
      {
        label: "Admin console",
        href: "/admin",
        icon: "shield-check",
        description: "Super-admin: tenants, plans and audit log",
        superadminOnly: true,
      },
      {
        label: "Accounts",
        href: "/admin/accounts",
        icon: "users",
        description: "Superadmin: search and act on any account, across every tenant",
        superadminOnly: true,
      },
      {
        label: "Finance",
        href: "/admin/finance",
        icon: "wallet",
        description: "Superadmin: invoices to companies, income, operating expenses, and profit",
        superadminOnly: true,
      },
      {
        label: "Plan requests",
        href: "/admin/plan-requests",
        icon: "arrow-left-right",
        description: "Superadmin: review and apply firms' upgrade/downgrade requests",
        superadminOnly: true,
      },
      {
        label: "Plans",
        href: "/admin/plans",
        icon: "receipt",
        description: "Superadmin: edit plan names, prices and seat caps, or add new plans",
        superadminOnly: true,
      },
      {
        label: "Support inbox",
        href: "/admin/support",
        icon: "life-buoy",
        description: "Superadmin: messages from company owners across every firm — read and reply",
        superadminOnly: true,
      },
      {
        label: "Backup & Recovery",
        href: "/admin/backups",
        icon: "hard-drive",
        description: "Superadmin: snapshots, devices, and disaster recovery",
        superadminOnly: true,
      },
      {
        label: "Reach",
        href: "/admin/reach",
        icon: "line-chart",
        description: "Superadmin: site traffic, search footprint and platform scale",
        superadminOnly: true,
      },
      {
        label: "Platform settings",
        href: "/admin/settings",
        icon: "shield-check",
        description: "Superadmin: platform email delivery and how the platform is configured",
        superadminOnly: true,
      },
      {
        label: "Users",
        href: "/users",
        icon: "users",
        description: "Every platform account — staff and client-portal logins",
        superadminOnly: true,
        // Needs one specific tenant already impersonated to show anything —
        // useless to a pure platform-provider account, and superseded there
        // by /admin/accounts (search/act across every tenant with no
        // impersonation step). Still shown to a superadmin who also owns a
        // firm, or while impersonating one.
        hiddenForProviderOnly: true,
      },
      {
        label: "Roles & Permissions",
        href: "/team/roles",
        icon: "shield-check",
        description: "Define staff role types and what each one can see or do",
        ownerOnly: true,
      },
      {
        // The company owner's line to the SpidNums platform team (the
        // superadmin's Support inbox). ownerOnly to match the backend gate
        // (OwnerOrSuperadminDep on /support/*) — Member/Viewer never see it.
        label: "Platform support",
        href: "/support",
        icon: "life-buoy",
        description: "Message the SpidNums platform team about your account",
        ownerOnly: true,
      },
      {
        label: "Billing",
        href: "/billing",
        icon: "credit-card",
        description: "Your active package, seat usage, and upgrade/downgrade requests",
      },
      {
        label: "Integrations",
        href: "/integrations",
        icon: "plug",
        description: "Email, Google Calendar, Drive and Gmail",
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
        label: "Notifications",
        href: "/notifications",
        icon: "bell",
        description: "In-app feed of everything that changed",
      },
      {
        label: "Settings",
        href: "/settings",
        icon: "settings",
        description: "Branding, colours, font and alert preferences",
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
  /** Restricted to the platform superadmin role server-side (see
   * backend/app/deps.py's SuperadminDep). A tenant admin/owner — even one
   * with `isAdmin` true — cannot open these, so the sidebar must hide them
   * for anyone but a real `profile.is_superadmin`, not just any admin. */
  superadminOnly?: boolean;
  /** Restricted server-side to the firm's Owner and the platform superadmin
   * (see backend/app/deps.py's require_team_visible) — a plain `admin` role
   * is blocked, unlike `superadminOnly` which also blocks the Owner. Keeps
   * the two policies distinct since /team and /users landed on different
   * answers for whether Owner keeps access. */
  hiddenFromAdmin?: boolean;
  /** Restricted server-side to the firm's Owner and the platform superadmin
   * (see backend/app/deps.py's require_owner_or_superadmin, the same gate
   * app/routers/roles.py uses) — stricter than hiddenFromAdmin, which still
   * lets Member/Viewer through. Deciding what a role can see or do is an
   * Owner-level action, so Member/Viewer are hidden here too. */
  ownerOnly?: boolean;
  /** Hidden specifically from a tenant-less superadmin's provider-only nav
   * (components/firm/shell.tsx's isProviderOnly) even though it's otherwise
   * superadminOnly — for a page that needs one specific tenant already
   * selected/impersonated to be useful at all. */
  hiddenForProviderOnly?: boolean;
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
        label: "Accountant invoices",
        href: "/dashboard/accountant-invoices",
        icon: "credit-card",
        description: "Invoices your accountant has sent you, tracked to payment",
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
      {
        label: "Agreements",
        href: "/dashboard/engagements",
        icon: "file-signature",
        description: "Engagement letters to review and sign, and ones you've already signed",
      },
    ],
  },
  {
    group: "Support",
    items: [
      {
        label: "Messages",
        href: "/dashboard/messages",
        icon: "message-square",
        description: "Send your accountant a question or a complaint",
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
