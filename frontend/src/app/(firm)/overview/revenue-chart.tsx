"use client";

import { ChartCard, LineChart } from "@/components/charts";
import { cn } from "@/lib/cn";
import { compactMoney } from "@/lib/format";

export function RevenueTrendChart({
  rows,
  changePct,
}: {
  rows: { x: string; revenue: number }[];
  changePct: number;
}) {
  const up = changePct >= 0;
  const series = [{ key: "revenue", label: "Recurring revenue", slot: 5 as const }];

  return (
    <ChartCard
      title="Recurring revenue"
      subtitle="Monthly recurring revenue, last 6 months"
      series={series}
      rows={rows}
      format={(value) => compactMoney(value)}
      action={
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[11.5px] font-bold",
            up ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
          )}
        >
          {up ? "+" : ""}
          {changePct.toFixed(1)}%
        </span>
      }
    >
      <LineChart rows={rows} series={series} format={(value) => compactMoney(value)} area />
    </ChartCard>
  );
}
