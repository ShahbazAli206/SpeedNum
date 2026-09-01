"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { AUTH_CONFIGURED } from "@/lib/auth";
import { getActiveTimer, startTaskTimer, stopTaskTimer, stopTaskTimerOnUnload } from "@/lib/timer";
import type { TaskTimer } from "@/lib/types";

const REFRESH_MS = 60_000;

interface TimerContextValue {
  /** The signed-in staff member's one running timer, if any — across every
   * task. Null while loading or when nothing is running. */
  activeTimer: TaskTimer | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  /** Starts (or resumes) a timer on `taskId`. Throws — a 409 means another
   * timer is already running elsewhere; the caller decides how to handle
   * that (task-detail-client.tsx prompts to stop the old one first). */
  start: (taskId: string) => Promise<TaskTimer>;
  /** Stops whichever timer is currently active. A no-op if none is. */
  stop: () => Promise<void>;
  /** Best-effort stop that never throws — for the sign-out flow, where a
   * failed stop-call must never block logging out. */
  stopIfRunning: () => Promise<void>;
}

const TimerContext = createContext<TimerContextValue | null>(null);

const NOOP_TIMER: TimerContextValue = {
  activeTimer: null,
  isLoading: false,
  refresh: async () => {},
  start: async () => {
    throw new Error("Timers are only available inside the firm portal.");
  },
  stop: async () => {},
  stopIfRunning: async () => {},
};

/**
 * Mounted once at the root of the firm shell (client-portal logins never see
 * this — task timers are a staff-only concept). Holds the signed-in staff
 * member's single active timer so the sidebar widget and the Task Master
 * detail page both read and drive the same state without an event bus.
 *
 * Registers `pagehide`/`beforeunload` so closing the tab or the whole
 * browser banks whatever's elapsed instead of leaving the clock running
 * forever server-side — see lib/timer.ts's stopTaskTimerOnUnload for why
 * that's a raw keepalive fetch rather than the normal API helper.
 */
export function TimerProvider({ children }: { children: ReactNode }) {
  const [activeTimer, setActiveTimer] = useState<TaskTimer | null>(null);
  const [isLoading, setIsLoading] = useState(AUTH_CONFIGURED);
  const activeTimerRef = useRef<TaskTimer | null>(null);
  activeTimerRef.current = activeTimer;

  const refresh = useCallback(async () => {
    if (!AUTH_CONFIGURED) return;
    try {
      const timer = await getActiveTimer();
      setActiveTimer(timer);
    } catch {
      // Transient network hiccup — keep whatever we last knew rather than
      // flashing the widget away.
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  // Tab close / browser close: bank the elapsed time. Not ordinary in-app
  // navigation (the sidebar widget persists across pages on purpose) — only
  // the page actually going away.
  useEffect(() => {
    const onUnload = () => {
      const timer = activeTimerRef.current;
      if (timer && timer.status === "running") stopTaskTimerOnUnload(timer.task_id);
    };
    window.addEventListener("pagehide", onUnload);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("pagehide", onUnload);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, []);

  const start = useCallback(async (taskId: string) => {
    const timer = await startTaskTimer(taskId);
    setActiveTimer(timer);
    return timer;
  }, []);

  const stop = useCallback(async () => {
    const current = activeTimerRef.current;
    if (!current) return;
    const timer = await stopTaskTimer(current.task_id);
    setActiveTimer(timer.status === "running" ? timer : null);
  }, []);

  const stopIfRunning = useCallback(async () => {
    const current = activeTimerRef.current;
    if (!current || current.status !== "running") return;
    try {
      await stopTaskTimer(current.task_id);
      setActiveTimer(null);
    } catch {
      // Best-effort — logging out must proceed regardless.
    }
  }, []);

  return (
    <TimerContext.Provider value={{ activeTimer, isLoading, refresh, start, stop, stopIfRunning }}>
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer(): TimerContextValue {
  return useContext(TimerContext) ?? NOOP_TIMER;
}
