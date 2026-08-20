/**
 * Bridges the real /client-portal/* API into the exact shapes lib/demo.ts
 * already returns, so /dashboard/* pages don't need to change at all — only
 * their data-sourcing line does:
 *
 *   const invoices = (await fetchLiveInvoices()) ?? getInvoices();
 *
 * demo.ts predates this API and uses camelCase field names throughout
 * ("revenueMTD", "cashPosition"); the backend (backend/app/schemas.py) uses
 * snake_case. Every function here does exactly one job: fetch, and rename/
 * translate fields into demo.ts's shape. Nothing here invents data — a field
 * demo.ts doesn't model (e.g. an invoice with status "void", which predates
 * demo.ts's four-value InvoiceStatus) is dropped rather than mis-mapped.
 *
 * Every export returns null on any failure (see apiServer), so `?? getX()`
 * at the call site is always the fallback — this can never break the
 * working demo, only improve on it once real data exists.
 */

import { apiServer } from "./api-server";
import type {
  DocumentFile,
  Employee,
  Expense,
  Invoice,
  PayRun,
  TaxObligation,
  getDocumentTotals,
  getExpenseByCategory,
  getExpenseTotals,
  getInvoiceTotals,
  getOverview,
  getPayrollTotals,
  getTaxTotals,
} from "./demo";
import type {
  CategoryTotal as LiveCategoryTotal,
  ClientBookOverview,
  ClientDocument,
  ClientEmployee,
  ClientExpense,
  ClientExpenseTotals,
  ClientInvoice,
  ClientInvoiceTotals,
  ClientPayRun,
  ClientServiceLink,
  PayrollTotals as LivePayrollTotals,
  ClientTaxObligation,
  TaxTotals as LiveTaxTotals,
  DocumentTotals as LiveDocumentTotals,
} from "./types";

type Overview = ReturnType<typeof getOverview>;
type InvoiceTotals = ReturnType<typeof getInvoiceTotals>;
type ExpenseTotals = ReturnType<typeof getExpenseTotals>;
type PayrollTotals = ReturnType<typeof getPayrollTotals>;
// getTaxTotals()'s `next` is `[...open].sort(...)[0] ?? null`: genuinely
// TaxObligation | null at runtime (empty `open` -> null), but without
// noUncheckedIndexedAccess in tsconfig, TS infers plain TaxObligation for a
// [0] index access and simplifies away the `?? null`. Correct just that field.
type TaxTotals = Omit<ReturnType<typeof getTaxTotals>, "next"> & { next: TaxObligation | null };
type CategoryPoint = ReturnType<typeof getExpenseByCategory>[number];
type DocumentTotals = ReturnType<typeof getDocumentTotals>;

const EMPLOYMENT_LABEL: Record<ClientEmployee["employment_type"], Employee["type"]> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
};

/* -------------------------------------------------------------------------- */
/* Invoices                                                                    */
/* -------------------------------------------------------------------------- */

function mapInvoice(row: ClientInvoice): Invoice | null {
  // demo.ts's InvoiceStatus has no "void" — a cancelled invoice has nothing
  // sensible to become in that union, so it is dropped rather than mislabelled.
  if (row.status === "void") return null;
  return {
    id: row.id,
    number: row.number,
    client: row.customer_name,
    description: row.description ?? "",
    issued: row.issued_on,
    due: row.due_on,
    amount: row.amount,
    tax: row.tax,
    status: row.status,
  };
}

export async function fetchLiveInvoices(): Promise<Invoice[] | null> {
  const rows = await apiServer<ClientInvoice[]>("/client-portal/invoices");
  if (!rows) return null;
  return rows.map(mapInvoice).filter((row): row is Invoice => row !== null);
}

export async function fetchLiveInvoiceTotals(): Promise<InvoiceTotals | null> {
  const totals = await apiServer<ClientInvoiceTotals>("/client-portal/invoices/totals");
  if (!totals) return null;
  return {
    billed: totals.billed,
    collected: totals.collected,
    outstanding: totals.outstanding,
    overdue: totals.overdue,
    count: totals.count,
    overdueCount: totals.overdue_count,
  };
}

/* -------------------------------------------------------------------------- */
/* Expenses                                                                    */
/* -------------------------------------------------------------------------- */

function mapExpense(row: ClientExpense): Expense {
  return {
    id: row.id,
    vendor: row.vendor,
    category: row.category,
    date: row.spent_on,
    amount: row.amount,
    gst: row.gst,
    status: row.status,
    method: row.method ?? "—",
    receipt: row.has_receipt,
  };
}

export async function fetchLiveExpenses(): Promise<Expense[] | null> {
  const rows = await apiServer<ClientExpense[]>("/client-portal/expenses");
  return rows ? rows.map(mapExpense) : null;
}

export async function fetchLiveExpenseTotals(): Promise<ExpenseTotals | null> {
  const totals = await apiServer<ClientExpenseTotals>("/client-portal/expenses/totals");
  if (!totals) return null;
  return {
    total: totals.total,
    approved: totals.approved,
    pending: totals.pending,
    pendingValue: totals.pending_value,
    categories: totals.categories,
    gstPaid: totals.gst_paid,
  };
}

export async function fetchLiveExpenseByCategory(): Promise<CategoryPoint[] | null> {
  const rows = await apiServer<LiveCategoryTotal[]>("/client-portal/expenses/by-category");
  return rows ? rows.map((row) => ({ label: row.label, value: row.value })) : null;
}

/* -------------------------------------------------------------------------- */
/* Payroll                                                                     */
/* -------------------------------------------------------------------------- */

function mapEmployee(row: ClientEmployee): Employee {
  return {
    id: row.id,
    name: row.full_name,
    role: row.role ?? "—",
    type: EMPLOYMENT_LABEL[row.employment_type],
    province: row.province,
    gross: row.gross,
    cpp: row.cpp,
    ei: row.ei,
    tax: row.income_tax,
    net: row.net,
  };
}

function mapPayRun(row: ClientPayRun): PayRun {
  return {
    id: row.id,
    period: row.period_label,
    payDate: row.pay_date,
    employees: row.employee_count,
    gross: row.gross,
    deductions: row.deductions,
    net: row.net,
    status: row.status,
  };
}

export async function fetchLiveEmployees(): Promise<Employee[] | null> {
  const rows = await apiServer<ClientEmployee[]>("/client-portal/payroll/employees");
  return rows ? rows.map(mapEmployee) : null;
}

export async function fetchLivePayRuns(): Promise<PayRun[] | null> {
  const rows = await apiServer<ClientPayRun[]>("/client-portal/payroll/runs");
  return rows ? rows.map(mapPayRun) : null;
}

export async function fetchLivePayrollTotals(): Promise<PayrollTotals | null> {
  const totals = await apiServer<LivePayrollTotals>("/client-portal/payroll/totals");
  if (!totals) return null;
  return {
    active: totals.active,
    monthlyGross: totals.monthly_gross,
    monthlyNet: totals.monthly_net,
    remittance: totals.remittance,
    nextRun: totals.next_run ? mapPayRun(totals.next_run) : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Taxes                                                                       */
/* -------------------------------------------------------------------------- */

function mapTax(row: ClientTaxObligation): TaxObligation {
  return {
    id: row.id,
    name: row.name,
    authority: row.authority,
    period: row.period_label ?? "",
    due: row.due_on,
    amount: row.amount,
    status: row.status,
    daysRemaining: row.days_remaining,
  };
}

export async function fetchLiveTaxes(): Promise<TaxObligation[] | null> {
  const rows = await apiServer<ClientTaxObligation[]>("/client-portal/taxes");
  return rows ? rows.map(mapTax) : null;
}

export async function fetchLiveTaxTotals(): Promise<TaxTotals | null> {
  const totals = await apiServer<LiveTaxTotals>("/client-portal/taxes/totals");
  if (!totals) return null;
  return {
    gstOwing: totals.gst_owing,
    corporateEstimate: totals.corporate_estimate,
    inputTaxCredits: totals.input_tax_credits,
    next: totals.next ? mapTax(totals.next) : null,
    totalOwing: totals.total_owing,
  };
}

/* -------------------------------------------------------------------------- */
/* Documents                                                                   */
/* -------------------------------------------------------------------------- */

function mapDocument(row: ClientDocument): DocumentFile {
  return {
    id: row.id,
    name: row.name,
    // demo.ts's DocumentKind has no "other" — this API can return it (any
    // document that isn't clearly one of the four categories), so it is
    // shown as a receipt rather than added as a fifth kind the existing
    // KIND_LABEL/KIND_TONE maps in documents-client.tsx don't style.
    kind: row.kind === "other" ? "receipt" : row.kind,
    size: row.size_bytes ?? 0,
    uploaded: row.created_at ?? "",
    uploadedBy: row.uploaded_by_name ?? "Unknown",
    shared: row.is_client_visible,
  };
}

export async function fetchLiveDocuments(): Promise<DocumentFile[] | null> {
  const rows = await apiServer<ClientDocument[]>("/client-portal/documents");
  return rows ? rows.map(mapDocument) : null;
}

export async function fetchLiveDocumentTotals(): Promise<DocumentTotals | null> {
  const totals = await apiServer<LiveDocumentTotals>("/client-portal/documents/totals");
  if (!totals) return null;
  return { count: totals.count, bytes: totals.bytes, shared: totals.shared };
}

/* -------------------------------------------------------------------------- */
/* Services                                                                    */
/* -------------------------------------------------------------------------- */

/** No demo.ts equivalent exists (this is a new view) — the real shape is
 * already what the client-portal Services page needs, so no remapping. */
export async function fetchLiveClientServices(): Promise<ClientServiceLink[] | null> {
  return apiServer<ClientServiceLink[]>("/client-portal/services");
}

/* -------------------------------------------------------------------------- */
/* Overview                                                                    */
/* -------------------------------------------------------------------------- */

export async function fetchLiveOverview(): Promise<Overview | null> {
  const live = await apiServer<ClientBookOverview>("/client-portal/overview");
  if (!live) return null;
  return {
    revenueMTD: live.revenue_mtd,
    revenueChange: live.revenue_change,
    expensesMTD: live.expenses_mtd,
    expensesChange: live.expenses_change,
    netMTD: live.net_mtd,
    netChange: live.net_change,
    cashPosition: live.cash_position,
    cashChange: live.cash_change,
    outstanding: live.outstanding,
    overdueCount: live.overdue_count,
    taxOwing: live.tax_owing,
    pendingExpenses: live.pending_expenses,
    revenueTrend: live.monthly.map((m) => m.revenue),
    expenseTrend: live.monthly.map((m) => m.expenses),
    netTrend: live.monthly.map((m) => m.net),
    client_first_name: live.client_first_name,
    client_business_name: live.client_business_name,
    fiscal_year_end: live.fiscal_year_end,
    accountant_name: live.accountant_name,
  };
}

/** The 12-point series `getMonthly()` returns, sourced from the same overview call. */
export async function fetchLiveMonthly(): Promise<{ x: string; revenue: number; expenses: number; net: number }[] | null> {
  const live = await apiServer<ClientBookOverview>("/client-portal/overview");
  return live ? live.monthly : null;
}
