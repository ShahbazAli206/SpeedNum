"use client";

import { CalendarClock, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { cn } from "@/lib/cn";
import { formatDate, parseDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { ExpiryTarget } from "@/lib/types";

const DISMISS_KEY = "speednum-dismissed-expiry-alerts";
/** How close a date has to be before we interrupt with the banner. Past this the
 * bell/notifications still show it; this is just the "act now" nudge. */
const WARN_WITHIN_DAYS = 14;

const TARGET_LABEL: Record<ExpiryTarget, string> = {
  plan: "plan",
  service: "server/domain access",
};

function loadDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(window.localStorage.getItem(DISMISS_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

function saveDismissed(keys: Set<string>) {
  window.localStorage.setItem(DISMISS_KEY, JSON.stringify([...keys]));
}

function daysUntil(value: string | null | undefined): number | null {
  const date = parseDate(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86_400_000);
}

/**
 * The company portal's plan / server-domain expiry warning — the tenant-level
 * sibling of UrgentDeadlineBanner. Reads the two expiry dates straight off
 * /auth/me (session.me.tenant), so it needs no extra fetch, and links through to
 * /billing where an owner/admin can request a renewal. Past expiry the firm is
 * locked out entirely (deps.get_current_user), so in practice this fires in the
 * warning window before that happens.
 *
 * Dedup key is `${target}:${bucket}` so dismissing the "expiring soon" notice
 * doesn't hide the harder "expired" one if it ever renders.
 */
export function PlanExpiryBanner() {
  const session = useSession();
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());

  const tenant = session.me?.tenant;
  if (!tenant) return null;

  const bucketOf = (days: number) => (days < 0 ? "expired" : "soon");
  const candidates = (["plan", "service"] as ExpiryTarget[])
    .map((target) => {
      const value = target === "plan" ? tenant.plan_expires_at : tenant.service_expires_at;
      const days = daysUntil(value);
      return value && days !== null ? { target, days, date: value } : null;
    })
    .filter((c): c is { target: ExpiryTarget; days: number; date: string } => c !== null)
    .filter((c) => c.days <= WARN_WITHIN_DAYS)
    .filter((c) => !dismissed.has(`${c.target}:${bucketOf(c.days)}`))
    .sort((a, b) => a.days - b.days);

  const top = candidates[0];
  if (!top) return null;

  const expired = top.days < 0;
  const label = TARGET_LABEL[top.target];

  const dismiss = () => {
    const next = new Set(dismissed);
    next.add(`${top.target}:${bucketOf(top.days)}`);
    setDismissed(next);
    saveDismissed(next);
  };

  const countdown = expired
    ? `expired on ${formatDate(top.date)}`
    : top.days === 0
      ? `expires today (${formatDate(top.date)})`
      : `expires in ${top.days} day${top.days === 1 ? "" : "s"} (${formatDate(top.date)})`;

  return (
    <div className="sticky top-0 z-30 flex justify-center px-4 pt-3">
      <div
        role="alert"
        className={cn(
          "flex w-full max-w-2xl items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur",
          expired
            ? "border-danger/30 bg-danger-soft/95 text-danger"
            : "border-warn/30 bg-warn-soft/95 text-warn",
        )}
      >
        <CalendarClock className="mt-0.5 size-4.5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold">
            {expired ? `Your ${label} has expired` : `Your ${label} is expiring soon`}
          </p>
          <p className="mt-0.5 text-[13px] leading-snug opacity-90">
            Your {label} {countdown}. Request a renewal to avoid any interruption to your services.
          </p>
          <Link
            href="/billing"
            className="mt-1 inline-block text-[12.5px] font-semibold underline underline-offset-2"
          >
            Review plan &amp; request renewal
          </Link>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-md p-1 opacity-70 transition hover:bg-black/5 hover:opacity-100"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
