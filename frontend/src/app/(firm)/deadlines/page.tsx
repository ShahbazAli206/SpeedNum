import { CalendarCheck, CircleCheck, Clock, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { KpiTile } from "@/components/charts";
import { DashboardHeader, KpiRow } from "@/components/dashboard/page-shell";
import { cn } from "@/lib/cn";
import { getDeadlines, getFirmOverview } from "@/lib/firm-demo";
import { dueLabel, formatDate } from "@/lib/format";
import type { Urgency } from "@/lib/types";

export const metadata: Metadata = { title: "Deadlines" };

/**
 * The SLA board. Grouping and colour follow the one rule shared by the
 * dashboard, the client portal and the email digest: overdue is red, within 14
 * days is orange, beyond that is green.
 */
const GROUPS: {
  urgency: Urgency;
  label: string;
  bar: string;
  chip: string;
  date: string;
  blurb: string;
}[] = [
  {
    urgency: "overdue",
    label: "Overdue",
    bar: "bg-danger",
    chip: "bg-danger-soft text-danger",
    date: "text-danger",
    blurb: "Past the filing date — action today",
  },
  {
    urgency: "due_soon",
    label: "Due soon",
    bar: "bg-warn",
    chip: "bg-warn-soft text-warn",
    date: "text-warn",
    blurb: "Inside 14 days",
  },
  {
    urgency: "upcoming",
    label: "Upcoming",
    bar: "bg-success",
    chip: "bg-success-soft text-success",
    date: "text-success",
    blurb: "More than 14 days out",
  },
];

export default function DeadlinesPage() {
  const deadlines = getDeadlines();
  const overview = getFirmOverview();

  const open = deadlines.filter((deadline) => deadline.status === "open");
  const snoozed = deadlines.filter((deadline) => deadline.status === "snoozed");
  const filed = deadlines
    .filter((deadline) => deadline.status === "filed")
    .sort((a, b) => b.due_date.localeCompare(a.due_date));

  return (
    <>
      <DashboardHeader
        title="Deadlines"
        subtitle="Generated from each client's fiscal year-end and service cadences — rolled past weekends and Canadian statutory holidays"
      />

      <KpiRow>
        <KpiTile
          tone="rose"
          value={String(overview.deadlines.overdue)}
          label="Overdue"
          icon={<TriangleAlert className="size-5" />}
        />
        <KpiTile
          tone="amber"
          value={String(overview.deadlines.due_soon)}
          label="Due soon"
          hint="Within 14 days"
          icon={<Clock className="size-5" />}
        />
        <KpiTile
          tone="green"
          value={String(overview.deadlines.upcoming)}
          label="On track"
          icon={<CalendarCheck className="size-5" />}
        />
        <KpiTile
          tone="blue"
          value={String(overview.deadlines.filed)}
          label="Filed"
          hint={`${overview.on_time_rate}% on time`}
          icon={<CircleCheck className="size-5" />}
        />
      </KpiRow>

      <div className="mt-6 space-y-5">
        {GROUPS.map((group) => {
          const rows = open
            .filter((deadline) => deadline.urgency === group.urgency)
            .sort((a, b) => a.days_remaining - b.days_remaining);

          return (
            <section
              key={group.urgency}
              className="overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]"
            >
              <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
                <span className={cn("h-6 w-1 shrink-0 rounded-full", group.bar)} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[14.5px] font-bold text-ink">{group.label}</h2>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums",
                        group.chip,
                      )}
                    >
                      {rows.length}
                    </span>
                  </div>
                  <p className="text-[12.5px] text-muted">{group.blurb}</p>
                </div>
              </div>

              {rows.length === 0 ? (
                <p className="px-5 py-8 text-center text-[13px] text-muted">
                  Nothing in this group.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {rows.map((deadline) => (
                    <li
                      key={deadline.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-[13.5px] font-semibold text-ink">
                            {deadline.title}
                          </span>
                          <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted">
                            {deadline.service_code}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-[12.5px] text-muted">
                          <Link
                            href={`/clients/${deadline.client_id}`}
                            className="transition hover:text-brand hover:underline"
                          >
                            {deadline.client_name}
                          </Link>
                          {" · "}
                          {deadline.period_label}
                        </span>
                      </span>

                      <span className="flex items-center gap-1.5 text-[12.5px] text-muted">
                        <span className="grid size-5 place-items-center rounded-full bg-brand-soft text-[9px] font-bold text-brand">
                          {deadline.assignee_name
                            .split(" ")
                            .map((part) => part[0])
                            .join("")}
                        </span>
                        {deadline.assignee_name}
                      </span>

                      <span className="w-32 shrink-0 text-right">
                        <span className={cn("block text-[12.5px] font-semibold", group.date)}>
                          {dueLabel(deadline.days_remaining)}
                        </span>
                        <span className="block text-[11.5px] text-muted">
                          {formatDate(deadline.due_date)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}

        {snoozed.length > 0 ? (
          <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
            <div className="border-b border-line px-5 py-3.5">
              <h2 className="text-[14.5px] font-bold text-ink">Snoozed</h2>
              <p className="text-[12.5px] text-muted">
                Hidden from triage until their snooze expires
              </p>
            </div>
            <ul className="divide-y divide-line">
              {snoozed.map((deadline) => (
                <li key={deadline.id} className="flex items-center gap-4 px-5 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-ink">
                      {deadline.title}
                    </span>
                    <span className="block text-[12px] text-muted">
                      {deadline.client_name} · {deadline.period_label}
                    </span>
                  </span>
                  <span className="shrink-0 text-[12px] text-muted">
                    {formatDate(deadline.due_date)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
          <div className="border-b border-line px-5 py-3.5">
            <h2 className="text-[14.5px] font-bold text-ink">Recently filed</h2>
            <p className="text-[12.5px] text-muted">
              On-time rate is measured from these, not estimated
            </p>
          </div>
          <ul className="divide-y divide-line">
            {filed.map((deadline) => {
              const late =
                deadline.filed_at !== undefined && deadline.filed_at > deadline.due_date;
              return (
                <li key={deadline.id} className="flex items-center gap-4 px-5 py-3">
                  <CircleCheck
                    className={cn("size-4 shrink-0", late ? "text-warn" : "text-success")}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-ink">{deadline.title}</span>
                    <span className="block text-[12px] text-muted">
                      {deadline.client_name} · {deadline.period_label} · {deadline.assignee_name}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span
                      className={cn(
                        "block text-[12px] font-medium",
                        late ? "text-warn" : "text-success",
                      )}
                    >
                      {late ? "Filed late" : "On time"}
                    </span>
                    <span className="block text-[11.5px] text-muted">
                      Filed {deadline.filed_at ? formatDate(deadline.filed_at) : "—"} · due{" "}
                      {formatDate(deadline.due_date)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </>
  );
}
