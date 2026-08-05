import type { Metadata } from "next";

import { getInvoiceTotals, getInvoices, getMonthly } from "@/lib/demo";

import { InvoicesClient } from "./invoices-client";

export const metadata: Metadata = { title: "Invoices" };

export default function InvoicesPage() {
  // Billed-per-month is derived from the same twelve-month series the overview
  // uses, so the two pages can never disagree.
  const monthly = getMonthly().map((month) => ({ x: month.x, billed: month.revenue }));

  return (
    <InvoicesClient
      invoices={getInvoices()}
      totals={getInvoiceTotals()}
      monthly={monthly}
    />
  );
}
