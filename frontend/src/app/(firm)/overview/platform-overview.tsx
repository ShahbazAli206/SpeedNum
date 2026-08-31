"use client";

/**
 * Landing page for a provider-only login (no company of their own, or their
 * one tenant is the platform's own workspace) — see shell.tsx's isProviderOnly.
 * The regular /overview (this route's page.tsx) needs a real tenant's
 * dashboard data and has nothing to show them; this is what they get instead
 * of the "no firm here" placeholder — a cross-tenant view of the whole
 * platform: every company, their staff and clients, what they've paid us,
 * what running the platform costs, and recent account activity. Every figure
 * comes from the same superadmin-only endpoints the Admin console pages read
 * (admin.py / platform_finance.py), read-only here — management actions
 * (create/edit/suspend/delete a firm, log income/expenses) stay on their own
 * pages, linked from here rather than duplicated.
 */

import {
  ArrowRight,
  Banknote,
  Building2,
  FileSignature,
  TrendingDown,
  TrendingUp,
  Users as UsersIcon,
  Wallet,
} from "lucide-react";
import Link from "next/link";

import { ChartCard, ColumnChart, KpiTile, StackedShare, StatTile, type Slice } from "@/components/charts";
import { DashboardHeader, KpiRow } from "@/components/dashboard/page-shell";
import { Badge, ButtonLink, LoadingBlock, Table, TD, TH } from "@/components/ui";
import type { PlatformStats, TenantSummary } from "@/lib/admin";
import { formatDate, formatMoney } from "@/lib/format";
import { useApi } from "@/lib/hooks";

interface FinanceSummary {
  total_income: string;
  total_expenses: string;
  profit: string;
  income_count: number;
  expense_count: number;
}

interface ExpenseEntry {
  id: string;
  category: string;
  amount: string;
}

interface AuditEntry {
  id: string;
  created_at: string;
  actor_email: string | null;
  action: string;
  entity: string;
  tenant_name: string | null;
  summary: string | null;
}

const EXPENSE_LABELS: Record<string, string> = {
  hosting: "Hosting",
  domains: "Domains",
  development: "Development",
  maintenance: "Maintenance",
  other: "Other",
};

export function PlatformOverviewClient() {
  const stats = useApi<PlatformStats>("/admin/stats");
  const tenants = useApi<TenantSummary[]>("/admin/tenants");
  const finance = useApi<FinanceSummary>("/admin/finance/summary");
  const expenses = useApi<ExpenseEntry[]>("/admin/finance/expenses");
  const audit = useApi<AuditEntry[]>("/admin/audit");

  const companies = tenants.data ?? [];
  const topByClients = [...companies].sort((a, b) => b.clients - a.clients).slice(0, 8);
  const clientRows = topByClients.map((tenant) => ({
    x: tenant.name.length > 14 ? `${tenant.name.slice(0, 13)}…` : tenant.name,
    clients: tenant.clients,
  }));
  const clientSeries = [{ key: "clients", label: "Clients", slot: 1 as const }];

  const expenseTotals = (expenses.data ?? []).reduce<Record<string, number>>((totals, entry) => {
    totals[entry.category] = (totals[entry.category] ?? 0) + Number(entry.amount);
    return totals;
  }, {});
  const expenseSlices: Slice[] = Object.entries(expenseTotals)
    .sort(([, a], [, b]) => b - a)
    .map(([category, value], index) => ({
      label: EXPENSE_LABELS[category] ?? category,
      value,
      slot: ((index % 5) + 1) as Slice["slot"],
    }));

  const recentActivity = (audit.data ?? []).slice(0, 8);

  return (
    <>
      <DashboardHeader
        title="Platform dashboard"
        subtitle="Every company running on SpeedNum — staff, clients, billing and recent activity."
        actions={<ButtonLink href="/admin">Open Admin console</ButtonLink>}
      />

      <KpiRow>
        <KpiTile
          tone="blue"
          value={stats.data ? String(stats.data.tenants) : "—"}
          label="Companies"
          hint={stats.data ? `${stats.data.active_tenants} active` : undefined}
          icon={<Building2 className="size-5" />}
        />
        <KpiTile
          tone="amber"
          value={stats.data ? String(stats.data.trialing_tenants) : "—"}
          label="Trialing"
          hint={stats.data ? `${stats.data.suspended_tenants} suspended` : undefined}
          icon={<UsersIcon className="size-5" />}
        />
        <KpiTile
          tone="green"
          value={finance.data ? formatMoney(Number(finance.data.total_income)) : "—"}
          label="Dues collected"
          hint={finance.data ? `${finance.data.income_count} payments logged` : undefined}
          icon={<TrendingUp className="size-5" />}
        />
        <KpiTile
          tone="rose"
          value={finance.data ? formatMoney(Number(finance.data.total_expenses)) : "—"}
          label="Platform expenses"
          hint={finance.data ? `${finance.data.expense_count} entries logged` : undefined}
          icon={<TrendingDown className="size-5" />}
        />
      </KpiRow>

      <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Profit"
          value={finance.data ? formatMoney(Number(finance.data.profit)) : "—"}
          icon={<Wallet className="size-4" />}
        />
        <StatTile
          label="Staff across companies"
          value={stats.data ? String(stats.data.users) : "—"}
          icon={<UsersIcon className="size-4" />}
        />
        <StatTile
          label="Clients across companies"
          value={stats.data ? String(stats.data.clients) : "—"}
          icon={<Banknote className="size-4" />}
        />
        <StatTile
          label="Signed letters"
          value={stats.data ? String(stats.data.letters_signed) : "—"}
          icon={<FileSignature className="size-4" />}
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <ChartCard
          title="Clients by company"
          subtitle="Top companies by active client count"
          series={clientSeries}
          rows={clientRows}
        >
          {clientRows.length ? (
            <ColumnChart rows={clientRows} series={clientSeries} />
          ) : (
            <p className="py-14 text-center text-[13px] text-muted">No companies yet.</p>
          )}
        </ChartCard>

        <ChartCard title="Expenses by category" subtitle="Where platform costs go">
          {expenseSlices.length ? (
            <StackedShare slices={expenseSlices} format={(value) => formatMoney(value)} />
          ) : (
            <p className="py-14 text-center text-[13px] text-muted">No expenses logged yet.</p>
          )}
        </ChartCard>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <section className="rounded-xl border border-line bg-surface shadow-card">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Companies</h2>
              <p className="mt-0.5 text-[13px] text-muted">
                {companies.length} {companies.length === 1 ? "company" : "companies"} on the platform
              </p>
            </div>
            <Link
              href="/admin"
              className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand hover:underline"
            >
              Manage
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
          {tenants.isLoading ? (
            <LoadingBlock label="Loading companies…" />
          ) : !companies.length ? (
            <p className="px-5 py-10 text-center text-[13.5px] text-muted">
              No companies provisioned yet.
            </p>
          ) : (
            <div className="scroll-thin overflow-x-auto">
              <Table>
                <thead>
                  <tr>
                    <TH>Company</TH>
                    <TH>Admin</TH>
                    <TH>Plan</TH>
                    <TH align="right">Clients</TH>
                    <TH align="right">Staff</TH>
                    <TH align="center">Status</TH>
                    <TH align="right">Created</TH>
                  </tr>
                </thead>
                <tbody>
                  {companies.slice(0, 8).map((tenant) => (
                    <tr key={tenant.id}>
                      <TD className="font-medium text-ink">{tenant.name}</TD>
                      <TD>{tenant.admin_email ?? "—"}</TD>
                      <TD className="capitalize">{tenant.plan}</TD>
                      <TD align="right">{tenant.clients}</TD>
                      <TD align="right">{tenant.users}</TD>
                      <TD align="center">
                        <Badge tone={tenant.is_active ? "success" : "danger"}>
                          {tenant.is_active ? "Active" : "Suspended"}
                        </Badge>
                      </TD>
                      <TD align="right">{formatDate(tenant.created_at)}</TD>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-line bg-surface shadow-card">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-semibold text-ink">Recent account activity</h2>
            <p className="mt-0.5 text-[13px] text-muted">Updates across every company on the platform</p>
          </div>
          {audit.isLoading ? (
            <LoadingBlock label="Loading activity…" />
          ) : !recentActivity.length ? (
            <p className="px-5 py-10 text-center text-[13.5px] text-muted">No activity yet.</p>
          ) : (
            <ol className="px-5 py-4">
              {recentActivity.map((entry, index) => (
                <li key={entry.id} className="relative flex gap-3 pb-5 last:pb-0">
                  {index < recentActivity.length - 1 ? (
                    <span className="absolute top-6 bottom-0 left-[9px] w-px bg-line" aria-hidden />
                  ) : null}
                  <span className="relative mt-1 grid size-4.5 shrink-0 place-items-center rounded-full bg-brand-soft">
                    <span className="size-1.5 rounded-full bg-brand" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] leading-snug text-ink-soft">
                      <strong className="font-semibold text-ink">{entry.actor_email ?? "System"}</strong>{" "}
                      {entry.action}{" "}
                      <span className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-muted">
                        {entry.entity}
                      </span>
                      {entry.tenant_name ? ` · ${entry.tenant_name}` : ""}
                      {entry.summary ? ` — ${entry.summary}` : ""}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-muted">{formatDate(entry.created_at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
