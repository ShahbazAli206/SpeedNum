import type { Metadata } from "next";

import { DashboardHeader } from "@/components/dashboard/page-shell";
import {
  getDeadlinesByMonth,
  getFirmOverview,
  getRevenueByCategory,
  getTeam,
} from "@/lib/firm-demo";

import { ReportingClient } from "./reporting-client";

export const metadata: Metadata = { title: "Reporting" };

export default function ReportingPage() {
  const workload = getTeam()
    .filter((member) => member.is_active)
    .map((member) => ({
      name: member.full_name,
      hours: member.estimated_hours,
      capacity: member.weekly_capacity,
    }));

  return (
    <>
      <DashboardHeader
        title="Practice reporting"
        subtitle="Every figure computed from the same records the work runs on — no reconciliation step"
      />
      <ReportingClient
        overview={getFirmOverview()}
        byMonth={getDeadlinesByMonth()}
        byCategory={getRevenueByCategory()}
        workload={workload}
      />
    </>
  );
}
