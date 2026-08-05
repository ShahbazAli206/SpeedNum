import { Clock, TriangleAlert, UserPlus, Users } from "lucide-react";
import type { Metadata } from "next";

import { KpiTile } from "@/components/charts";
import { DashboardHeader, KpiRow } from "@/components/dashboard/page-shell";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getTeam } from "@/lib/firm-demo";
import { titleCase } from "@/lib/format";

export const metadata: Metadata = { title: "Team" };

const ROLE_TONE: Record<string, string> = {
  owner: "bg-brand-soft text-brand",
  admin: "bg-info-soft text-info",
  member: "bg-surface-2 text-ink-soft",
  viewer: "bg-surface-2 text-muted",
};

export default function TeamPage() {
  const team = getTeam();
  const active = team.filter((member) => member.is_active);
  const totalHours = active.reduce((total, member) => total + member.estimated_hours, 0);
  const totalCapacity = active.reduce((total, member) => total + member.weekly_capacity, 0);
  const overloaded = active.filter(
    (member) => member.estimated_hours > member.weekly_capacity,
  ).length;

  return (
    <>
      <DashboardHeader
        title="Team"
        subtitle="Workload computed from the task records — not self-reported, so it cannot drift"
        actions={<Button icon={<UserPlus className="size-4" />}>Invite member</Button>}
      />

      <KpiRow>
        <KpiTile
          tone="blue"
          value={String(active.length)}
          label="Active members"
          hint={`${team.length - active.length} deactivated`}
          icon={<Users className="size-5" />}
        />
        <KpiTile
          tone="green"
          value={`${Math.round((totalHours / totalCapacity) * 100)}%`}
          label="Firm utilisation"
          hint={`${totalHours}h of ${totalCapacity}h weekly`}
          icon={<Clock className="size-5" />}
        />
        <KpiTile
          tone="amber"
          value={String(overloaded)}
          label="Over capacity"
          hint="Estimated hours exceed weekly capacity"
          icon={<TriangleAlert className="size-5" />}
        />
        <KpiTile
          tone="rose"
          value={String(active.reduce((total, member) => total + member.overdue, 0))}
          label="Overdue items held"
          icon={<TriangleAlert className="size-5" />}
        />
      </KpiRow>

      <section className="mt-6 rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">Roster</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            Clients handled, open tasks and load against weekly capacity
          </p>
        </div>

        <ul className="divide-y divide-line">
          {team.map((member) => {
            const load =
              member.weekly_capacity === 0
                ? 0
                : (member.estimated_hours / member.weekly_capacity) * 100;
            const over = load > 100;

            return (
              <li
                key={member.id}
                className={cn("px-5 py-4", !member.is_active && "opacity-55")}
              >
                <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-[13px] font-bold text-brand">
                    {member.full_name
                      .split(" ")
                      .map((part) => part[0])
                      .join("")}
                  </span>

                  <span className="min-w-40 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold text-ink">
                        {member.full_name}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase",
                          ROLE_TONE[member.role],
                        )}
                      >
                        {member.role}
                      </span>
                      {!member.is_active ? (
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-semibold text-muted">
                          Deactivated
                        </span>
                      ) : null}
                    </span>
                    <span className="block text-[12.5px] text-muted">
                      {member.title} · {member.email}
                    </span>
                  </span>

                  <dl className="flex items-center gap-6 text-center">
                    <div>
                      <dt className="text-[11px] tracking-wide text-muted uppercase">Clients</dt>
                      <dd className="text-[15px] font-bold tabular-nums text-ink">
                        {member.clients}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] tracking-wide text-muted uppercase">
                        Open tasks
                      </dt>
                      <dd className="text-[15px] font-bold tabular-nums text-ink">
                        {member.open_tasks}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] tracking-wide text-muted uppercase">Overdue</dt>
                      <dd
                        className={cn(
                          "text-[15px] font-bold tabular-nums",
                          member.overdue > 0 ? "text-danger" : "text-ink",
                        )}
                      >
                        {member.overdue}
                      </dd>
                    </div>
                  </dl>

                  <div className="w-full sm:w-52">
                    <div className="flex items-center justify-between text-[11.5px]">
                      <span className="text-muted">Load</span>
                      <span
                        className={cn(
                          "tabular-nums",
                          over ? "font-semibold text-danger" : "text-muted",
                        )}
                      >
                        {member.estimated_hours}h / {member.weekly_capacity}h
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                      <div
                        className={cn(
                          "h-full rounded-full transition-[width] duration-700",
                          over ? "bg-danger" : load > 75 ? "bg-warn" : "bg-brand",
                        )}
                        style={{ width: `${Math.min(100, Math.max(2, load))}%` }}
                      />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <section className="rounded-xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
          <h2 className="text-[15px] font-semibold text-ink">Roles</h2>
          <p className="mt-0.5 text-[13px] text-muted">Enforced at the API, not just hidden in the UI</p>
          <dl className="mt-4 space-y-3">
            {[
              ["Owner", "Full access including billing and tenant settings."],
              ["Admin", "Everything except billing; can define custom fields and invite users."],
              ["Member", "Works clients, tasks and deadlines assigned to them or their book."],
              ["Viewer", "Read-only. Useful for seasonal staff and external reviewers."],
            ].map(([role, description]) => (
              <div key={role}>
                <dt className="text-[13.5px] font-semibold text-ink">{role}</dt>
                <dd className="text-[12.5px] leading-relaxed text-muted">{description}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
          <h2 className="text-[15px] font-semibold text-ink">Distribution</h2>
          <p className="mt-0.5 text-[13px] text-muted">Active members by role</p>
          <ul className="mt-4 space-y-3">
            {(["owner", "admin", "member", "viewer"] as const).map((role) => {
              const count = team.filter((member) => member.role === role).length;
              const share = (count / team.length) * 100;
              return (
                <li key={role}>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-ink-soft">{titleCase(role)}</span>
                    <span className="tabular-nums text-muted">{count}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${Math.max(2, share)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </>
  );
}
