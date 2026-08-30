import type { Metadata } from "next";

import { DashboardHeader } from "@/components/dashboard/page-shell";

import { BillingClient } from "./billing-client";

export const metadata: Metadata = { title: "Billing & plan" };

export default function BillingPage() {
  return (
    <>
      <DashboardHeader
        title="Billing & plan"
        subtitle="Your active package, seat usage, and available upgrades or downgrades"
      />
      <BillingClient />
    </>
  );
}
