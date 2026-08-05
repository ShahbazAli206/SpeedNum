"use client";

import { Bell, CircleCheck, Clock, Mail, Plus, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { Sparkline } from "@/components/charts";
import { cn } from "@/components/ui";

/**
 * The product mockup beside the hero headline.
 *
 * Decorative: it is `aria-hidden` and the numbers are illustrative, so it is
 * deliberately not wired to the chart components' interaction layer. Screen
 * readers get the hero copy instead, which says the same thing in words.
 */

const DEADLINES = [
  { client: "Maple Leaf Consulting Inc.", service: "GST/HST — Q4 return", state: "Overdue 2 days", tone: "danger" as const },
  { client: "Birchwood Interiors Ltd.", service: "Year-end financial statements", state: "Due in 4 days", tone: "warn" as const },
  { client: "Northern Light Logistics", service: "Payroll remittance", state: "Due in 6 days", tone: "warn" as const },
  { client: "Sato & Daughters LLP", service: "T2 corporate filing", state: "On track · 19 days", tone: "success" as const },
  { client: "Prairie Roofing Inc.", service: "Engagement letter", state: "Completed today", tone: "success" as const },
];

const TONE_DOT = {
  danger: "bg-danger",
  warn: "bg-warn",
  success: "bg-success",
};

const TONE_PILL = {
  danger: "bg-danger-soft text-danger",
  warn: "bg-warn-soft text-warn",
  success: "bg-success-soft text-success",
};

const REVENUE = [17200, 18400, 19100, 18700, 21300, 22800, 24100, 23600, 25900, 26400, 27650];

export function HeroMockup() {
  const [toast, setToast] = useState(false);

  // The "Engagement signed" toast slides in shortly after the hero settles,
  // then stays — it is a still life, not a loop that keeps pulling the eye.
  useEffect(() => {
    const timer = setTimeout(() => setToast(true), 900);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative select-none" aria-hidden>
      {/* Back plane: the firm dashboard */}
      <div className="ml-auto w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-float)]">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-danger/70" />
            <span className="size-2 rounded-full bg-warn/70" />
            <span className="size-2 rounded-full bg-success/70" />
          </div>
          <div className="flex items-center gap-2">
            <span className="relative grid size-6 place-items-center rounded-md text-muted">
              <Bell className="size-3.5" />
              <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-danger" />
            </span>
            <span className="grid size-6 place-items-center rounded-md text-muted">
              <Mail className="size-3.5" />
            </span>
            <span className="grid size-6 place-items-center rounded-md bg-brand text-white">
              <Plus className="size-3.5" />
            </span>
          </div>
        </div>

        <div className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3">
            <MiniStat icon={<Users className="size-3.5" />} value="142" label="Tasks due this week" />
            <MiniStat icon={<Clock className="size-3.5" />} value="17" label="Deadlines open" tone="warn" />
          </div>

          <div className="rounded-xl border border-line p-3.5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] text-muted">Recurring revenue</p>
                <p className="font-display text-lg font-bold text-ink">$27,650</p>
                <p className="text-[11px] font-medium text-success">↑ 11.4% vs last month</p>
              </div>
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-muted">
                This year
              </span>
            </div>
            <Sparkline values={REVENUE} width={260} height={54} className="mt-2 w-full" />
          </div>

          <div className="rounded-xl border border-line p-3.5">
            <p className="mb-2 text-[11px] font-semibold text-muted">Upcoming birthdays</p>
            <ul className="space-y-1.5">
              {["Sarah Johnson", "Michael Chen", "Emily Carter"].map((name, index) => (
                <li key={name} className="flex items-center gap-2">
                  <span className="grid size-5 place-items-center rounded-full bg-brand-soft text-[9px] font-bold text-brand">
                    {name.split(" ").map((part) => part[0]).join("")}
                  </span>
                  <span className="flex-1 text-[11px] text-ink-soft">{name}</span>
                  <span className="text-[10px] text-muted">May {22 + index * 2}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Front plane: the deadline feed, offset left and floating */}
      <div className="animate-float absolute -bottom-8 -left-2 w-[19rem] overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-float)] sm:-left-8">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="text-[12.5px] font-semibold text-ink">Deadlines · this week</p>
          <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-semibold text-success">
            <span className="size-1.5 rounded-full bg-success" />
            Live
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 px-3 py-3">
          <Triage value="1" label="Overdue" className="text-danger" />
          <Triage value="2" label="Due soon" className="text-warn" />
          <Triage value="12" label="On track" className="text-success" />
        </div>

        <ul className="space-y-1.5 px-3 pb-3">
          {DEADLINES.map((item) => (
            <li
              key={item.client}
              className="flex items-center gap-2.5 rounded-xl border border-line px-2.5 py-2"
            >
              <span className={cn("size-2 shrink-0 rounded-full", TONE_DOT[item.tone])} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11.5px] font-semibold text-ink">
                  {item.client}
                </span>
                <span className="block truncate text-[10.5px] text-muted">{item.service}</span>
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-semibold whitespace-nowrap",
                  TONE_PILL[item.tone],
                )}
              >
                {item.state}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Notification toast */}
      <div
        className={cn(
          "absolute -top-4 right-0 flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-2.5 shadow-[var(--shadow-float)] transition-all duration-500 sm:-right-6",
          toast ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
        )}
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-success-soft text-success">
          <CircleCheck className="size-4" />
        </span>
        <span>
          <span className="block text-[12px] font-semibold text-ink">Engagement signed</span>
          <span className="block text-[10.5px] text-muted">2 min ago</span>
        </span>
      </div>
    </div>
  );
}

function MiniStat({
  icon,
  value,
  label,
  tone = "brand",
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  tone?: "brand" | "warn";
}) {
  return (
    <div className="rounded-xl border border-line p-3">
      <span
        className={cn(
          "grid size-6 place-items-center rounded-md",
          tone === "warn" ? "bg-warn-soft text-warn" : "bg-brand-soft text-brand",
        )}
      >
        {icon}
      </span>
      <p className="mt-1.5 font-display text-lg font-bold text-ink">{value}</p>
      <p className="text-[10.5px] text-muted">{label}</p>
    </div>
  );
}

function Triage({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  return (
    <div className="rounded-xl border border-line px-2 py-2 text-center">
      <p className={cn("font-display text-lg font-bold", className)}>{value}</p>
      <p className="text-[10px] text-muted">{label}</p>
    </div>
  );
}
