import type { Metadata } from "next";

import { DashboardHeader } from "@/components/dashboard/page-shell";

import { BillsClient } from "./bills-client";

export const metadata: Metadata = { title: "Bills" };

export default function BillsPage() {
  return (
    <>
      <DashboardHeader
        title="Bills"
        subtitle="What the firm spends running the practice, including your SpeedNum subscription"
      />
      <BillsClient />
    </>
  );
}
