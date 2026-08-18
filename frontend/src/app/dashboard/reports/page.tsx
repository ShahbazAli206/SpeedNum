import type { Metadata } from "next";

import { DashboardHeader } from "@/components/dashboard/page-shell";
import {
  getExpenseByCategory,
  getInvoiceTotals,
  getMonthly,
  getOverview,
} from "@/lib/demo";
import {
  fetchLiveExpenseByCategory,
  fetchLiveInvoiceTotals,
  fetchLiveMonthly,
  fetchLiveOverview,
} from "@/lib/portal-live";

import { ReportsClient } from "./reports-client";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const [monthly, categories, overview, invoiceTotals] = await Promise.all([
    fetchLiveMonthly().then((live) => live ?? getMonthly()),
    fetchLiveExpenseByCategory().then((live) => live ?? getExpenseByCategory()),
    fetchLiveOverview().then((live) => live ?? getOverview()),
    fetchLiveInvoiceTotals().then((live) => live ?? getInvoiceTotals()),
  ]);

  return (
    <>
      <DashboardHeader
        title="Reports"
        subtitle="Profit and loss, cash flow and spending trends"
      />
      <ReportsClient
        monthly={monthly}
        categories={categories}
        overview={overview}
        invoiceTotals={invoiceTotals}
      />
    </>
  );
}
