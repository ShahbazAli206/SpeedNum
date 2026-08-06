import type { Metadata } from "next";

import { getInvoiceTotals, getInvoices, getMonthly } from "@/lib/demo";
import { fetchLiveInvoiceTotals, fetchLiveInvoices, fetchLiveMonthly } from "@/lib/portal-live";

import { InvoicesClient } from "./invoices-client";

export const metadata: Metadata = { title: "Invoices" };

export default async function InvoicesPage() {
  const [invoices, totals, months] = await Promise.all([
    fetchLiveInvoices().then((live) => live ?? getInvoices()),
    fetchLiveInvoiceTotals().then((live) => live ?? getInvoiceTotals()),
    fetchLiveMonthly().then((live) => live ?? getMonthly()),
  ]);

  // Billed-per-month is derived from the same twelve-month series the overview
  // uses, so the two pages can never disagree.
  const monthly = months.map((month) => ({ x: month.x, billed: month.revenue }));

  return <InvoicesClient invoices={invoices} totals={totals} monthly={monthly} />;
}
