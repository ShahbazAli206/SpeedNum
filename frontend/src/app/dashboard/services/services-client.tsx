"use client";

import { CircleCheck, CircleOff, DollarSign, Tag } from "lucide-react";

import { KpiTile } from "@/components/charts";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { DashboardHeader, KpiRow } from "@/components/dashboard/page-shell";
import { formatMoney, titleCase } from "@/lib/format";
import type { ClientServiceLink } from "@/lib/types";

export function ServicesClient({ services }: { services: ClientServiceLink[] }) {
  const active = services.filter((service) => service.is_active);
  const totalValue = active.reduce((sum, service) => sum + (service.price ?? 0), 0);

  const columns: Column<ClientServiceLink>[] = [
    {
      key: "service",
      header: "Service",
      cell: (row) => (
        <span className="block max-w-64 truncate font-medium text-ink">{row.service_name ?? "—"}</span>
      ),
      sortValue: (row) => row.service_name ?? "",
      exportValue: (row) => row.service_name ?? "",
    },
    {
      key: "cadence",
      header: "Cadence",
      cell: (row) => titleCase(row.frequency_override ?? row.frequency ?? undefined),
      sortValue: (row) => row.frequency_override ?? row.frequency ?? "",
      exportValue: (row) => titleCase(row.frequency_override ?? row.frequency ?? undefined),
    },
    {
      key: "assignee",
      header: "Managed by",
      cell: (row) => row.assignee_name ?? "Unassigned",
      sortValue: (row) => row.assignee_name ?? "",
    },
    {
      key: "price",
      header: "Price",
      align: "right",
      cell: (row) => (row.price != null ? formatMoney(row.price) : "—"),
      sortValue: (row) => row.price ?? 0,
    },
    {
      key: "status",
      header: "Status",
      align: "right",
      cell: (row) => (
        <span
          className={
            row.is_active
              ? "rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success"
              : "rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted"
          }
        >
          {row.is_active ? "Active" : "Inactive"}
        </span>
      ),
      sortValue: (row) => (row.is_active ? "1" : "0"),
      exportValue: (row) => (row.is_active ? "Active" : "Inactive"),
    },
  ];

  return (
    <>
      <DashboardHeader
        title="Services"
        subtitle="What you're engaged for, and at what cadence"
      />

      <KpiRow>
        <KpiTile
          tone="blue"
          value={String(services.length)}
          label="Total services"
          icon={<Tag className="size-5" />}
        />
        <KpiTile
          tone="green"
          value={String(active.length)}
          label="Active"
          icon={<CircleCheck className="size-5" />}
        />
        <KpiTile
          tone="rose"
          value={String(services.length - active.length)}
          label="Inactive"
          icon={<CircleOff className="size-5" />}
        />
        <KpiTile
          tone="amber"
          value={formatMoney(totalValue)}
          label="Active value"
          icon={<DollarSign className="size-5" />}
        />
      </KpiRow>

      <section className="mt-6 rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">All services</h2>
          <p className="mt-0.5 text-[13px] text-muted">Priced and scheduled by your accountant</p>
        </div>
        <DataTable
          rows={services}
          columns={columns}
          searchKeys={(row) => `${row.service_name ?? ""} ${row.service_code ?? ""}`}
          filters={[
            {
              label: "Status",
              options: [
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ],
              predicate: (row, value) => (value === "active" ? row.is_active : !row.is_active),
            },
          ]}
          emptyTitle="No services yet"
          emptyDescription="Your accountant hasn't assigned any services to your account yet."
          exportName="spidnums-services"
        />
      </section>
    </>
  );
}
