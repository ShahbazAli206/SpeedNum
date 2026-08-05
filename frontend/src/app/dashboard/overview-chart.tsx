"use client";

import { ChartCard, LineChart } from "@/components/charts";
import type { MonthPoint } from "@/lib/demo";
import { compactMoney, formatMoney } from "@/lib/format";

const SERIES = [
  { key: "revenue", label: "Revenue", slot: 1 as const },
  { key: "expenses", label: "Expenses", slot: 2 as const },
];

/**
 * Wraps the overview chart so the page itself can stay a server component —
 * the formatter callbacks the chart needs cannot cross the server/client
 * boundary as props.
 */
export function OverviewChart({ months }: { months: MonthPoint[] }) {
  return (
    <ChartCard
      title="Revenue and expenses"
      subtitle="Last twelve months"
      series={SERIES}
      rows={months}
      format={(value) => formatMoney(value)}
    >
      <LineChart
        rows={months}
        series={SERIES}
        height={260}
        area
        format={(value) => compactMoney(value)}
      />
    </ChartCard>
  );
}
