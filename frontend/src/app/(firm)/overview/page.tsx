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
import { apiServer } from "@/lib/api-server";
import { cn } from "@/lib/cn";
import { getRecurringRevenueTrend } from "@/lib/firm-demo";
import { formatDate, formatMoney } from "@/lib/format";
import type { Dashboard, Letter, Me, Task } from "@/lib/types";

import { PlatformOverviewClient } from "./platform-overview";
import { RevenueTrendChart } from "./revenue-chart";

export const metadata: Metadata = { title: "Overview" };

export default async function FirmOverviewPage() {
  // A platform superadmin who isn't impersonating is a pure platform operator
  // (see firm/shell.tsx's isProviderOnly): they get the platform-wide view, not
  // a tenant dashboard — regardless of whether their own account happens to
  // carry a firm. While impersonating, this is false and the borrowed firm's
  // own dashboard renders below, same as any other firm login. Checked here
  // rather than only in the shell so this route renders the right thing
  // directly, same as any other page decides its own content.
  const me = await apiServer<Me>("/auth/me");
  const isProviderOnly = Boolean(me?.profile.is_superadmin) && !me?.is_impersonating;
  if (isProviderOnly) {
    return <PlatformOverviewClient />;
  }

  const [dashboard, blockedTasks, declinedLetters] = await Promise.all([
    apiServer<Dashboard>("/dashboard"),
    apiServer<Task[]>("/tasks?status=blocked"),
    apiServer<Letter[]>("/engagements?status=declined"),
  ]);

  if (!dashboard) {
    return (
      <p className="py-14 text-center text-[13.5px] text-muted">
        Could not load the dashboard. Try refreshing.
      </p>
    );
  }

  // "Needs attention" merges three real, already-authorized queries into one
  // ranked list — overdue deadlines (already in dashboard.next_deadlines'
  // sibling bucket counts, re-fetched here as actual rows), blocked tasks,
  // and declined letters. No client_id filter needed: every list endpoint
  // here is already tenant-scoped server-side.
  const overdueDeadlines = dashboard.next_deadlines.filter((d) => d.urgency === "overdue");
  const attention = [
    ...overdueDeadlines.map((deadline) => ({
      id: deadline.id,
      kind: "Overdue deadline",
      title: `${deadline.title}${deadline.period_label ? ` — ${deadline.period_label}` : ""}`,
      who: deadline.client_name,
      owner: deadline.assignee_name,
      detail: `${Math.abs(deadline.days_remaining)} days late`,
      href: "/deadlines",
      tone: "danger" as const,
    })),
    ...(blockedTasks ?? []).map((task) => ({
      id: task.id,
      kind: "Blocked task",
      title: task.title,
      who: task.client_name,
      owner: task.assignee_name,
      detail: task.due_date ? `Due ${formatDate(task.due_date)}` : "No due date",
      href: "/workflows",
      tone: "warn" as const,
    })),
    ...(declinedLetters ?? []).map((letter) => ({
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

  const nextUp = dashboard.next_deadlines
    .filter((deadline) => deadline.status === "open" && deadline.days_remaining >= 0)
    .slice(0, 6);

  // Revenue *trend over time* has no backing endpoint yet (reporting.py has
  // point-in-time breakdowns, not a monthly series) — this one chart stays
  // on illustrative data until that's built; everything else on this page
  // is real. Flagged here rather than silently left demo.
  const revenueTrend = getRecurringRevenueTrend();

  return (
    <>
      <DashboardHeader
        title={`${dashboard.firm_name} — practice overview`}
        subtitle={`${dashboard.clients_active} active clients · ${formatMoney(dashboard.revenue_under_contract)} recurring revenue under contract`}
      />

      <KpiRow>
        <KpiTile
          tone="rose"
          value={String(dashboard.deadlines.overdue)}
          label="Overdue deadlines"
          hint="Needs action today"
          icon={<TriangleAlert className="size-5" />}
        />
        <KpiTile
          tone="amber"
          value={String(dashboard.deadlines.due_soon)}
          label="Due in 14 days"
          hint={`${dashboard.deadlines.upcoming} further out`}
          icon={<CircleAlert className="size-5" />}
        />
        <KpiTile
          tone="blue"
          value={String(dashboard.letters_awaiting_signature)}
          label="Letters awaiting signature"
          hint="Sent or viewed, not signed"
          icon={<Signature className="size-5" />}
        />
        <KpiTile
          tone="green"
          value={formatMoney(dashboard.revenue.paid)}
          label="Revenue collected"
          hint={`${formatMoney(dashboard.revenue.outstanding)} outstanding`}
          icon={<Banknote className="size-5" />}
        />
      </KpiRow>

      <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Clients" value={String(dashboard.clients_total)} icon={<Users className="size-4" />} />
        <StatTile label="Open tasks" value={String(dashboard.tasks_open)} />
        <StatTile label="Due this week" value={String(dashboard.tasks_due_this_week)} />
        <StatTile label="Overdue invoices" value={formatMoney(dashboard.revenue.overdue)} />
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
                        {item.kind} · {item.who ?? "—"} · {item.owner ?? "Unassigned"}
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
            <p className="mt-0.5 text-[13px] text-muted">Open tasks per team member</p>
          </div>
          <ul className="divide-y divide-line">
            {dashboard.workload.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="truncate text-[13.5px] font-medium text-ink">{member.name}</span>
                <span className="shrink-0 text-[12px] tabular-nums text-muted">
                  {member.open_tasks} open
                </span>
              </li>
            ))}
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
                    {deadline.client_name} · {deadline.period_label ?? "—"} ·{" "}
                    {deadline.assignee_name ?? "Unassigned"}
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
            {dashboard.recent_activity.map((entry, index) => (
              <li key={entry.id} className="relative flex gap-3 pb-5 last:pb-0">
                {index < dashboard.recent_activity.length - 1 ? (
                  <span className="absolute top-6 bottom-0 left-[9px] w-px bg-line" aria-hidden />
                ) : null}
                <span className="relative mt-1 grid size-4.5 shrink-0 place-items-center rounded-full bg-brand-soft">
                  <span className="size-1.5 rounded-full bg-brand" />
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] leading-snug text-ink-soft">
                    <strong className="font-semibold text-ink">{entry.actor_email ?? "System"}</strong>{" "}
                    {entry.action} <span className="text-ink">{entry.summary}</span>
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-muted">{formatDate(entry.created_at)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
