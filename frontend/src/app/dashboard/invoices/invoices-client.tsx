"use client";

import { Banknote, CircleCheck, Clock, FileText, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ChartCard, ColumnChart, KpiTile } from "@/components/charts";
import { InvoiceStatusBadge } from "@/components/dashboard/badges";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { DashboardHeader, KpiRow } from "@/components/dashboard/page-shell";
import { useToast } from "@/components/toast";
import { Button, Drawer } from "@/components/ui";
import { ApiError, patch } from "@/lib/api";
import { AUTH_CONFIGURED } from "@/lib/auth";
import type { Invoice } from "@/lib/demo";
import { compactMoney, formatDate, formatMoney } from "@/lib/format";

const SERIES = [{ key: "billed", label: "Billed", slot: 1 as const }];

export function InvoicesClient({
  invoices,
  totals,
  monthly,
}: {
  invoices: Invoice[];
  totals: {
    billed: number;
    collected: number;
    outstanding: number;
    overdue: number;
    overdueCount: number;
  };
  monthly: { x: string; billed: number }[];
}) {
  const toast = useToast();
  const router = useRouter();
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [recordingPayment, setRecordingPayment] = useState(false);

  const recordPayment = async () => {
    if (!selected) return;
    if (!AUTH_CONFIGURED) {
      toast.info("Demo invoice", "This isn't a real invoice — connect a backend to record payments.");
      return;
    }
    setRecordingPayment(true);
    try {
      await patch(`/client-portal/invoices/${selected.id}`, { status: "paid" });
      toast.success("Payment recorded", `${selected.number} is now marked paid.`);
      setSelected(null);
      router.refresh();
    } catch (error) {
      toast.error(
        `Couldn't record payment for ${selected.number}`,
        error instanceof ApiError ? error.message : "Please try again.",
      );
    } finally {
      setRecordingPayment(false);
    }
  };

  const columns: Column<Invoice>[] = [
    {
      key: "number",
      header: "Invoice",
      cell: (row) => <span className="font-medium text-ink">{row.number}</span>,
      sortValue: (row) => row.number,
    },
    {
      key: "client",
      header: "Client",
      cell: (row) => (
        <span className="block max-w-56 truncate">{row.client}</span>
      ),
      sortValue: (row) => row.client,
    },
    {
      key: "issued",
      header: "Issued",
      cell: (row) => formatDate(row.issued),
      sortValue: (row) => row.issued,
    },
    {
      key: "due",
      header: "Due",
      cell: (row) => formatDate(row.due),
      sortValue: (row) => row.due,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      cell: (row) => (
        <span className="font-medium text-ink">{formatMoney(row.amount + row.tax)}</span>
      ),
      sortValue: (row) => row.amount + row.tax,
    },
    {
      key: "status",
      header: "Status",
      align: "right",
      cell: (row) => <InvoiceStatusBadge status={row.status} />,
      sortValue: (row) => row.status,
    },
  ];

  return (
    <>
      <DashboardHeader
        title="Invoices"
        subtitle="Your billing"
        actions={
          <Button
            icon={<FileText className="size-4" />}
            onClick={() =>
              toast.info(
                "Not available here",
                "Invoices are issued by your accountant — reach out to them to request one.",
              )
            }
          >
            New invoice
          </Button>
        }
      />

      <KpiRow>
        <KpiTile
          tone="blue"
          value={formatMoney(totals.billed)}
          label="Total billed"
          icon={<FileText className="size-5" />}
        />
        <KpiTile
          tone="green"
          value={formatMoney(totals.collected)}
          label="Collected"
          icon={<CircleCheck className="size-5" />}
        />
        <KpiTile
          tone="amber"
          value={formatMoney(totals.outstanding)}
          label="Outstanding"
          icon={<Clock className="size-5" />}
        />
        <KpiTile
          tone="rose"
          value={formatMoney(totals.overdue)}
          label="Overdue"
          hint={`${totals.overdueCount} invoice${totals.overdueCount === 1 ? "" : "s"}`}
          icon={<TriangleAlert className="size-5" />}
        />
      </KpiRow>

      <div className="mt-6">
        <ChartCard
          title="Billed by month"
          subtitle="Invoices issued, last twelve months"
          series={SERIES}
          rows={monthly}
          format={(value) => formatMoney(value)}
        >
          <ColumnChart
            rows={monthly}
            series={SERIES}
            height={220}
            format={(value) => compactMoney(value)}
          />
        </ChartCard>
      </div>

      <section className="mt-6 rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">All invoices</h2>
          <p className="mt-0.5 text-[13px] text-muted">Invoices issued to your account</p>
        </div>
        <DataTable
          rows={invoices}
          columns={columns}
          searchKeys={(row) => `${row.number} ${row.client} ${row.description}`}
          filters={[
            {
              label: "Status",
              options: [
                { value: "paid", label: "Paid" },
                { value: "sent", label: "Sent" },
                { value: "overdue", label: "Overdue" },
                { value: "draft", label: "Draft" },
              ],
              predicate: (row, value) => row.status === value,
            },
          ]}
          emptyTitle="No invoices match"
          emptyDescription="Try clearing the search or the status filter."
          onRowClick={setSelected}
          exportName="spidnums-invoices"
        />
      </section>

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.number ?? ""}
        subtitle={selected?.client}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelected(null)}>
              Close
            </Button>
            {selected && selected.status !== "paid" ? (
              <Button icon={<Banknote className="size-4" />} loading={recordingPayment} onClick={recordPayment}>
                Record payment
              </Button>
            ) : null}
          </>
        }
      >
        {selected ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <InvoiceStatusBadge status={selected.status} />
              <span className="font-display text-2xl font-bold text-ink">
                {formatMoney(selected.amount + selected.tax)}
              </span>
            </div>

            <dl className="space-y-3 rounded-xl border border-line p-4">
              <Row label="Description" value={selected.description} />
              <Row label="Issued" value={formatDate(selected.issued, "long")} />
              <Row label="Due" value={formatDate(selected.due, "long")} />
              <Row label="Subtotal" value={formatMoney(selected.amount)} />
              <Row label="GST/HST (5%)" value={formatMoney(selected.tax)} />
              <div className="flex items-center justify-between border-t border-line pt-3">
                <dt className="text-[13.5px] font-semibold text-ink">Total</dt>
                <dd className="text-[15px] font-bold tabular-nums text-ink">
                  {formatMoney(selected.amount + selected.tax)}
                </dd>
              </div>
            </dl>

            {!AUTH_CONFIGURED ? (
              <p className="text-[13px] leading-relaxed text-muted">
                This is sample data. Connect a backend to see real line items, payment history and
                a PDF download.
              </p>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="text-right text-[13.5px] text-ink">{value}</dd>
    </div>
  );
}
