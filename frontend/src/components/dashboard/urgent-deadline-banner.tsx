"use client";

import { TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { Dashboard } from "@/lib/types";

const DISMISS_KEY = "speednum-dismissed-deadline-alerts";
/** Section 8/13's explicit default — configurable server-side per tenant
 * later if that setting ever gets modeled; the client only needs to know
 * where to draw the "due_soon counts as urgent enough to bank" line. */
const URGENT_WITHIN_DAYS = 5;

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

/**
 * Top-center, dismissible, deduplicated urgent-deadline banner — distinct
 * from the Overview page's "Needs attention" list (a full triage view) and
 * from the Notifications page (a full history). This is the one thing meant
 * to interrupt a user who isn't looking at either of those.
 *
 * Dedup key is `${deadline.id}:${urgency}`, not just the id — a deadline
 * that was dismissed while "due_soon" re-appears once it becomes "overdue".
 * That's a real state change worth re-surfacing, not a repeat of the same
 * alert (Section 8's "do not send repeated notifications... use persistent
 * notification state").
 */
export function UrgentDeadlineBanner() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  // Lazy initializer, not a set-state-in-effect — localStorage read has no
  // dependency to synchronize with an external system the way the fetch below
  // does, so it belongs in initial state, not an effect body.
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());

  useEffect(() => {
    api<Dashboard>("/dashboard")
      .then(setDashboard)
      .catch(() => {
        // No banner is better than a broken one — the Overview page and
        // Notifications center still surface the same information.
      });
  }, []);

  if (!dashboard) return null;

  const urgent = dashboard.next_deadlines
    .filter((d) => d.urgency === "overdue" || (d.urgency === "due_soon" && d.days_remaining <= URGENT_WITHIN_DAYS))
    .filter((d) => !dismissed.has(`${d.id}:${d.urgency}`))
    .sort((a, b) => a.days_remaining - b.days_remaining);

  const top = urgent[0];
  if (!top) return null;

  const dismiss = () => {
    const next = new Set(dismissed);
    next.add(`${top.id}:${top.urgency}`);
    setDismissed(next);
    saveDismissed(next);
  };

  const overdue = top.urgency === "overdue";

  return (
    <div className="sticky top-0 z-30 flex justify-center px-4 pt-3">
      <div
        role="alert"
        className={cn(
          "flex w-full max-w-2xl items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur",
          overdue ? "border-danger/30 bg-danger-soft/95 text-danger" : "border-warn/30 bg-warn-soft/95 text-warn",
        )}
      >
        <TriangleAlert className="mt-0.5 size-4.5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold">
            {overdue ? "Deadline overdue" : "Deadline approaching"}
          </p>
          <p className="mt-0.5 text-[13px] leading-snug opacity-90">
            <strong>{top.title}</strong>
            {top.client_name ? ` for ${top.client_name}` : ""} is{" "}
            {overdue ? `${Math.abs(top.days_remaining)} day(s) overdue` : `due in ${top.days_remaining} day(s)`}.
          </p>
          <Link href="/deadlines" className="mt-1 inline-block text-[12.5px] font-semibold underline underline-offset-2">
            View deadlines
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
