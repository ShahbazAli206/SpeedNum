import {
  ArrowRight,
  Banknote,
  CircleAlert,
  Signature,
  TriangleAlert,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { KpiTile, StatTile } from "@/components/charts";
import { DashboardHeader, KpiRow } from "@/components/dashboard/page-shell";
import { cn } from "@/lib/cn";
import {
  FIRM,
  getAudit,
  getDeadlines,
  getFirmOverview,
  getLetters,
  getRecurringRevenueTrend,
  getTasks,
  getTeam,
} from "@/lib/firm-demo";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";

import { RevenueTrendChart } from "./revenue-chart";

export const metadata: Metadata = { title: "Overview" };

export default function FirmOverviewPage() {
  const overview = getFirmOverview();
  const deadlines = getDeadlines();
  const team = getTeam().filter((member) => member.is_active);
  const letters = getLetters();
  const audit = getAudit();

  // "Needs attention" is the point of this page: what is going wrong right now,
  // gathered from three sources into one ranked list.
  const attention = [
    ...deadlines
      .filter((deadline) => deadline.status === "open" && deadline.days_remaining < 0)
      .map((deadline) => ({
        id: deadline.id,
        kind: "Overdue deadline",
        title: `${deadline.title} — ${deadline.period_label}`,
        who: deadline.client_name,
        owner: deadline.assignee_name,
        detail: `${Math.abs(deadline.days_remaining)} days late`,
        href: "/deadlines",
        tone: "danger" as const,
      })),
    ...getTasks()
      .filter((task) => task.status === "blocked")
      .map((task) => ({
        id: task.id,
        kind: "Blocked task",
        title: task.title,
        who: task.client_name,
        owner: task.assignee_name,
        detail: `Due ${formatDate(task.due_date)}`,
        href: "/workflows",
        tone: "warn" as const,
      })),
    ...letters
      .filter((letter) => letter.status === "declined")
      .map((letter) => ({
        id: letter.id,
        kind: "Letter declined",
        title: letter.title,
        who: letter.client_name,
        owner: "—",
        detail: "Scope needs a conversation",
        href: "/engagements",
        tone: "danger" as const,
      })),
  ];

  const nextUp = deadlines
    .filter((deadline) => deadline.status === "open" && deadline.days_remaining >= 0)
    .sort((a, b) => a.days_remaining - b.days_remaining)
    .slice(0, 6);

  const revenueTrend = getRecurringRevenueTrend();

  return (
    <>
      <DashboardHeader
        title={`${FIRM.name} — practice overview`}
        subtitle={`${overview.clients_active} active clients · ${team.length} staff · ${formatMoney(overview.recurring_revenue)} recurring revenue under contract`}
      />

      <KpiRow>
        <KpiTile
          tone="rose"
          value={String(overview.deadlines.overdue)}
          label="Overdue deadlines"
          hint="Needs action today"
          icon={<TriangleAlert className="size-5" />}
        />
        <KpiTile
          tone="amber"
          value={String(overview.deadlines.due_soon)}
          label="Due in 14 days"
          hint={`${overview.deadlines.upcoming} further out`}
          icon={<CircleAlert className="size-5" />}
        />
        <KpiTile
          tone="blue"
          value={String(overview.letters_awaiting)}
          label="Letters awaiting signature"
          hint="Sent or viewed, not signed"
          icon={<Signature className="size-5" />}
        />
        <KpiTile
          tone="green"
          value={formatMoney(overview.recurring_revenue)}
          label="Recurring revenue"
          hint={`Average fee ${formatMoney(overview.average_fee)}`}
          icon={<Banknote className="size-5" />}
        />
      </KpiRow>

      <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Clients" value={String(overview.clients_total)} icon={<Users className="size-4" />} />
        <StatTile label="Open tasks" value={String(overview.tasks_open)} />
        <StatTile label="On-time filing rate" value={formatPercent(overview.on_time_rate)} />
        <StatTile label="Portal enabled" value={`${overview.portal_enabled} of ${overview.clients_total}`} />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Needs attention</h2>
              <p className="mt-0.5 text-[13px] text-muted">
                Overdue filings, blocked work and declined scope
              </p>
            </div>
            <span className="rounded-full bg-danger-soft px-2.5 py-1 text-[11.5px] font-bold text-danger">
              {attention.length}
            </span>
          </div>

          {attention.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13.5px] text-muted">
              Nothing is overdue or blocked. Rare and worth enjoying.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {attention.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="flex items-start gap-3 px-5 py-3.5 transition hover:bg-surface-2"
                  >
                    <span
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        item.tone === "danger" ? "bg-danger" : "bg-warn",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium text-ink">{item.title}</p>
                      <p className="truncate text-[12px] text-muted">
                        {item.kind} · {item.who} · {item.owner}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-[12px] font-semibold",
                        item.tone === "danger" ? "text-danger" : "text-warn",
                      )}
                    >
                      {item.detail}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-semibold text-ink">Workload</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              Estimated hours against weekly capacity
            </p>
          </div>
          <ul className="divide-y divide-line">
            {team.map((member) => {
              const load = Math.min(
                100,
                Math.round((member.estimated_hours / member.weekly_capacity) * 100),
              );
              const over = member.estimated_hours > member.weekly_capacity;
              return (
                <li key={member.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-[13.5px] font-medium text-ink">
                      {member.full_name}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-[12px] tabular-nums",
                        over ? "font-semibold text-danger" : "text-muted",
                      )}
                    >
                      {member.estimated_hours}h / {member.weekly_capacity}h
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={cn("h-full rounded-full", over ? "bg-danger" : "bg-brand")}
                      style={{ width: `${Math.max(3, load)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <div className="mt-6">
        <RevenueTrendChart rows={revenueTrend.rows} changePct={revenueTrend.change_pct} />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Next up</h2>
              <p className="mt-0.5 text-[13px] text-muted">Soonest open deadlines</p>
            </div>
            <Link
              href="/deadlines"
              className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand hover:underline"
            >
              The board
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
          <ul className="divide-y divide-line">
            {nextUp.map((deadline) => (
              <li key={deadline.id} className="flex items-center gap-3 px-5 py-3">
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    deadline.urgency === "due_soon" ? "bg-warn" : "bg-success",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-ink">
                    {deadline.title}
                  </span>
                  <span className="block truncate text-[12px] text-muted">
                    {deadline.client_name} · {deadline.period_label} · {deadline.assignee_name}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[12px] font-semibold text-ink-soft">
                    {deadline.days_remaining} days
                  </span>
                  <span className="block text-[11px] text-muted">
                    {formatDate(deadline.due_date)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-semibold text-ink">Recent activity</h2>
            <p className="mt-0.5 text-[13px] text-muted">Append-only audit log</p>
          </div>
          <ol className="px-5 py-4">
            {audit.map((entry, index) => (
              <li key={entry.id} className="relative flex gap-3 pb-5 last:pb-0">
                {index < audit.length - 1 ? (
                  <span className="absolute top-6 bottom-0 left-[9px] w-px bg-line" aria-hidden />
                ) : null}
                <span className="relative mt-1 grid size-4.5 shrink-0 place-items-center rounded-full bg-brand-soft">
                  <span className="size-1.5 rounded-full bg-brand" />
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] leading-snug text-ink-soft">
                    <strong className="font-semibold text-ink">{entry.actor}</strong> {entry.action}{" "}
                    <span className="text-ink">{entry.summary}</span>
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-muted">{entry.when}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
