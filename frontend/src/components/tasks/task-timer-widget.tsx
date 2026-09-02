"use client";

import { Square, Timer } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useConfirm } from "@/components/confirm";
import { useToast } from "@/components/toast";
import { formatClock } from "@/lib/format";
import { liveSeconds } from "@/lib/timer";

import { useTimer } from "./timer-provider";

/** Pull a human-readable reason out of an ApiError without leaking `[object]`. */
function reason(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * The small digital timer on the firm sidebar — only rendered while the
 * signed-in staff member actually has a timer running. Sits above
 * DesktopAppButton in shell.tsx.
 */
export function TaskTimerWidget({ collapsed = false }: { collapsed?: boolean }) {
  const { activeTimer, stop } = useTimer();
  const confirm = useConfirm();
  const toast = useToast();
  const [now, setNow] = useState(() => Date.now());
  const [stopping, setStopping] = useState(false);

  const running = activeTimer?.status === "running";

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [running]);

  if (!activeTimer || !running) return null;

  const seconds = liveSeconds(activeTimer, now);
  const clock = formatClock(seconds);
  const label = activeTimer.client_name
    ? `${activeTimer.task_title} — ${activeTimer.client_name}`
    : activeTimer.task_title;

  const handleStop = async () => {
    const ok = await confirm({
      title: "Stop the timer?",
      description: `Stop tracking time on "${activeTimer.task_title}"? This banks ${clock} — you can resume from here later.`,
      confirmLabel: "Stop timer",
      cancelLabel: "Keep running",
    });
    if (!ok) return;
    setStopping(true);
    try {
      await stop();
      toast.success("Timer stopped", `${clock} logged on "${activeTimer.task_title}".`);
    } catch (error) {
      toast.error("Could not stop the timer", reason(error, "Please try again."));
    } finally {
      setStopping(false);
    }
  };

  if (collapsed) {
    return (
      <Link
        href={`/workflows/${activeTimer.task_id}`}
        title={`${label} — ${clock}`}
        className="relative grid size-10 place-items-center rounded-lg border border-brand/30 bg-brand-soft text-brand transition hover:bg-brand-soft/80"
      >
        <Timer className="size-4.5" />
        <span className="absolute top-1 right-1 size-1.5 animate-pulse rounded-full bg-brand" />
      </Link>
    );
  }

  return (
    <div className="rounded-lg border border-brand/30 bg-brand-soft/60 p-2.5">
      <div className="flex items-center gap-2">
        <span className="relative grid size-7 shrink-0 place-items-center rounded-md bg-brand text-white">
          <Timer className="size-3.5" />
          <span className="absolute -top-0.5 -right-0.5 size-2 animate-pulse rounded-full bg-success ring-2 ring-surface" />
        </span>
        <div className="min-w-0 flex-1">
          <Link
            href={`/workflows/${activeTimer.task_id}`}
            className="block truncate text-[12px] font-semibold text-ink hover:underline"
            title={label}
          >
            {activeTimer.task_title}
          </Link>
          {activeTimer.client_name ? (
            <p className="truncate text-[11px] text-muted">{activeTimer.client_name}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="font-mono text-[17px] font-bold tabular-nums text-brand">{clock}</span>
        <button
          type="button"
          onClick={() => void handleStop()}
          disabled={stopping}
          aria-label="Stop timer"
          title="Stop timer"
          className="grid size-7 shrink-0 place-items-center rounded-md border border-line bg-surface text-muted transition hover:border-danger/40 hover:bg-danger-soft hover:text-danger disabled:opacity-50"
        >
          <Square className="size-3" fill="currentColor" />
        </button>
      </div>
    </div>
  );
}
