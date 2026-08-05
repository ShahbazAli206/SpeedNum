import { Banknote, CircleCheck, Repeat, Tag } from "lucide-react";
import type { Metadata } from "next";

import { KpiTile } from "@/components/charts";
import { DashboardHeader, KpiRow } from "@/components/dashboard/page-shell";
import { cn } from "@/lib/cn";
import { getServicesWithUsage } from "@/lib/firm-demo";
import { formatMoney, titleCase } from "@/lib/format";

export const metadata: Metadata = { title: "Services" };

const FREQUENCY_TONE: Record<string, string> = {
  monthly: "bg-info-soft text-info",
  quarterly: "bg-brand-soft text-brand",
  semi_annual: "bg-warn-soft text-warn",
  annual: "bg-surface-2 text-ink-soft",
  one_time: "bg-surface-2 text-muted",
};

export default function ServicesPage() {
  const services = getServicesWithUsage();
  const active = services.filter((service) => service.is_active);
  const annualValue = services.reduce((total, service) => total + service.annual_value, 0);
  const categories = [...new Set(services.map((service) => service.category))];

  // Group by category so the catalogue reads the way a firm thinks about it.
  const grouped = categories.map((category) => ({
    category,
    services: services.filter((service) => service.category === category),
  }));

  return (
    <>
      <DashboardHeader
        title="Services catalogue"
        subtitle="Typed services with code, cadence and price — the definition that drives deadlines, projects and letters"
      />

      <KpiRow>
        <KpiTile
          tone="blue"
          value={String(services.length)}
          label="Services defined"
          hint={`${active.length} active`}
          icon={<Tag className="size-5" />}
        />
        <KpiTile
          tone="green"
          value={formatMoney(annualValue)}
          label="Annualised value"
          hint="Across all client assignments"
          icon={<Banknote className="size-5" />}
        />
        <KpiTile
          tone="amber"
          value={String(categories.length)}
          label="Categories"
          icon={<Repeat className="size-5" />}
        />
        <KpiTile
          tone="rose"
          value={String(services.reduce((total, service) => total + service.client_count, 0))}
          label="Client assignments"
          icon={<CircleCheck className="size-5" />}
        />
      </KpiRow>

      <div className="mt-6 space-y-5">
        {grouped.map((group) => (
          <section
            key={group.category}
            className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]"
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <h2 className="text-[14.5px] font-bold text-ink">{group.category}</h2>
              <span className="text-[12.5px] text-muted">
                {group.services.length} service{group.services.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="scroll-thin overflow-x-auto">
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="border-b border-line text-[11.5px] tracking-wide text-muted uppercase">
                    <th className="px-5 py-2.5 text-left font-semibold">Code</th>
                    <th className="px-5 py-2.5 text-left font-semibold">Service</th>
                    <th className="px-5 py-2.5 text-left font-semibold">Cadence</th>
                    <th className="px-5 py-2.5 text-left font-semibold">Due rule</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Lead time</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Price</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Clients</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Annual value</th>
                  </tr>
                </thead>
                <tbody>
                  {group.services.map((service) => (
                    <tr
                      key={service.id}
                      className={cn(
                        "border-b border-line last:border-b-0",
                        !service.is_active && "opacity-55",
                      )}
                    >
                      <td className="px-5 py-3">
                        <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-ink-soft">
                          {service.code}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-medium text-ink">
                        {service.name}
                        {!service.is_active ? (
                          <span className="ml-2 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                            Inactive
                          </span>
                        ) : null}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            FREQUENCY_TONE[service.frequency],
                          )}
                        >
                          {titleCase(service.frequency)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-muted">{service.due_rule}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-muted">
                        {service.lead_time_days}d
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-ink">
                        {formatMoney(service.default_price)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-ink-soft">
                        {service.client_count}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums text-ink">
                        {service.annual_value > 0 ? formatMoney(service.annual_value) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>

      <p className="mt-6 rounded-xl border border-line bg-surface-2/50 p-5 text-[13px] leading-relaxed text-muted">
        Annual value multiplies each service&apos;s price by its cadence and the number of
        clients assigned to it — so it moves when an assignment changes, rather than being
        maintained by hand. Per-client price overrides live on the client record.
      </p>
    </>
  );
}
