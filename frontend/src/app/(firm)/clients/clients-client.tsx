"use client";

import { Banknote, Plus, TriangleAlert, UserPlus, Users } from "lucide-react";
import Link from "next/link";

import { KpiTile } from "@/components/charts";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { DashboardHeader, KpiRow } from "@/components/dashboard/page-shell";
import { ButtonLink } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ClientRow } from "@/lib/firm-demo";
import { formatDate, formatMoney } from "@/lib/format";

const STATUS_TONE: Record<string, string> = {
  active: "bg-success-soft text-success",
  prospect: "bg-warn-soft text-warn",
  inactive: "bg-surface-2 text-muted",
  archived: "bg-surface-2 text-muted",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function ClientsClient({
  clients,
  owners,
}: {
  clients: ClientRow[];
  owners: string[];
}) {
  const active = clients.filter((client) => client.status === "active");
  const recurring = clients.reduce((total, client) => total + client.annual_fee, 0);
  const withOverdue = clients.filter((client) => client.overdue_deadlines > 0).length;

  const columns: Column<ClientRow>[] = [
    {
      key: "name",
      header: "Business name",
      cell: (row) => (
        <Link
          href={`/clients/${row.id}`}
          className="flex items-center gap-2.5 transition hover:text-brand"
          onClick={(event) => event.stopPropagation()}
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-brand-soft text-[11px] font-bold text-brand">
            {row.business_name.slice(0, 2).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block max-w-56 truncate font-medium text-ink">
              {row.business_name}
            </span>
            <span className="block text-[11.5px] text-muted">{row.code}</span>
          </span>
        </Link>
      ),
      sortValue: (row) => row.business_name,
    },
    {
      key: "plan",
      header: "Plan",
      cell: (row) => row.plan,
      sortValue: (row) => row.plan,
    },
    {
      key: "fee",
      header: "Monthly fee",
      align: "right",
      cell: (row) => (row.annual_fee > 0 ? formatMoney(row.monthly_fee) : "—"),
      sortValue: (row) => row.monthly_fee,
    },
    {
      key: "owner",
      header: "Assigned to",
      cell: (row) => row.owner_name,
      sortValue: (row) => row.owner_name,
    },
    {
      key: "yearEnd",
      header: "Year-end",
      cell: (row) => `${MONTHS[row.year_end_month - 1]} ${row.year_end_day}`,
      sortValue: (row) => row.year_end_month * 100 + row.year_end_day,
    },
    {
      key: "work",
      header: "Open work",
      align: "right",
      cell: (row) => (
        <span className="inline-flex items-center gap-1.5">
          {row.overdue_deadlines > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-1.5 py-0.5 text-[10.5px] font-bold text-danger">
              {row.overdue_deadlines} late
            </span>
          ) : null}
          <span className="text-muted">
            {row.open_tasks} task{row.open_tasks === 1 ? "" : "s"}
          </span>
        </span>
      ),
      sortValue: (row) => row.overdue_deadlines * 1000 + row.open_tasks,
    },
    {
      key: "next",
      header: "Next due",
      align: "right",
      cell: (row) => (row.next_due_date ? formatDate(row.next_due_date) : "—"),
      sortValue: (row) => row.next_due_date ?? "9999-99-99",
    },
    {
      key: "status",
      header: "Status",
      align: "right",
      cell: (row) => (
        <span
          className={cn(
            "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
            STATUS_TONE[row.status],
          )}
        >
          {row.status}
        </span>
      ),
      sortValue: (row) => row.status,
    },
  ];

  return (
    <>
      <DashboardHeader
        title="Clients"
        subtitle="Manage your clients and their subscriptions"
        actions={
          <>
            <ButtonLink href="/import" variant="secondary" icon={<UserPlus className="size-4" />}>
              Import
            </ButtonLink>
            <ButtonLink href="/clients" icon={<Plus className="size-4" />}>
              Add client
            </ButtonLink>
          </>
        }
      />

      <KpiRow>
        <KpiTile
          tone="blue"
          value={String(clients.length)}
          label="Total clients"
          icon={<Users className="size-5" />}
        />
        <KpiTile
          tone="green"
          value={String(active.length)}
          label="Active clients"
          hint={`${clients.filter((c) => c.portal_enabled).length} with portal access`}
          icon={<Users className="size-5" />}
        />
        <KpiTile
          tone="amber"
          value={String(withOverdue)}
          label="With overdue work"
          icon={<TriangleAlert className="size-5" />}
        />
        <KpiTile
          tone="rose"
          value={formatMoney(recurring)}
          label="Recurring revenue"
          hint="Annual, under contract"
          icon={<Banknote className="size-5" />}
        />
      </KpiRow>

      <section className="mt-6 rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">The client book</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            Every client record — searchable while you work a file
          </p>
        </div>
        <DataTable
          rows={clients}
          columns={columns}
          searchKeys={(row) =>
            `${row.business_name} ${row.legal_name} ${row.code} ${row.owner_name} ${row.city} ${row.tags.join(" ")}`
          }
          filters={[
            {
              label: "Statuses",
              options: [
                { value: "active", label: "Active" },
                { value: "prospect", label: "Prospect" },
                { value: "inactive", label: "Inactive" },
              ],
              predicate: (row, value) => row.status === value,
            },
            {
              label: "Plans",
              options: ["Growth", "Professional", "Starter"].map((plan) => ({
                value: plan,
                label: plan,
              })),
              predicate: (row, value) => row.plan === value,
            },
            {
              label: "Accountants",
              options: owners.map((owner) => ({ value: owner, label: owner })),
              predicate: (row, value) => row.owner_name === value,
            },
          ]}
          emptyTitle="No clients match"
          emptyDescription="Try clearing the search or the filters above."
          exportName="speednum-clients"
        />
      </section>
    </>
  );
}
