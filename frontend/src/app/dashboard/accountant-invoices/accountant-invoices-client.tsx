"use client";

import { CircleCheck, Clock, Download, FileText, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { KpiTile } from "@/components/charts";
import { InvoiceStatusBadge } from "@/components/dashboard/badges";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { DashboardHeader, KpiRow } from "@/components/dashboard/page-shell";
import { InvoiceDocument } from "@/components/invoice/invoice-document";
import { downloadInvoicePdf } from "@/components/invoice/invoice-pdf";
import { Button, Drawer } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import type { FirmInvoice, FirmInvoiceTotals } from "@/lib/types";

export function AccountantInvoicesClient({
  invoices,
  totals,
  firmName,
  firmLogoUrl,
}: {
  invoices: FirmInvoice[];
  totals: FirmInvoiceTotals | null;
  firmName: string;
  firmLogoUrl: string | null;
}) {
  const [selected, setSelected] = useState<FirmInvoice | null>(null);

  const columns: Column<FirmInvoice>[] = [
    {
      key: "number",
      header: "Invoice",
      cell: (row) => <span className="font-medium text-ink">{row.number}</span>,
      sortValue: (row) => row.number,
    },
    {
      key: "issued",
      header: "Issued",
      cell: (row) => formatDate(row.issued_on),
      sortValue: (row) => row.issued_on,
    },
    {
      key: "due",
      header: "Due",
      cell: (row) => formatDate(row.due_on),
      sortValue: (row) => row.due_on,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      cell: (row) => <span className="font-medium text-ink">{formatMoney(row.total, row.currency)}</span>,
      sortValue: (row) => row.total,
    },
    {
      key: "status",
      header: "Status",
      align: "right",
      cell: (row) => <InvoiceStatusBadge status={row.status} />,
      sortValue: (row) => row.status,
    },
  ];

  const downloadPdf = (invoice: FirmInvoice) =>
    downloadInvoicePdf({
      fromName: firmName,
      fromLogoUrl: firmLogoUrl,
      billToName: invoice.client_name,
      invoice,
      filenameHint: invoice.number,
    });

  return (
    <>
      <DashboardHeader title="Accountant invoices" subtitle="Invoices your accountant has sent you, tracked to payment" />

      <KpiRow>
        <KpiTile tone="blue" value={formatMoney(totals?.billed ?? 0)} label="Total billed" icon={<FileText className="size-5" />} />
        <KpiTile
          tone="green"
          value={formatMoney(totals?.collected ?? 0)}
          label="Paid"
          icon={<CircleCheck className="size-5" />}
        />
        <KpiTile
          tone="amber"
          value={formatMoney(totals?.outstanding ?? 0)}
          label="Outstanding"
          icon={<Clock className="size-5" />}
        />
        <KpiTile
          tone="rose"
          value={formatMoney(totals?.overdue ?? 0)}
          label="Overdue"
          hint={`${totals?.overdue_count ?? 0} invoice${(totals?.overdue_count ?? 0) === 1 ? "" : "s"}`}
          icon={<TriangleAlert className="size-5" />}
        />
      </KpiRow>

      <section className="mt-6 rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">All invoices</h2>
          <p className="mt-0.5 text-[13px] text-muted">Invoices your accountant has issued you</p>
        </div>
        <DataTable
          rows={invoices}
          columns={columns}
          searchKeys={(row) => `${row.number} ${row.title}`}
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
          emptyTitle="No invoices yet"
          emptyDescription="Invoices your accountant sends you will appear here."
          onRowClick={setSelected}
          exportName="spidnums-accountant-invoices"
        />
      </section>

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.number ?? ""}
        subtitle={selected?.title}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelected(null)}>
              Close
            </Button>
            {selected ? (
              <Button icon={<Download className="size-4" />} onClick={() => downloadPdf(selected)}>
                Download PDF
              </Button>
            ) : null}
          </>
        }
      >
        {selected ? (
          <InvoiceDocument
            fromName={firmName}
            fromLogoUrl={firmLogoUrl}
            billToName={selected.client_name}
            invoice={selected}
          />
        ) : null}
      </Drawer>
    </>
  );
}
