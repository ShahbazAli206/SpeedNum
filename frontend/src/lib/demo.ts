/**
 * Demo data for the client portal.
 *
 * The FastAPI backend in `backend/` is the firm-side API (clients, deadlines,
 * engagements, reporting); it has no invoice, expense, payroll or document
 * endpoints yet. Until those exist, every dashboard page reads from here.
 *
 * Everything is deterministic — no Math.random, no Date.now — so the pages
 * render identically on the server and the client and never hydrate-mismatch.
 * When the real endpoints land, replace the `getX()` functions below with API
 * calls; the page components consume only these types and never the literals.
 */

export type InvoiceStatus = "paid" | "sent" | "overdue" | "draft";
export type ExpenseStatus = "approved" | "pending" | "rejected";
export type DocumentKind = "invoice" | "receipt" | "tax" | "contract" | "statement";

export interface Invoice {
  id: string;
  number: string;
  client: string;
  description: string;
  issued: string;
  due: string;
  amount: number;
  tax: number;
  status: InvoiceStatus;
}

export interface Expense {
  id: string;
  vendor: string;
  category: string;
  date: string;
  amount: number;
  gst: number;
  status: ExpenseStatus;
  /** Free text — "Visa ••4821", "Bank transfer", etc. Not a closed set: the
   * live API (backend/app/schemas.py::ClientExpenseBase.method) accepts any
   * string, and this type has to admit whatever it returns. */
  method: string;
  receipt: boolean;
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  type: "Full-time" | "Part-time" | "Contract";
  province: string;
  gross: number;
  cpp: number;
  ei: number;
  tax: number;
  net: number;
}

export interface PayRun {
  id: string;
  period: string;
  payDate: string;
  employees: number;
  gross: number;
  deductions: number;
  net: number;
  status: "processed" | "scheduled" | "draft";
}

export interface TaxObligation {
  id: string;
  name: string;
  /** Free text — usually "CRA", sometimes "Revenu Québec" or a provincial
   * body. Not a closed set; see the note on Expense.method above. */
  authority: string;
  period: string;
  due: string;
  amount: number;
  status: "filed" | "open" | "overdue";
  /** Negative means the deadline has passed. */
  daysRemaining: number;
}

export interface DocumentFile {
  id: string;
  name: string;
  kind: DocumentKind;
  size: number;
  uploaded: string;
  uploadedBy: string;
  shared: boolean;
}

export interface Deadline {
  id: string;
  title: string;
  detail: string;
  due: string;
  daysRemaining: number;
  urgency: "overdue" | "due_soon" | "upcoming";
}

export interface ActivityEntry {
  id: string;
  actor: string;
  action: string;
  target: string;
  when: string;
}

/**
 * A type alias rather than an interface on purpose: the chart components take
 * `Row = { x: string } & Record<string, number | string>`, and TypeScript only
 * gives *aliases* an implicit index signature. An interface here fails to
 * assign to Row.
 */
export type MonthPoint = {
  x: string;
  revenue: number;
  expenses: number;
  net: number;
};

/** The account the demo portal signs you in as. */
export const DEMO_ACCOUNT = {
  firstName: "Emily",
  lastName: "Carter",
  fullName: "Emily Carter",
  email: "emily@mapleretail.ca",
  business: "Maple Retail Co.",
  legalName: "Maple Retail Company Ltd.",
  address: "128 Jasper Avenue NW, Edmonton, AB T5J 3N7",
  phone: "+1-780-555-0142",
  accountant: "Sarah Johnson, CPA",
  firm: "Harrison CPA",
  gstNumber: "80124 5567 RT0001",
  businessNumber: "80124 5567",
  fiscalYearEnd: "December 31",
  plan: "Growth",
  memberSince: "March 2024",
};

/* -------------------------------------------------------------------------- */
/* Twelve-month series                                                         */
/* -------------------------------------------------------------------------- */

const MONTHLY: MonthPoint[] = [
  { x: "Sep", revenue: 41200, expenses: 27800, net: 13400 },
  { x: "Oct", revenue: 44800, expenses: 29100, net: 15700 },
  { x: "Nov", revenue: 52300, expenses: 33400, net: 18900 },
  { x: "Dec", revenue: 61700, expenses: 38200, net: 23500 },
  { x: "Jan", revenue: 38900, expenses: 26400, net: 12500 },
  { x: "Feb", revenue: 42600, expenses: 27900, net: 14700 },
  { x: "Mar", revenue: 49100, expenses: 31200, net: 17900 },
  { x: "Apr", revenue: 46800, expenses: 30500, net: 16300 },
  { x: "May", revenue: 51400, expenses: 32800, net: 18600 },
  { x: "Jun", revenue: 55200, expenses: 34100, net: 21100 },
  { x: "Jul", revenue: 58600, expenses: 35700, net: 22900 },
  { x: "Aug", revenue: 62400, expenses: 37300, net: 25100 },
];

export const getMonthly = (): MonthPoint[] => MONTHLY;

/* -------------------------------------------------------------------------- */
/* Invoices                                                                    */
/* -------------------------------------------------------------------------- */

const INVOICES: Invoice[] = [
  { id: "inv-1042", number: "INV-1042", client: "Northwind Trading Ltd.", description: "Wholesale order — August", issued: "2026-08-01", due: "2026-08-31", amount: 12400, tax: 620, status: "sent" },
  { id: "inv-1041", number: "INV-1041", client: "Birchwood Interiors", description: "Fixture supply and install", issued: "2026-07-28", due: "2026-08-27", amount: 8750, tax: 437.5, status: "sent" },
  { id: "inv-1040", number: "INV-1040", client: "Cedar Lane Grocers", description: "Monthly supply contract", issued: "2026-07-20", due: "2026-08-19", amount: 6300, tax: 315, status: "paid" },
  { id: "inv-1039", number: "INV-1039", client: "Summit Retail Group", description: "Seasonal stock — Q3", issued: "2026-07-15", due: "2026-07-30", amount: 15900, tax: 795, status: "overdue" },
  { id: "inv-1038", number: "INV-1038", client: "Prairie Roofing Inc.", description: "Materials resale", issued: "2026-07-10", due: "2026-08-09", amount: 4200, tax: 210, status: "paid" },
  { id: "inv-1037", number: "INV-1037", client: "Clearwater Studios", description: "Custom order 2291", issued: "2026-07-02", due: "2026-08-01", amount: 3150, tax: 157.5, status: "paid" },
  { id: "inv-1036", number: "INV-1036", client: "Valley Construction Ltd.", description: "Bulk order — July", issued: "2026-06-28", due: "2026-07-28", amount: 11200, tax: 560, status: "paid" },
  { id: "inv-1035", number: "INV-1035", client: "Northwind Trading Ltd.", description: "Wholesale order — June", issued: "2026-06-20", due: "2026-07-20", amount: 9800, tax: 490, status: "paid" },
  { id: "inv-1034", number: "INV-1034", client: "Oceanview Services", description: "Contract renewal deposit", issued: "2026-06-14", due: "2026-06-29", amount: 5400, tax: 270, status: "overdue" },
  { id: "inv-1033", number: "INV-1033", client: "Birchwood Interiors", description: "Design consultation", issued: "2026-06-08", due: "2026-07-08", amount: 2250, tax: 112.5, status: "paid" },
  { id: "inv-1032", number: "INV-1032", client: "Cedar Lane Grocers", description: "Monthly supply contract", issued: "2026-06-01", due: "2026-07-01", amount: 6300, tax: 315, status: "paid" },
  { id: "inv-1031", number: "INV-1031", client: "Pinnacle Enterprises", description: "Equipment resale", issued: "2026-05-26", due: "2026-06-25", amount: 18600, tax: 930, status: "paid" },
  { id: "inv-1030", number: "INV-1030", client: "Summit Retail Group", description: "Seasonal stock — Q2", issued: "2026-05-18", due: "2026-06-17", amount: 14300, tax: 715, status: "paid" },
  { id: "inv-1029", number: "INV-1029", client: "Clearwater Studios", description: "Custom order 2244", issued: "2026-05-11", due: "2026-06-10", amount: 2900, tax: 145, status: "paid" },
  { id: "inv-1043", number: "INV-1043", client: "Valley Construction Ltd.", description: "August materials — not yet sent", issued: "2026-08-04", due: "2026-09-03", amount: 7450, tax: 372.5, status: "draft" },
];

export const getInvoices = (): Invoice[] => INVOICES;

export function getInvoiceTotals() {
  const billed = INVOICES.filter((i) => i.status !== "draft");
  const sum = (list: Invoice[]) => list.reduce((total, i) => total + i.amount + i.tax, 0);
  return {
    billed: sum(billed),
    collected: sum(billed.filter((i) => i.status === "paid")),
    outstanding: sum(billed.filter((i) => i.status === "sent")),
    overdue: sum(billed.filter((i) => i.status === "overdue")),
    count: INVOICES.length,
    overdueCount: billed.filter((i) => i.status === "overdue").length,
  };
}

/* -------------------------------------------------------------------------- */
/* Expenses                                                                    */
/* -------------------------------------------------------------------------- */

const EXPENSES: Expense[] = [
  { id: "exp-311", vendor: "Prairie Freight Co.", category: "Shipping & freight", date: "2026-08-03", amount: 2840, gst: 142, status: "approved", method: "Bank transfer", receipt: true },
  { id: "exp-310", vendor: "Alberta Power", category: "Utilities", date: "2026-08-02", amount: 612, gst: 30.6, status: "approved", method: "Bank transfer", receipt: true },
  { id: "exp-309", vendor: "Westgate Property Mgmt", category: "Rent & premises", date: "2026-08-01", amount: 4800, gst: 240, status: "approved", method: "Bank transfer", receipt: true },
  { id: "exp-308", vendor: "Northline Supply", category: "Cost of goods", date: "2026-07-30", amount: 11250, gst: 562.5, status: "approved", method: "Visa ••4821", receipt: true },
  { id: "exp-307", vendor: "Meridian Insurance", category: "Insurance", date: "2026-07-28", amount: 1180, gst: 0, status: "approved", method: "Bank transfer", receipt: true },
  { id: "exp-306", vendor: "Harrison CPA", category: "Professional fees", date: "2026-07-25", amount: 1350, gst: 67.5, status: "approved", method: "Bank transfer", receipt: true },
  { id: "exp-305", vendor: "Copperfield Marketing", category: "Marketing", date: "2026-07-22", amount: 2200, gst: 110, status: "pending", method: "Visa ••4821", receipt: false },
  { id: "exp-304", vendor: "Rocky Mountain Fuel", category: "Vehicle & travel", date: "2026-07-20", amount: 468, gst: 23.4, status: "approved", method: "Mastercard ••7702", receipt: true },
  { id: "exp-303", vendor: "Summit Office Depot", category: "Office & software", date: "2026-07-18", amount: 389, gst: 19.45, status: "approved", method: "Visa ••4821", receipt: true },
  { id: "exp-302", vendor: "Northline Supply", category: "Cost of goods", date: "2026-07-14", amount: 9640, gst: 482, status: "approved", method: "Bank transfer", receipt: true },
  { id: "exp-301", vendor: "Bluewave Telecom", category: "Office & software", date: "2026-07-12", amount: 245, gst: 12.25, status: "approved", method: "Visa ••4821", receipt: true },
  { id: "exp-300", vendor: "Cascade Cleaning", category: "Rent & premises", date: "2026-07-08", amount: 520, gst: 26, status: "pending", method: "Cash", receipt: false },
  { id: "exp-299", vendor: "Copperfield Marketing", category: "Marketing", date: "2026-07-05", amount: 3100, gst: 155, status: "approved", method: "Bank transfer", receipt: true },
  { id: "exp-298", vendor: "Rocky Mountain Fuel", category: "Vehicle & travel", date: "2026-07-02", amount: 512, gst: 25.6, status: "rejected", method: "Mastercard ••7702", receipt: false },
];

export const getExpenses = (): Expense[] => EXPENSES;

export function getExpenseTotals() {
  const sum = (list: Expense[]) => list.reduce((total, e) => total + e.amount, 0);
  return {
    total: sum(EXPENSES),
    approved: sum(EXPENSES.filter((e) => e.status === "approved")),
    pending: EXPENSES.filter((e) => e.status === "pending").length,
    pendingValue: sum(EXPENSES.filter((e) => e.status === "pending")),
    categories: new Set(EXPENSES.map((e) => e.category)).size,
    gstPaid: EXPENSES.filter((e) => e.status === "approved").reduce((t, e) => t + e.gst, 0),
  };
}

/** Category totals, largest first — the part-to-whole input. */
export function getExpenseByCategory() {
  const totals = new Map<string, number>();
  for (const expense of EXPENSES) {
    if (expense.status === "rejected") continue;
    totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amount);
  }
  return [...totals.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

/* -------------------------------------------------------------------------- */
/* Payroll                                                                     */
/* -------------------------------------------------------------------------- */

const EMPLOYEES: Employee[] = [
  { id: "emp-1", name: "Daniel Kim", role: "Operations manager", type: "Full-time", province: "AB", gross: 7083, cpp: 396, ei: 116, tax: 1521, net: 5050 },
  { id: "emp-2", name: "Priya Raman", role: "Warehouse lead", type: "Full-time", province: "AB", gross: 5416, cpp: 303, ei: 89, tax: 1063, net: 3961 },
  { id: "emp-3", name: "Marcus Bell", role: "Sales associate", type: "Full-time", province: "AB", gross: 4583, cpp: 256, ei: 75, tax: 842, net: 3410 },
  { id: "emp-4", name: "Jenna Whitfield", role: "Bookkeeper", type: "Part-time", province: "AB", gross: 2750, cpp: 154, ei: 45, tax: 412, net: 2139 },
  { id: "emp-5", name: "Owen Fraser", role: "Driver", type: "Full-time", province: "AB", gross: 4166, cpp: 233, ei: 68, tax: 731, net: 3134 },
  { id: "emp-6", name: "Amara Okafor", role: "Customer service", type: "Part-time", province: "AB", gross: 2333, cpp: 130, ei: 38, tax: 318, net: 1847 },
  { id: "emp-7", name: "Luc Tremblay", role: "Merchandiser", type: "Contract", province: "AB", gross: 3200, cpp: 0, ei: 0, tax: 0, net: 3200 },
];

export const getEmployees = (): Employee[] => EMPLOYEES;

const PAY_RUNS: PayRun[] = [
  { id: "run-8", period: "Jul 16 – Jul 31, 2026", payDate: "2026-08-05", employees: 7, gross: 29531, deductions: 6552, net: 22979, status: "scheduled" },
  { id: "run-7", period: "Jul 1 – Jul 15, 2026", payDate: "2026-07-21", employees: 7, gross: 29531, deductions: 6552, net: 22979, status: "processed" },
  { id: "run-6", period: "Jun 16 – Jun 30, 2026", payDate: "2026-07-06", employees: 7, gross: 28940, deductions: 6398, net: 22542, status: "processed" },
  { id: "run-5", period: "Jun 1 – Jun 15, 2026", payDate: "2026-06-20", employees: 6, gross: 26120, deductions: 5804, net: 20316, status: "processed" },
  { id: "run-4", period: "May 16 – May 31, 2026", payDate: "2026-06-05", employees: 6, gross: 26120, deductions: 5804, net: 20316, status: "processed" },
  { id: "run-3", period: "May 1 – May 15, 2026", payDate: "2026-05-20", employees: 6, gross: 25880, deductions: 5741, net: 20139, status: "processed" },
];

export const getPayRuns = (): PayRun[] => PAY_RUNS;

export function getPayrollTotals() {
  const monthlyGross = EMPLOYEES.reduce((total, e) => total + e.gross, 0);
  return {
    active: EMPLOYEES.length,
    monthlyGross,
    monthlyNet: EMPLOYEES.reduce((total, e) => total + e.net, 0),
    remittance: EMPLOYEES.reduce((total, e) => total + e.cpp * 2 + e.ei * 1.4 + e.tax, 0),
    nextRun: PAY_RUNS.find((run) => run.status === "scheduled") ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/* Taxes                                                                       */
/* -------------------------------------------------------------------------- */

const TAXES: TaxObligation[] = [
  { id: "tax-1", name: "GST/HST return", authority: "CRA", period: "Q2 2026 (Apr–Jun)", due: "2026-07-31", amount: 4820, status: "overdue", daysRemaining: -5 },
  { id: "tax-2", name: "Payroll source deductions", authority: "CRA", period: "July 2026", due: "2026-08-15", amount: 9640, status: "open", daysRemaining: 10 },
  { id: "tax-3", name: "GST/HST return", authority: "CRA", period: "Q3 2026 (Jul–Sep)", due: "2026-10-31", amount: 5310, status: "open", daysRemaining: 87 },
  { id: "tax-4", name: "T2 corporate income tax", authority: "CRA", period: "FY 2025", due: "2026-06-30", amount: 21400, status: "filed", daysRemaining: -36 },
  { id: "tax-5", name: "Corporate tax instalment", authority: "CRA", period: "Q3 2026", due: "2026-09-30", amount: 5850, status: "open", daysRemaining: 56 },
  { id: "tax-6", name: "T4 information return", authority: "CRA", period: "2025", due: "2026-02-28", amount: 0, status: "filed", daysRemaining: -158 },
];

export const getTaxes = (): TaxObligation[] => TAXES;

export function getTaxTotals() {
  const open = TAXES.filter((t) => t.status !== "filed");
  const next = [...open].sort((a, b) => a.daysRemaining - b.daysRemaining)[0] ?? null;
  return {
    gstOwing: open.filter((t) => t.name.startsWith("GST")).reduce((total, t) => total + t.amount, 0),
    corporateEstimate: open
      .filter((t) => t.name.includes("Corporate") || t.name.includes("T2"))
      .reduce((total, t) => total + t.amount, 0),
    inputTaxCredits: getExpenseTotals().gstPaid,
    next,
    totalOwing: open.reduce((total, t) => total + t.amount, 0),
  };
}

/* -------------------------------------------------------------------------- */
/* Documents                                                                   */
/* -------------------------------------------------------------------------- */

const DOCUMENTS: DocumentFile[] = [
  { id: "doc-1", name: "2025 Notice of Assessment.pdf", kind: "tax", size: 284_000, uploaded: "2026-07-18", uploadedBy: "Sarah Johnson", shared: true },
  { id: "doc-2", name: "Engagement letter 2026-27.pdf", kind: "contract", size: 156_000, uploaded: "2026-07-02", uploadedBy: "Sarah Johnson", shared: true },
  { id: "doc-3", name: "GST return Q1 2026.pdf", kind: "tax", size: 98_400, uploaded: "2026-04-28", uploadedBy: "Sarah Johnson", shared: true },
  { id: "doc-4", name: "Bank statement — July 2026.pdf", kind: "statement", size: 412_000, uploaded: "2026-08-02", uploadedBy: "Emily Carter", shared: false },
  { id: "doc-5", name: "Northline Supply receipts — July.zip", kind: "receipt", size: 3_240_000, uploaded: "2026-08-01", uploadedBy: "Emily Carter", shared: false },
  { id: "doc-6", name: "INV-1042 Northwind Trading.pdf", kind: "invoice", size: 74_200, uploaded: "2026-08-01", uploadedBy: "Emily Carter", shared: false },
  { id: "doc-7", name: "T4 summary 2025.pdf", kind: "tax", size: 121_000, uploaded: "2026-02-26", uploadedBy: "Sarah Johnson", shared: true },
  { id: "doc-8", name: "Commercial lease — Westgate.pdf", kind: "contract", size: 1_840_000, uploaded: "2026-01-14", uploadedBy: "Emily Carter", shared: false },
  { id: "doc-9", name: "Financial statements FY2025.pdf", kind: "statement", size: 668_000, uploaded: "2026-06-20", uploadedBy: "Sarah Johnson", shared: true },
  { id: "doc-10", name: "Vehicle log — Q2 2026.xlsx", kind: "receipt", size: 46_800, uploaded: "2026-07-04", uploadedBy: "Emily Carter", shared: false },
];

export const getDocuments = (): DocumentFile[] => DOCUMENTS;

export function getDocumentTotals() {
  return {
    count: DOCUMENTS.length,
    bytes: DOCUMENTS.reduce((total, d) => total + d.size, 0),
    shared: DOCUMENTS.filter((d) => d.shared).length,
  };
}

/* -------------------------------------------------------------------------- */
/* Deadlines & activity                                                        */
/* -------------------------------------------------------------------------- */

const DEADLINES: Deadline[] = [
  { id: "dl-1", title: "GST/HST return — Q2 2026", detail: "CRA · filing and remittance", due: "2026-07-31", daysRemaining: -5, urgency: "overdue" },
  { id: "dl-2", title: "Payroll source deductions", detail: "CRA · July remittance", due: "2026-08-15", daysRemaining: 10, urgency: "due_soon" },
  { id: "dl-3", title: "Bookkeeping handoff — July", detail: "Harrison CPA · documents due", due: "2026-08-12", daysRemaining: 7, urgency: "due_soon" },
  { id: "dl-4", title: "Corporate tax instalment", detail: "CRA · Q3 2026", due: "2026-09-30", daysRemaining: 56, urgency: "upcoming" },
  { id: "dl-5", title: "GST/HST return — Q3 2026", detail: "CRA · filing and remittance", due: "2026-10-31", daysRemaining: 87, urgency: "upcoming" },
  { id: "dl-6", title: "Year-end preparation", detail: "Harrison CPA · fiscal close Dec 31", due: "2026-11-30", daysRemaining: 117, urgency: "upcoming" },
];

export const getDeadlines = (): Deadline[] => DEADLINES;

const ACTIVITY: ActivityEntry[] = [
  { id: "act-1", actor: "Sarah Johnson", action: "shared", target: "2025 Notice of Assessment.pdf", when: "2 hours ago" },
  { id: "act-2", actor: "You", action: "uploaded", target: "Bank statement — July 2026.pdf", when: "Yesterday" },
  { id: "act-3", actor: "System", action: "flagged overdue", target: "GST/HST return — Q2 2026", when: "Yesterday" },
  { id: "act-4", actor: "You", action: "issued", target: "INV-1042 to Northwind Trading Ltd.", when: "4 days ago" },
  { id: "act-5", actor: "Sarah Johnson", action: "approved", target: "12 July expenses", when: "6 days ago" },
  { id: "act-6", actor: "You", action: "signed", target: "Engagement letter 2026-27", when: "Jul 2" },
];

export const getActivity = (): ActivityEntry[] => ACTIVITY;

/* -------------------------------------------------------------------------- */
/* Overview roll-up                                                            */
/* -------------------------------------------------------------------------- */

export function getOverview() {
  const invoices = getInvoiceTotals();
  const expenses = getExpenseTotals();
  const taxes = getTaxTotals();
  const months = getMonthly();
  const current = months.at(-1)!;
  const previous = months.at(-2)!;

  const change = (now: number, before: number) =>
    before === 0 ? 0 : ((now - before) / before) * 100;

  return {
    revenueMTD: current.revenue,
    revenueChange: change(current.revenue, previous.revenue),
    expensesMTD: current.expenses,
    expensesChange: change(current.expenses, previous.expenses),
    netMTD: current.net,
    netChange: change(current.net, previous.net),
    cashPosition: 148_320,
    cashChange: change(148_320, 139_600),
    outstanding: invoices.outstanding + invoices.overdue,
    overdueCount: invoices.overdueCount,
    taxOwing: taxes.totalOwing,
    pendingExpenses: expenses.pending,
    revenueTrend: months.map((m) => m.revenue),
    expenseTrend: months.map((m) => m.expenses),
    netTrend: months.map((m) => m.net),
    client_first_name: DEMO_ACCOUNT.firstName as string | null,
    client_business_name: DEMO_ACCOUNT.business as string | null,
    fiscal_year_end: DEMO_ACCOUNT.fiscalYearEnd as string | null,
    accountant_name: DEMO_ACCOUNT.accountant as string | null,
  };
}
