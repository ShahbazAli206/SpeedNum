import { Banknote, CalendarClock, Landmark, Users } from "lucide-react";
import type { Metadata } from "next";

import { KpiTile } from "@/components/charts";
import { PayRunStatusBadge } from "@/components/dashboard/badges";
import { DashboardHeader, KpiRow } from "@/components/dashboard/page-shell";
import { Progress } from "@/components/ui";
import { getEmployees, getPayRuns, getPayrollTotals } from "@/lib/demo";
import { formatDate, formatMoney } from "@/lib/format";
import { fetchLiveEmployees, fetchLivePayRuns, fetchLivePayrollTotals } from "@/lib/portal-live";

export const metadata: Metadata = { title: "Payroll" };

export default async function PayrollPage() {
  const [employees, runs, totals] = await Promise.all([
    fetchLiveEmployees().then((live) => live ?? getEmployees()),
    fetchLivePayRuns().then((live) => live ?? getPayRuns()),
    fetchLivePayrollTotals().then((live) => live ?? getPayrollTotals()),
  ]);

  return (
    <>
      <DashboardHeader title="Payroll" subtitle="Your pay runs" />

      <KpiRow>
        <KpiTile
          tone="blue"
          value={String(totals.active)}
          label="Active employees"
          icon={<Users className="size-5" />}
        />
        <KpiTile
          tone="green"
          value={formatMoney(totals.monthlyGross)}
          label="Monthly payroll"
          hint="Gross, before deductions"
          icon={<Banknote className="size-5" />}
        />
        <KpiTile
          tone="amber"
          value={totals.nextRun ? formatDate(totals.nextRun.payDate) : "—"}
          label="Next run"
          hint={totals.nextRun?.period}
          icon={<CalendarClock className="size-5" />}
        />
        <KpiTile
          tone="rose"
          value={formatMoney(totals.remittance)}
          label="Source deductions"
          hint="Employer + employee, remittable"
          icon={<Landmark className="size-5" />}
        />
      </KpiRow>

      <section className="mt-6 rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">Employees</h2>
          <p className="mt-0.5 text-[13px] text-muted">Your team and pay details</p>
        </div>
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-line text-[11.5px] tracking-wide text-muted uppercase">
                <th className="px-5 py-2.5 text-left font-semibold">Employee</th>
                <th className="px-5 py-2.5 text-left font-semibold">Type</th>
                <th className="px-5 py-2.5 text-right font-semibold">Gross</th>
                <th className="px-5 py-2.5 text-right font-semibold">CPP</th>
                <th className="px-5 py-2.5 text-right font-semibold">EI</th>
                <th className="px-5 py-2.5 text-right font-semibold">Tax</th>
                <th className="px-5 py-2.5 text-right font-semibold">Net</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id} className="border-b border-line last:border-b-0">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-[11px] font-bold text-brand">
                        {employee.name
                          .split(" ")
                          .map((part) => part[0])
                          .join("")}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">
                          {employee.name}
                        </span>
                        <span className="block truncate text-[12px] text-muted">
                          {employee.role}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted">
                    {employee.type} · {employee.province}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-ink">
                    {formatMoney(employee.gross)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-muted">
                    {employee.cpp ? formatMoney(employee.cpp) : "—"}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-muted">
                    {employee.ei ? formatMoney(employee.ei) : "—"}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-muted">
                    {employee.tax ? formatMoney(employee.tax) : "—"}
                  </td>
                  <td className="px-5 py-3 text-right font-semibold tabular-nums text-ink">
                    {formatMoney(employee.net)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-surface-2/50 font-semibold">
                <td className="px-5 py-3 text-ink" colSpan={2}>
                  Total
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-ink">
                  {formatMoney(totals.monthlyGross)}
                </td>
                <td className="px-5 py-3" colSpan={3} />
                <td className="px-5 py-3 text-right tabular-nums text-ink">
                  {formatMoney(totals.monthlyNet)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">Pay run history</h2>
          <p className="mt-0.5 text-[13px] text-muted">Semi-monthly, paid five days after period end</p>
        </div>
        <ul className="divide-y divide-line">
          {runs.map((run) => {
            const deductionShare = (run.deductions / run.gross) * 100;
            return (
              <li key={run.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <p className="text-[14px] font-semibold text-ink">{run.period}</p>
                      <PayRunStatusBadge status={run.status} />
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      Paid {formatDate(run.payDate)} · {run.employees} employees
                    </p>
                  </div>
                  <div className="flex items-center gap-6 text-right">
                    <div>
                      <p className="text-[11.5px] text-muted">Gross</p>
                      <p className="text-[14px] font-semibold tabular-nums text-ink">
                        {formatMoney(run.gross)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11.5px] text-muted">Net</p>
                      <p className="text-[14px] font-semibold tabular-nums text-ink">
                        {formatMoney(run.net)}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <Progress
                    value={100 - deductionShare}
                    tone="brand"
                    className="flex-1"
                    label={`${run.period}: net share of gross`}
                  />
                  <span className="shrink-0 text-[11.5px] text-muted">
                    {formatMoney(run.deductions)} deductions ({deductionShare.toFixed(0)}%)
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
