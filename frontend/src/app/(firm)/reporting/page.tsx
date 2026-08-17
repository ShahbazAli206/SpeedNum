import type { Metadata } from "next";

import { DashboardHeader } from "@/components/dashboard/page-shell";
import { apiServer } from "@/lib/api-server";
import {
  getDeadlinesByMonth,
  getFirmOverview,
  getRevenueByCategory,
  getTeam,
} from "@/lib/firm-demo";
import type { Reporting } from "@/lib/types";

import { ReportingClient } from "./reporting-client";

export const metadata: Metadata = { title: "Reporting" };

/** GET /reporting (backend/app/routers/reporting.py) computes every figure
 * live from the same tables the rest of the app writes to — no separate
 * analytics store to fall out of sync. Field names differ from the demo
 * fixture's shape, so this maps them to what ReportingClient expects rather
 * than changing that component's (already-used-elsewhere) prop shape. */
function fromLive(data: Reporting) {
  const awaiting = (data.letters.sent ?? 0) + (data.letters.viewed ?? 0);
  const clientsTotal = data.clients_by_status.reduce((sum, row) => sum + row.count, 0);
  const clientsActive = data.clients_by_status.find((row) => row.key === "active")?.count ?? 0;
  const clientsProspect = data.clients_by_status.find((row) => row.key === "prospect")?.count ?? 0;
  const tasksOpen = data.tasks_by_status
    .filter((row) => row.key !== "complete")
    .reduce((sum, row) => sum + row.count, 0);
  const tasksBlocked = data.tasks_by_status.find((row) => row.key === "blocked")?.count ?? 0;
  return {
    overview: {
      recurring_revenue: data.total_annual_fees,
      average_fee: data.average_fee,
      on_time_rate: data.on_time_filing_rate,
      letters_awaiting: awaiting,
      clients_total: clientsTotal,
      clients_active: clientsActive,
      clients_prospect: clientsProspect,
      deadlines: {
        overdue: data.deadlines_open.overdue,
        due_soon: data.deadlines_open.due_soon,
        upcoming: data.deadlines_open.upcoming,
        filed: data.deadlines_by_month.reduce((sum, row) => sum + row.filed, 0),
      },
      tasks_open: tasksOpen,
      tasks_blocked: tasksBlocked,
      portal_enabled: data.portal_enabled_clients,
      unread_notifications: 0,
    },
    byMonth: data.deadlines_by_month.map((row) => ({
      x: row.key,
      due: row.count,
      filed: row.filed,
    })),
    byCategory: data.revenue_by_service.map((row) => ({
      label: row.key,
      value: row.amount,
    })),
    workload: data.workload.map((row) => ({
      name: row.key,
      hours: row.estimated_hours,
      capacity: row.weekly_capacity,
    })),
  };
}

function fromDemo() {
  const workload = getTeam()
    .filter((member) => member.is_active)
    .map((member) => ({
      name: member.full_name,
      hours: member.estimated_hours,
      capacity: member.weekly_capacity,
    }));
  return {
    overview: getFirmOverview(),
    byMonth: getDeadlinesByMonth(),
    byCategory: getRevenueByCategory(),
    workload,
  };
}

export default async function ReportingPage() {
  const live = await apiServer<Reporting>("/reporting");
  const props = live ? fromLive(live) : fromDemo();

  return (
    <>
      <DashboardHeader
        title="Practice reporting"
        subtitle="Every figure computed from the same records the work runs on — no reconciliation step"
      />
      <ReportingClient {...props} />
    </>
  );
}
