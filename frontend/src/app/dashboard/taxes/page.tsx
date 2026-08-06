import { Banknote, CalendarClock, ChartPie, Landmark } from "lucide-react";
import type { Metadata } from "next";

import { KpiTile } from "@/components/charts";
import { TaxStatusBadge } from "@/components/dashboard/badges";
import { DashboardHeader, KpiRow } from "@/components/dashboard/page-shell";
import { cn } from "@/lib/cn";
import { DEMO_ACCOUNT, getTaxTotals, getTaxes } from "@/lib/demo";
import { dueLabel, formatDate, formatMoney } from "@/lib/format";
import { fetchLiveTaxTotals, fetchLiveTaxes } from "@/lib/portal-live";

export const metadata: Metadata = { title: "Taxes" };

export default async function TaxesPage() {
  const [obligations, totals] = await Promise.all([
    fetchLiveTaxes().then((live) => live ?? getTaxes()),
    fetchLiveTaxTotals().then((live) => live ?? getTaxTotals()),
  ]);

  const open = obligations
    .filter((item) => item.status !== "filed")
    .sort((a, b) => a.daysRemaining - b.daysRemaining);
  const filed = obligations.filter((item) => item.status === "filed");

  return (
    <>
      <DashboardHeader
        title="Taxes"
        subtitle="GST/HST, corporate and payroll tax"
      />

      <KpiRow>
        <KpiTile
          tone="blue"
          value={formatMoney(totals.gstOwing)}
          label="GST/HST owing"
          icon={<Landmark className="size-5" />}
        />
        <KpiTile
          tone="green"
          value={formatMoney(totals.corporateEstimate)}
          label="Corporate tax (est.)"
          icon={<Banknote className="size-5" />}
        />
        <KpiTile
          tone="amber"
          value={totals.next ? formatDate(totals.next.due) : "—"}
          label="Next deadline"
          hint={totals.next?.name}
          icon={<CalendarClock className="size-5" />}
        />
        <KpiTile
          tone="rose"
          value={formatMoney(totals.inputTaxCredits)}
          label="Input tax credits"
          hint="GST paid on approved expenses"
          icon={<ChartPie className="size-5" />}
        />
      </KpiRow>

      <section className="mt-6 rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">Filings &amp; remittances</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            Estimated tax obligations by period · fiscal year ends {DEMO_ACCOUNT.fiscalYearEnd}
          </p>
        </div>

        <ul className="divide-y divide-line">
          {open.map((item) => {
            const overdue = item.daysRemaining < 0;
            const dueSoon = !overdue && item.daysRemaining <= 14;
            return (
              <li key={item.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <span
                  className={cn(
                    "h-10 w-1 shrink-0 rounded-full",
                    overdue ? "bg-danger" : dueSoon ? "bg-warn" : "bg-success",
                  )}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[14px] font-semibold text-ink">{item.name}</p>
                    <TaxStatusBadge status={item.status} />
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-medium text-muted">
                      {item.authority}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-muted">
                    {item.period} · due {formatDate(item.due, "long")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[15px] font-bold tabular-nums text-ink">
                    {item.amount > 0 ? formatMoney(item.amount) : "—"}
                  </p>
                  <p
                    className={cn(
                      "text-[12px] font-medium",
                      overdue ? "text-danger" : dueSoon ? "text-warn" : "text-muted",
                    )}
                  >
                    {dueLabel(item.daysRemaining)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-6 rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">Filed this year</h2>
          <p className="mt-0.5 text-[13px] text-muted">Completed returns and information slips</p>
        </div>
        <ul className="divide-y divide-line">
          {filed.map((item) => (
            <li key={item.id} className="flex items-center gap-4 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-ink">{item.name}</p>
                <p className="text-[12px] text-muted">
                  {item.period} · {item.authority}
                </p>
              </div>
              <span className="shrink-0 text-[13px] tabular-nums text-muted">
                {item.amount > 0 ? formatMoney(item.amount) : "Nil"}
              </span>
              <span className="shrink-0 text-[12px] text-muted">{formatDate(item.due)}</span>
              <TaxStatusBadge status={item.status} />
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-6 rounded-xl border border-line bg-surface-2/50 p-5">
        <p className="text-[13px] leading-relaxed text-muted">
          Amounts shown are estimates calculated from tracked invoices and expenses. Your
          accountant confirms the final figures at filing — {DEMO_ACCOUNT.accountant} at{" "}
          {DEMO_ACCOUNT.firm} manages this account.
        </p>
      </div>
    </>
  );
}
