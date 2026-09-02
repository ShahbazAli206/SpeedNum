"use client";

import { useCallback, useState } from "react";

import { useConfirm } from "@/components/confirm";
import { useToast } from "@/components/toast";
import { patch } from "@/lib/api";
import type { TaskStatus } from "@/lib/types";

import { useTimer } from "./timer-provider";

/** Pull a human-readable reason out of an ApiError without leaking `[object]`. */
function reason(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** The minimum a caller must know about a task to start work on it. */
export interface StartWorkTask {
  id: string;
  title: string;
  status: TaskStatus;
  client_id?: string | null;
  client_name?: string | null;
}

interface StartWorkOptions {
  /** Word the prompt/toast as "Resume" instead of "Start" — the caller knows
   *  whether this assignee has banked time on the task before. */
  resuming?: boolean;
  /** Called after a successful start. `progressed` is true when the task was
   *  moved To do -> In Progress as part of starting, so the caller can update
   *  its own status state without a refetch. */
  onChange?: (result: { progressed: boolean }) => void | Promise<void>;
}

/**
 * "Start work" is one action from the assignee's point of view: it starts
 * their timer AND moves a fresh (To do) task into In Progress, so the board
 * reflects that someone is actually on it. Shared by the task-detail
 * Time-tracking card and the Task Master board/table so the confirm copy, the
 * switch-timer handling and the status flip stay identical everywhere.
 *
 * Only the assignee ever calls this — the backend enforces that a non-Owner
 * may change a task's status only on tasks assigned to them
 * (permissions.can_update_task_fields), and starting a timer is already
 * assignee-only (routers/task_timers.py). The status flip is best-effort: if
 * it fails, the timer has still started, so it must not read as "work didn't
 * start" — the caller can nudge the status from the dropdown.
 */
export function useStartWork() {
  const { activeTimer, start, stop } = useTimer();
  const confirm = useConfirm();
  const toast = useToast();
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  const runningTaskId = activeTimer?.status === "running" ? activeTimer.task_id : null;

  const startWork = useCallback(
    async (task: StartWorkTask, opts?: StartWorkOptions) => {
      // A person can only run one timer at a time. If one's already going on a
      // different task, offer to switch rather than surfacing the backend 409.
      if (runningTaskId && runningTaskId !== task.id && activeTimer) {
        const switchOk = await confirm({
          title: "Stop your other timer?",
          description: `You already have a timer running on "${activeTimer.task_title}". Stop it and start this one instead?`,
          confirmLabel: "Switch timer",
        });
        if (!switchOk) return;
        setBusyTaskId(task.id);
        try {
          await stop();
        } catch (error) {
          toast.error("Could not stop the other timer", reason(error, "Please try again."));
          setBusyTaskId(null);
          return;
        }
      }

      const resuming = opts?.resuming ?? false;
      const forClient = task.client_id && task.client_name ? ` for ${task.client_name}` : "";
      const willProgress = task.status === "todo";
      const ok = await confirm({
        title: resuming ? "Resume this task?" : "Start work on this task?",
        description: `Are you sure you're ${resuming ? "resuming" : "starting"} work on "${task.title}"${forClient}? This starts your timer${
          willProgress ? " and moves the task to In Progress" : ""
        }.`,
        confirmLabel: resuming ? "Resume" : "Start work",
        cancelLabel: "Not now",
      });
      if (!ok) {
        setBusyTaskId(null);
        return;
      }

      setBusyTaskId(task.id);
      try {
        await start(task.id);
      } catch (error) {
        toast.error("Could not start work", reason(error, "Please try again."));
        setBusyTaskId(null);
        return;
      }

      let progressed = false;
      if (willProgress) {
        try {
          await patch(`/tasks/${task.id}`, { status: "in_progress" });
          progressed = true;
        } catch {
          // Best-effort — the timer is already running; leave the status for
          // the assignee to set from the dropdown rather than failing loudly.
        }
      }

      try {
        await opts?.onChange?.({ progressed });
      } finally {
        toast.success(resuming ? "Timer resumed" : "Work started", task.title);
        setBusyTaskId(null);
      }
    },
    [activeTimer, runningTaskId, confirm, start, stop, toast],
  );

  const stopWork = useCallback(
    async (task: { id: string; title: string }, opts?: { onChange?: () => void | Promise<void> }) => {
      const ok = await confirm({
        title: "Stop the timer?",
        description: `Stop tracking time on "${task.title}"? You can resume later from right where you left off.`,
        confirmLabel: "Stop timer",
        cancelLabel: "Keep running",
      });
      if (!ok) return;
      setBusyTaskId(task.id);
      try {
        await stop();
        await opts?.onChange?.();
        toast.success("Timer stopped", task.title);
      } catch (error) {
        toast.error("Could not stop the timer", reason(error, "Please try again."));
      } finally {
        setBusyTaskId(null);
      }
    },
    [confirm, stop, toast],
  );

  return { startWork, stopWork, busyTaskId, runningTaskId };
}
