import type { Metadata } from "next";

import { apiServer } from "@/lib/api-server";
import type { AttendanceDay, TaskHourEntry } from "@/lib/types";

import { TimesheetClient } from "./timesheet-client";

export const metadata: Metadata = { title: "Timesheet" };

export default async function TimesheetPage() {
  // Everyone — Owner included — has their own attendance/task-hour rows, so
  // the "me" endpoints are always fetched for the initial paint. An Owner's
  // client component additionally fetches the tenant-wide lists once the
  // session confirms isOwner (see timesheet-client.tsx) — that data has no
  // single "me" shape to prefetch server-side.
  const [myAttendance, myTaskHours] = await Promise.all([
    apiServer<AttendanceDay[]>("/timesheet/attendance/me"),
    apiServer<TaskHourEntry[]>("/timesheet/task-hours/me"),
  ]);

  return (
    <TimesheetClient
      myAttendance={myAttendance ?? []}
      myTaskHours={myTaskHours ?? []}
      isLive={Boolean(myAttendance)}
    />
  );
}
