import {
  ArrowRight,
  Banknote,
  CircleAlert,
  Clock,
  Receipt,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { KpiTile, StatTile } from "@/components/charts";
import { InvoiceStatusBadge } from "@/components/dashboard/badges";
import { DashboardHeader, KpiRow } from "@/components/dashboard/page-shell";
import { cn } from "@/lib/cn";
import {
  DEMO_ACCOUNT,
  getActivity,
  getDeadlines,
  getInvoices,
  getMonthly,
  getOverview,
} from "@/lib/demo";
import { formatDate, formatMoney } from "@/lib/format";
import { fetchLiveInvoices, fetchLiveMonthly, fetchLiveOverview } from "@/lib/portal-live";

import { OverviewChart } from "./overview-chart";

export const metadata: Metadata = { title: "Dashboard" };

const URGENCY = {
  overdue: { dot: "bg-danger", text: "text-danger", label: "Overdue" },
  due_soon: { dot: "bg-warn", text: "text-warn", label: "Due soon" },
  upcoming: { dot: "bg-success", text: "text-success", label: "Upcoming" },
} as const;

export default async function DashboardPage() {
  // Upcoming deadlines and recent activity have no /client-portal backing —
  // they mix concepts (CRA filings, firm handoffs, sign-in history) that this
  // API doesn't model for a portal account. They stay on demo data; the KPIs,
  // chart and invoice list below use real data once it exists.
  const deadlines = getDeadlines();
  const activity = getActivity();

  const [overview, months, invoices] = await Promise.all([
    fetchLiveOverview().then((live) => live ?? getOverview()),
    fetchLiveMonthly().then((live) => live ?? getMonthly()),
    fetchLiveInvoices().then((live) => live ?? getInvoices()),
  ]);
  const recentInvoices = invoices.filter((invoice) => invoice.status !== "draft").slice(0, 5);

  return (
    <>
      <DashboardHeader
        title={`Good to see you, ${DEMO_ACCOUNT.firstName}`}
        subtitle={`${DEMO_ACCOUNT.business} · fiscal year ends ${DEMO_ACCOUNT.fiscalYearEnd} · managed by ${DEMO_ACCOUNT.accountant}`}
      />

      <KpiRow>
        <KpiTile
          tone="blue"
          value={formatMoney(overview.cashPosition)}
          label="Cash position"
          hint="Across all accounts"
          icon={<Wallet className="size-5" />}
        />
        <KpiTile
          tone="green"
          value={formatMoney(overview.revenueMTD)}
          label="Revenue this month"
          hint={`${overview.revenueChange >= 0 ? "+" : ""}${overview.revenueChange.toFixed(1)}% vs last month`}
          icon={<TrendingUp className="size-5" />}
        />
        <KpiTile
          tone="amber"
          value={formatMoney(overview.outstanding)}
          label="Outstanding invoices"
          hint={`${overview.overdueCount} overdue`}
          icon={<Clock className="size-5" />}
        />
        <KpiTile
          tone="rose"
          value={formatMoney(overview.taxOwing)}
          label="Tax owing"
          hint="GST/HST, payroll and corporate"
          icon={<Banknote className="size-5" />}
        />
      </KpiRow>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <StatTile
          label="Net profit this month"
          value={formatMoney(overview.netMTD)}
          delta={overview.netChange}
          deltaLabel="vs last month"
          trend={overview.netTrend}
          slot={1}
        />
        <StatTile
          label="Expenses this month"
          value={formatMoney(overview.expensesMTD)}
          delta={overview.expensesChange}
          deltaLabel="vs last month"
          trend={overview.expenseTrend}
          slot={2}
          upIsGood={false}
        />
        <StatTile
          label="Expenses awaiting approval"
          value={String(overview.pendingExpenses)}
          icon={<Receipt className="size-4" />}
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <OverviewChart months={months} />

        <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Upcoming deadlines</h2>
              <p className="mt-0.5 text-[13px] text-muted">CRA filings and handoffs</p>
            </div>
            <Link
              href="/dashboard/taxes"
              className="text-[12.5px] font-semibold text-brand hover:underline"
            >
              View all
            </Link>
          </div>
          <ul className="divide-y divide-line">
            {deadlines.slice(0, 5).map((deadline) => {
              const tone = URGENCY[deadline.urgency];
              return (
                <li key={deadline.id} className="flex items-start gap-3 px-5 py-3.5">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", tone.dot)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-ink">
                      {deadline.title}
                    </p>
                    <p className="truncate text-[12px] text-muted">{deadline.detail}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cn("text-[12px] font-semibold", tone.text)}>
                      {deadline.daysRemaining < 0
                        ? `${Math.abs(deadline.daysRemaining)} days late`
                        : `${deadline.daysRemaining} days`}
                    </p>
                    <p className="text-[11px] text-muted">{formatDate(deadline.due)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Recent invoices</h2>
              <p className="mt-0.5 text-[13px] text-muted">Issued from your account</p>
            </div>
            <Link
              href="/dashboard/invoices"
              className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand hover:underline"
            >
              All invoices
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-line text-[11.5px] tracking-wide text-muted uppercase">
                  <th className="px-5 py-2.5 text-left font-semibold">Invoice</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Client</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Amount</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentInvoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-line last:border-b-0">
                    <td className="px-5 py-3 font-medium text-ink">{invoice.number}</td>
                    <td className="px-5 py-3 text-ink-soft">{invoice.client}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-ink">
                      {formatMoney(invoice.amount + invoice.tax)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <InvoiceStatusBadge status={invoice.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-semibold text-ink">Recent activity</h2>
            <p className="mt-0.5 text-[13px] text-muted">You and your accountant</p>
          </div>
          <ol className="px-5 py-4">
            {activity.map((entry, index) => (
              <li key={entry.id} className="relative flex gap-3 pb-5 last:pb-0">
                {index < activity.length - 1 ? (
                  <span className="absolute top-6 bottom-0 left-[9px] w-px bg-line" aria-hidden />
                ) : null}
                <span className="relative mt-1 grid size-4.5 shrink-0 place-items-center rounded-full bg-brand-soft">
                  <span className="size-1.5 rounded-full bg-brand" />
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] leading-snug text-ink-soft">
                    <strong className="font-semibold text-ink">{entry.actor}</strong> {entry.action}{" "}
                    <span className="text-ink">{entry.target}</span>
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-muted">{entry.when}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {overview.overdueCount > 0 ? (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-danger/25 bg-danger-soft/50 p-4">
          <CircleAlert className="mt-0.5 size-4.5 shrink-0 text-danger" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-ink">
              {overview.overdueCount} invoice{overview.overdueCount === 1 ? "" : "s"} past due
            </p>
            <p className="mt-0.5 text-[13px] text-muted">
              Chasing these first is usually the fastest route to the cash position above.
            </p>
          </div>
          <Link
            href="/dashboard/invoices"
            className="shrink-0 rounded-lg bg-danger px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:brightness-110"
          >
            Review
          </Link>
        </div>
      ) : null}
    </>
  );
}
