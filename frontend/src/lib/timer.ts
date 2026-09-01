"use client";

/**
 * Task timers (backend/app/routers/task_timers.py) — one assignee's own
 * running clock on one task at a time.
 */

import { API_URL, get, post } from "./api";
import { currentAccessToken } from "./auth-client";
import type { TaskTimer } from "./types";

export const getActiveTimer = () => get<TaskTimer | null>("/tasks/timers/active");
export const getTaskTimer = (taskId: string) => get<TaskTimer>(`/tasks/${taskId}/timer`);
export const startTaskTimer = (taskId: string) => post<TaskTimer>(`/tasks/${taskId}/timer/start`);
export const stopTaskTimer = (taskId: string) => post<TaskTimer>(`/tasks/${taskId}/timer/stop`);

/**
 * Live seconds for a timer snapshot — accumulated_seconds plus the running
 * segment, if any. `nowMs` is injectable so a ticking caller can pass a
 * shared clock instead of each timer computing its own `Date.now()`.
 */
export function liveSeconds(timer: Pick<TaskTimer, "status" | "accumulated_seconds" | "started_at">, nowMs = Date.now()) {
  if (timer.status !== "running" || !timer.started_at) return timer.accumulated_seconds;
  const startedMs = new Date(timer.started_at).getTime();
  if (Number.isNaN(startedMs)) return timer.accumulated_seconds;
  return timer.accumulated_seconds + Math.max(0, Math.floor((nowMs - startedMs) / 1000));
}

/**
 * Best-effort stop fired from a `pagehide`/`beforeunload` handler — the tab
 * is on its way out, so this can't be awaited or retried like a normal call.
 * `keepalive` asks the browser to finish the request even after the page is
 * gone (subject to a small body-size cap, comfortably met here — there is no
 * body). Not `navigator.sendBeacon`: sendBeacon cannot carry a custom
 * Authorization header, and this API is bearer-token authenticated, not
 * cookie-authenticated.
 */
export function stopTaskTimerOnUnload(taskId: string): void {
  const token = currentAccessToken();
  if (!token) return;
  try {
    fetch(`${API_URL}/tasks/${taskId}/timer/stop`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      keepalive: true,
    });
  } catch {
    // Nothing more to do — the tab is closing regardless.
  }
}
