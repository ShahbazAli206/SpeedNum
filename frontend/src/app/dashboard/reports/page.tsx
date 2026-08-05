import type { Metadata } from "next";

import { DashboardHeader } from "@/components/dashboard/page-shell";
import {
  getExpenseByCategory,
  getInvoiceTotals,
  getMonthly,
  getOverview,
} from "@/lib/demo";

import { ReportsClient } from "./reports-client";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <>
      <DashboardHeader
        title="Reports"
        subtitle="Profit and loss, cash flow and spending trends"
      />
      <ReportsClient
        monthly={getMonthly()}
        categories={getExpenseByCategory()}
        overview={getOverview()}
        invoiceTotals={getInvoiceTotals()}
      />
    </>
  );
}
