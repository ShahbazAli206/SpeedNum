"use client";

import { CalendarClock, Send } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { useToast } from "@/components/toast";
import { remindTenant } from "@/lib/admin";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { useAction, useApi } from "@/lib/hooks";
import type { ExpiryAlert, ExpiryTarget } from "@/lib/types";

/**
 * Superadmin-only "expiries" bell in the firm shell header, alongside the
 * notifications AlertBell. It pulses red (the same animate-ring / animate-blink
 * language as the notification bell) whenever any customer firm's plan or
 * server/domain access is due within a week or already past, and opens a panel
 * listing every upcoming/overdue firm with a one-click reminder and a link to
 * extend. Data is GET /admin/expiry-alerts; mounted only for superadmins, so a
 * non-superadmin never triggers its 403.
 */

const POLL_MS = 5 * 60 * 1000; // expiry moves by the day — a light 5-min poll is plenty
const URGENT_WITHIN_DAYS = 7; // blink threshold; anything overdue is urgent too

const TARGET_LABEL: Record<ExpiryTarget, string> = {
  plan: "Plan",
  service: "Server/domain",
};

function countdownLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days}d`;
}

function severityTone(severity: ExpiryAlert["severity"]): string {
  if (severity === "critical") return "text-danger";
  if (severity === "warning") return "text-warn";
  return "text-muted";
}

export function ExpiryAlertBell() {
  const { data, refresh } = useApi<ExpiryAlert[]>("/admin/expiry-alerts");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const alerts = useMemo(() => data ?? [], [data]);
  const total = alerts.length;
  const urgent = useMemo(
    () => alerts.some((a) => a.days_remaining <= URGENT_WITHIN_DAYS),
    [alerts],
  );

  useEffect(() => {
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={total ? `Expiries, ${total} upcoming` : "Expiries, none upcoming"}
        className="relative grid size-9 place-items-center rounded-lg border border-line text-ink-soft transition hover:bg-surface-2"
      >
        {urgent ? (
          <span aria-hidden className="animate-ring absolute inset-0 rounded-lg bg-danger/25" />
        ) : null}
        <CalendarClock className={cn("relative size-4", urgent && "animate-blink text-danger")} />
        {total > 0 ? (
          <span
            className={cn(
              "absolute -top-1 -right-1 grid size-4.5 place-items-center rounded-full px-1 text-[9.5px] font-bold text-white",
              urgent ? "animate-blink bg-danger" : "bg-warn",
            )}
          >
            {total > 99 ? "99+" : total}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="animate-in absolute right-0 mt-2 w-80 overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-float)]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-[14px] font-semibold text-ink">Upcoming expiries</p>
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
              {total} to review
            </span>
          </div>

          {total === 0 ? (
            <p className="px-4 py-6 text-center text-[12.5px] text-muted">
              No plans or servers expiring in the next 30 days.
            </p>
          ) : (
            <ul className="scroll-thin max-h-96 overflow-y-auto">
              {alerts.map((alert) => (
                <li
                  key={`${alert.tenant_id}:${alert.target}`}
                  className="border-b border-line px-4 py-3 last:border-b-0"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/admin/tenants/${alert.tenant_id}`}
                      onClick={() => setOpen(false)}
                      className="min-w-0 flex-1"
                    >
                      <span className="block truncate text-[13px] font-medium text-ink">
                        {alert.tenant_name}
                      </span>
                      <span className="block text-[12px] text-muted">
                        {TARGET_LABEL[alert.target]} expires {formatDate(alert.expires_at)}
                      </span>
                    </Link>
                    <span
                      className={cn(
                        "shrink-0 text-[11.5px] font-semibold",
                        severityTone(alert.severity),
                      )}
                    >
                      {countdownLabel(alert.days_remaining)}
                    </span>
                  </div>
                  <RemindButton
                    tenantId={alert.tenant_id}
                    target={alert.target}
                    name={alert.tenant_name}
                  />
                </li>
              ))}
            </ul>
          )}

          <Link
            href="/admin/plan-requests"
            onClick={() => setOpen(false)}
            className="block border-t border-line bg-surface-2/50 px-4 py-2.5 text-center text-[12.5px] font-semibold text-brand transition hover:bg-surface-2"
          >
            Manage renewals
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function RemindButton({
  tenantId,
  target,
  name,
}: {
  tenantId: string;
  target: ExpiryTarget;
  name: string;
}) {
  const { run, pending } = useAction();
  const toast = useToast();
  const [sent, setSent] = useState(false);

  return (
    <button
      type="button"
      disabled={pending || sent}
      onClick={async () => {
        const ok = await run(() => remindTenant(tenantId, target));
        if (ok) {
          setSent(true);
          toast.success(`Reminder sent to ${name}`);
        }
      }}
      className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[11.5px] font-semibold text-ink-soft transition hover:bg-surface-2 disabled:opacity-50"
    >
      <Send className="size-3" />
      {sent ? "Reminder sent" : pending ? "Sending…" : "Send reminder"}
    </button>
  );
}
