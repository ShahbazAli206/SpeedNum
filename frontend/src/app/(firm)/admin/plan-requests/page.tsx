import type { Metadata } from "next";

import { DashboardHeader } from "@/components/dashboard/page-shell";

import { PlanRequestsClient } from "./plan-requests-client";

export const metadata: Metadata = { title: "Plan requests" };

export default function PlanRequestsPage() {
  return (
    <>
      <DashboardHeader
        title="Plan requests"
        subtitle="Firms asking to upgrade or downgrade their package — review and apply, or decline"
      />
      <PlanRequestsClient />
    </>
  );
}
