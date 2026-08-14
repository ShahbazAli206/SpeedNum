import type { Metadata } from "next";

import { apiServer } from "@/lib/api-server";
import { getReminderCounts, getReminders } from "@/lib/firm-demo";
import type { ReminderBoard } from "@/lib/types";

import { RemindersClient } from "./reminders-client";

export const metadata: Metadata = { title: "Reminders" };

/**
 * The countdown board. Distinct from /deadlines, which lists the obligations
 * themselves: a reminder is the alert raised when one crosses a lead time — 10
 * days left, due today, 3 days overdue — and is acknowledged, snoozed or
 * resolved independently of whether the filing is done.
 *
 * Live when the API answers; the demo generator in lib/firm-demo derives the
 * same rungs from the sample deadlines otherwise, so the page is never blank.
 */
export default async function RemindersPage() {
  const live = await apiServer<ReminderBoard>("/reminders");

  const board: ReminderBoard = live ?? {
    generated_at: new Date().toISOString(),
    counts: getReminderCounts(),
    reminders: getReminders(),
  };

  return <RemindersClient board={board} isLive={Boolean(live)} />;
}
