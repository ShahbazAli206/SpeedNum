import type { ReactNode } from "react";

/** Title / subtitle / actions row shared by every portal page. */
export function DashboardHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-[1.6rem] font-bold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 text-[14px] text-muted">{subtitle}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** The four saturated KPI tiles the existing portal leads each page with. */
export function KpiRow({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}
