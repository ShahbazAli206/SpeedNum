import { CircleCheck, Clock, Plus, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { KpiTile } from "@/components/charts";
import { InvoiceStatusBadge } from "@/components/dashboard/badges";
import { DashboardHeader, KpiRow } from "@/components/dashboard/page-shell";
import { ButtonLink, EmptyState } from "@/components/ui";
import { apiServer } from "@/lib/api-server";
import { formatDate, formatMoney } from "@/lib/format";
import type { FirmInvoice, FirmInvoiceTotals } from "@/lib/types";

export const metadata: Metadata = { title: "Invoices" };

export default async function InvoicesPage() {
  const [invoices, totals] = await Promise.all([
    apiServer<FirmInvoice[]>("/invoices"),
    apiServer<FirmInvoiceTotals>("/invoices/totals"),
  ]);
  const rows = invoices ?? [];

  return (
    <>
      <DashboardHeader
        title="Invoices"
        subtitle="Invoices you and your team send clients — priced, sent, and tracked to payment"
        actions={
          <ButtonLink href="/invoices/new" icon={<Plus className="size-4" />}>
            New invoice
          </ButtonLink>
        }
      />

      <KpiRow>
        <KpiTile tone="blue" value={formatMoney(totals?.billed ?? 0)} label="Billed" icon={<Clock className="size-5" />} />
        <KpiTile
          tone="green"
          value={formatMoney(totals?.collected ?? 0)}
          label="Collected"
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
          label={`Overdue (${totals?.overdue_count ?? 0})`}
          icon={<TriangleAlert className="size-5" />}
        />
      </KpiRow>

      <section className="mt-6 rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">All invoices</h2>
          <p className="mt-0.5 text-[13px] text-muted">Every invoice issued, across every client</p>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="No invoices yet"
            description="Create your first invoice to bill a client for work performed."
            action={
              <ButtonLink href="/invoices/new" icon={<Plus className="size-4" />}>
                New invoice
              </ButtonLink>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((invoice) => (
              <li key={invoice.id}>
                <Link href={`/invoices/${invoice.id}`} className="block px-5 py-4 transition hover:bg-surface-2">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[14px] font-semibold text-ink">{invoice.number}</p>
                        <InvoiceStatusBadge status={invoice.status} />
                      </div>
                      <p className="mt-0.5 text-[12.5px] text-muted">
                        {invoice.client_name}
                        {invoice.title && invoice.title !== "Invoice" ? ` · ${invoice.title}` : ""}
                      </p>
                      <p className="mt-2 text-[11.5px] text-muted">
                        Issued {formatDate(invoice.issued_on)} · Due {formatDate(invoice.due_on)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-display text-lg font-bold text-ink">{formatMoney(invoice.total, invoice.currency)}</p>
                      {invoice.amount_paid > 0 && invoice.status !== "paid" ? (
                        <p className="text-[11.5px] text-success">{formatMoney(invoice.amount_paid, invoice.currency)} paid</p>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
