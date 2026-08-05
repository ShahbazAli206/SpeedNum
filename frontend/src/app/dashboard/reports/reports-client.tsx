"use client";

import { useMemo, useState } from "react";

import {
  ChartCard,
  ColumnChart,
  LineChart,
  StackedShare,
  StatTile,
  type Slice,
} from "@/components/charts";
import { cn } from "@/lib/cn";
import type { MonthPoint } from "@/lib/demo";
import { compactMoney, formatMoney, formatPercent } from "@/lib/format";

const RANGES = [
  { value: 3, label: "Last 3 months" },
  { value: 6, label: "Last 6 months" },
  { value: 12, label: "Last 12 months" },
] as const;

const PL_SERIES = [
  { key: "revenue", label: "Revenue", slot: 1 as const },
  { key: "expenses", label: "Expenses", slot: 2 as const },
];

const NET_SERIES = [{ key: "net", label: "Net profit", slot: 1 as const }];

export function ReportsClient({
  monthly,
  categories,
  overview,
  invoiceTotals,
}: {
  monthly: MonthPoint[];
  categories: { label: string; value: number }[];
  overview: ReturnType<typeof import("@/lib/demo").getOverview>;
  invoiceTotals: ReturnType<typeof import("@/lib/demo").getInvoiceTotals>;
}) {
  // One filter row scopes every chart and stat below it.
  const [range, setRange] = useState<(typeof RANGES)[number]["value"]>(12);

  const rows = useMemo(() => monthly.slice(-range), [monthly, range]);

  const summary = useMemo(() => {
    const revenue = rows.reduce((total, row) => total + row.revenue, 0);
    const expenses = rows.reduce((total, row) => total + row.expenses, 0);
    const net = revenue - expenses;
    return {
      revenue,
      expenses,
      net,
      margin: revenue === 0 ? 0 : (net / revenue) * 100,
      average: rows.length ? revenue / rows.length : 0,
      best: [...rows].sort((a, b) => b.net - a.net)[0],
    };
  }, [rows]);

  const slices: Slice[] = categories.slice(0, 4).map((category, index) => ({
    label: category.label,
    value: category.value,
    slot: (index + 1) as Slice["slot"],
  }));
  const tail = categories.slice(4).reduce((sum, category) => sum + category.value, 0);
  if (tail > 0) slices.push({ label: "Other categories", value: tail, slot: 5 });

  const collectionRate =
    invoiceTotals.billed === 0 ? 0 : (invoiceTotals.collected / invoiceTotals.billed) * 100;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] font-medium text-muted">Period</span>
        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
          {RANGES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setRange(option.value)}
              aria-pressed={range === option.value}
              className={cn(
                "rounded-md px-3 py-1.5 text-[13px] font-medium transition",
                range === option.value
                  ? "bg-brand text-white shadow-sm"
                  : "text-muted hover:text-ink",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Revenue"
          value={formatMoney(summary.revenue)}
          trend={rows.map((row) => row.revenue)}
          slot={1}
        />
        <StatTile
          label="Expenses"
          value={formatMoney(summary.expenses)}
          trend={rows.map((row) => row.expenses)}
          slot={2}
          upIsGood={false}
        />
        <StatTile
          label="Net profit"
          value={formatMoney(summary.net)}
          delta={overview.netChange}
          deltaLabel="latest month"
          trend={rows.map((row) => row.net)}
          slot={1}
        />
        <StatTile
          label="Net margin"
          value={formatPercent(summary.margin, 1)}
          trend={rows.map((row) =>
            row.revenue === 0 ? 0 : ((row.revenue - row.expenses) / row.revenue) * 100,
          )}
          slot={1}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <ChartCard
          title="Profit and loss"
          subtitle={`Revenue against expenses, last ${range} months`}
          series={PL_SERIES}
          rows={rows}
          format={(value) => formatMoney(value)}
        >
          <LineChart
            rows={rows}
            series={PL_SERIES}
            height={250}
            area
            format={(value) => compactMoney(value)}
          />
        </ChartCard>

        <ChartCard
          title="Net profit by month"
          subtitle={`Revenue less expenses, last ${range} months`}
          series={NET_SERIES}
          rows={rows}
          format={(value) => formatMoney(value)}
        >
          <ColumnChart
            rows={rows}
            series={NET_SERIES}
            height={250}
            format={(value) => compactMoney(value)}
          />
        </ChartCard>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.3fr]">
        <ChartCard title="Expense mix" subtitle="Share of spending by category">
          <StackedShare slices={slices} format={(value) => formatMoney(value)} />
        </ChartCard>

        <section className="rounded-xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
          <h2 className="text-[15px] font-semibold text-ink">Highlights</h2>
          <p className="mt-0.5 text-[13px] text-muted">Computed from the period above</p>

          <dl className="mt-5 space-y-4">
            <Highlight
              label="Best month"
              value={summary.best ? `${summary.best.x} · ${formatMoney(summary.best.net)}` : "—"}
              note="Highest net profit in the selected period"
            />
            <Highlight
              label="Average monthly revenue"
              value={formatMoney(summary.average)}
              note={`Across ${rows.length} months`}
            />
            <Highlight
              label="Collection rate"
              value={formatPercent(collectionRate)}
              note={`${formatMoney(invoiceTotals.collected)} collected of ${formatMoney(invoiceTotals.billed)} billed`}
            />
            <Highlight
              label="Cash position"
              value={formatMoney(overview.cashPosition)}
              note="Across all connected accounts"
            />
          </dl>
        </section>
      </div>

      <p className="mt-6 rounded-xl border border-line bg-surface-2/50 p-5 text-[13px] leading-relaxed text-muted">
        Every chart on this page has a table view — use the Table toggle in a card header to read
        the exact figures, which is also the accessible path when a colour is hard to distinguish.
      </p>
    </>
  );
}

function Highlight({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="border-b border-line pb-4 last:border-b-0 last:pb-0">
      <dt className="text-[12.5px] text-muted">{label}</dt>
      <dd className="mt-1 text-[16px] font-bold text-ink">{value}</dd>
      <dd className="mt-0.5 text-[12px] text-muted">{note}</dd>
    </div>
  );
}
