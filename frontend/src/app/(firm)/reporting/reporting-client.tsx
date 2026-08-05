"use client";

import {
  ChartCard,
  ColumnChart,
  StackedShare,
  StatTile,
  type Slice,
} from "@/components/charts";
import { compactMoney, formatMoney, formatPercent } from "@/lib/format";

const DEADLINE_SERIES = [
  { key: "due", label: "Due", slot: 2 as const },
  { key: "filed", label: "Filed", slot: 1 as const },
];

export function ReportingClient({
  overview,
  byMonth,
  byCategory,
  workload,
}: {
  overview: ReturnType<typeof import("@/lib/firm-demo").getFirmOverview>;
  byMonth: { x: string; due: number; filed: number }[];
  byCategory: { label: string; value: number }[];
  workload: { name: string; hours: number; capacity: number }[];
}) {
  const slices: Slice[] = byCategory.slice(0, 4).map((entry, index) => ({
    label: entry.label,
    value: entry.value,
    slot: (index + 1) as Slice["slot"],
  }));
  const tail = byCategory.slice(4).reduce((sum, entry) => sum + entry.value, 0);
  if (tail > 0) slices.push({ label: "Other categories", value: tail, slot: 5 });

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Recurring revenue"
          value={formatMoney(overview.recurring_revenue)}
          slot={1}
        />
        <StatTile label="Average fee" value={formatMoney(overview.average_fee)} slot={1} />
        <StatTile
          label="On-time filing rate"
          value={formatPercent(overview.on_time_rate)}
          slot={1}
        />
        <StatTile
          label="Letters awaiting signature"
          value={String(overview.letters_awaiting)}
          slot={2}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <ChartCard
          title="Deadlines by month"
          subtitle="Volume due against volume filed"
          series={DEADLINE_SERIES}
          rows={byMonth}
        >
          <ColumnChart rows={byMonth} series={DEADLINE_SERIES} height={250} />
        </ChartCard>

        <ChartCard
          title="Revenue by service category"
          subtitle="Annualised, from live client assignments"
        >
          <StackedShare slices={slices} format={(value) => compactMoney(value)} />
        </ChartCard>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
          <h2 className="text-[15px] font-semibold text-ink">Workload against capacity</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            Estimated hours on open tasks, per active member
          </p>
          <ul className="mt-4 space-y-3">
            {workload.map((member) => {
              const load = (member.hours / member.capacity) * 100;
              const over = load > 100;
              return (
                <li key={member.name}>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-ink-soft">{member.name}</span>
                    <span
                      className={
                        over
                          ? "font-semibold tabular-nums text-danger"
                          : "tabular-nums text-muted"
                      }
                    >
                      {member.hours}h / {member.capacity}h
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={`h-full rounded-full ${over ? "bg-danger" : "bg-brand"}`}
                      style={{ width: `${Math.min(100, Math.max(2, load))}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rounded-xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
          <h2 className="text-[15px] font-semibold text-ink">Practice health</h2>
          <p className="mt-0.5 text-[13px] text-muted">Computed from live records</p>
          <dl className="mt-4 space-y-4">
            {[
              ["Clients", `${overview.clients_active} active of ${overview.clients_total}`, `${overview.clients_prospect} prospects in the pipeline`],
              ["Deadline load", `${overview.deadlines.overdue + overview.deadlines.due_soon} need attention`, `${overview.deadlines.upcoming} further out, ${overview.deadlines.filed} filed`],
              ["Open work", `${overview.tasks_open} tasks`, `${overview.tasks_blocked} blocked`],
              ["Portal adoption", `${overview.portal_enabled} of ${overview.clients_total} clients`, "Clients who can self-serve documents and deadlines"],
            ].map(([label, value, note]) => (
              <div key={label} className="border-b border-line pb-4 last:border-b-0 last:pb-0">
                <dt className="text-[12.5px] text-muted">{label}</dt>
                <dd className="mt-1 text-[16px] font-bold text-ink">{value}</dd>
                <dd className="mt-0.5 text-[12px] text-muted">{note}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </>
  );
}
