"use client";

import { CalendarClock, Clock, ListChecks, Pencil, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { KpiTile } from "@/components/charts";
import { DataTable, type Column, type FilterSpec } from "@/components/dashboard/data-table";
import { DashboardHeader, KpiRow } from "@/components/dashboard/page-shell";
import { useToast } from "@/components/toast";
import { Button, Field, Input, Modal, Select, Tab, Tabs } from "@/components/ui";
import { get, patch } from "@/lib/api";
import { formatDate, formatDateTime, formatDurationShort } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { AttendanceDay, TaskHourEntry, UserRole } from "@/lib/types";

type ViewMode = "daily" | "weekly" | "monthly";

/** Pull a human-readable reason out of an ApiError without leaking `[object]`. */
function message(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** ISO timestamp -> the local `YYYY-MM-DDTHH:mm` a <input type="datetime-local"> wants. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The reverse: a datetime-local value (parsed as browser-local time by
 * `Date`) back to an ISO string the API can store. */
function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isoWeek(workDate: string): { key: string; label: string } {
  const date = new Date(`${workDate}T00:00:00Z`);
  const mondayOffset = (date.getUTCDay() + 6) % 7; // 0 = Monday
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - mondayOffset);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    key: monday.toISOString().slice(0, 10),
    label: `${formatDate(monday.toISOString())} – ${formatDate(sunday.toISOString())}`,
  };
}

function monthOf(workDate: string): { key: string; label: string } {
  const date = new Date(`${workDate}T00:00:00Z`);
  return {
    key: workDate.slice(0, 7),
    label: date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
  };
}

interface AggregatedRow {
  id: string;
  profile_id: string;
  profile_name: string | null;
  role: UserRole | null;
  period_label: string;
  period_key: string;
  total_seconds: number;
  days_worked: number;
}

/** Collapses daily attendance rows into one row per (staff, week|month) —
 * backs the "total working hours per week/month" view. Pure arithmetic over
 * the authoritative per-day worked_seconds the backend already computed, so
 * it can never disagree with the Daily view of the same underlying rows. */
function aggregate(rows: AttendanceDay[], mode: "weekly" | "monthly"): AggregatedRow[] {
  const groups = new Map<string, AggregatedRow>();
  for (const row of rows) {
    const { key, label } = mode === "weekly" ? isoWeek(row.work_date) : monthOf(row.work_date);
    const groupKey = `${row.profile_id}__${key}`;
    const existing = groups.get(groupKey);
    if (existing) {
      existing.total_seconds += row.worked_seconds;
      if (row.worked_seconds > 0) existing.days_worked += 1;
    } else {
      groups.set(groupKey, {
        id: groupKey,
        profile_id: row.profile_id,
        profile_name: row.profile_name,
        role: row.role,
        period_label: label,
        period_key: key,
        total_seconds: row.worked_seconds,
        days_worked: row.worked_seconds > 0 ? 1 : 0,
      });
    }
  }
  return [...groups.values()].sort((a, b) =>
    a.period_key !== b.period_key
      ? b.period_key.localeCompare(a.period_key)
      : (a.profile_name ?? "").localeCompare(b.profile_name ?? ""),
  );
}

const ROLE_LABEL: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member", viewer: "Viewer" };
const ROLE_OPTIONS = Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }));

export function TimesheetClient({
  myAttendance,
  myTaskHours,
  isLive,
}: {
  myAttendance: AttendanceDay[];
  myTaskHours: TaskHourEntry[];
  isLive: boolean;
}) {
  const session = useSession();
  const toast = useToast();
  // isLive gates on the server having actually reached the API for the
  // initial "me" fetch — matching session.isLive avoids a flash where
  // session.isOwner defaults true before /auth/me resolves but the owner-
  // wide fetch below has nothing real to load yet.
  const isOwner = session.isOwner && session.isLive && isLive;

  const [tab, setTab] = useState<"attendance" | "task-hours">("attendance");
  const [viewMode, setViewMode] = useState<ViewMode>("daily");

  const [teamAttendance, setTeamAttendance] = useState<AttendanceDay[] | null>(null);
  const [teamTaskHours, setTeamTaskHours] = useState<TaskHourEntry[] | null>(null);

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    Promise.all([get<AttendanceDay[]>("/timesheet/attendance"), get<TaskHourEntry[]>("/timesheet/task-hours")])
      .then(([attendance, hours]) => {
        if (cancelled) return;
        setTeamAttendance(attendance);
        setTeamTaskHours(hours);
      })
      .catch((error) => {
        if (!cancelled) toast.error(message(error, "Could not load the team timesheet."));
      });
    return () => {
      cancelled = true;
    };
  }, [isOwner, toast]);

  const attendanceRows = useMemo(
    () => (isOwner ? (teamAttendance ?? []) : myAttendance),
    [isOwner, teamAttendance, myAttendance],
  );
  const taskHourRows = useMemo(
    () => (isOwner ? (teamTaskHours ?? []) : myTaskHours),
    [isOwner, teamTaskHours, myTaskHours],
  );

  // --- Attendance edit (Owner only) ---
  const [editing, setEditing] = useState<AttendanceDay | null>(null);
  const [startValue, setStartValue] = useState("");
  const [endValue, setEndValue] = useState("");
  const [saving, setSaving] = useState(false);

  const openEdit = (row: AttendanceDay) => {
    setEditing(row);
    setStartValue(toLocalInput(row.start_time));
    setEndValue(toLocalInput(row.end_time));
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const updated = await patch<AttendanceDay>(`/timesheet/attendance/${editing.id}`, {
        start_time: fromLocalInput(startValue),
        end_time: endValue ? fromLocalInput(endValue) : null,
      });
      setTeamAttendance((current) => (current ?? []).map((row) => (row.id === updated.id ? updated : row)));
      toast.success("Attendance record updated.");
      setEditing(null);
    } catch (error) {
      toast.error(message(error, "Could not update that record."));
    } finally {
      setSaving(false);
    }
  };

  // --- Task-hours adjustment (Owner only) ---
  const [editingHours, setEditingHours] = useState<TaskHourEntry | null>(null);
  const [hoursValue, setHoursValue] = useState("");
  const [savingHours, setSavingHours] = useState(false);

  const openEditHours = (row: TaskHourEntry) => {
    setEditingHours(row);
    setHoursValue((row.accumulated_seconds / 3600).toFixed(2));
  };

  const saveEditHours = async () => {
    if (!editingHours) return;
    const hours = Number(hoursValue);
    if (!Number.isFinite(hours) || hours < 0) {
      toast.error("Enter a valid number of hours.");
      return;
    }
    setSavingHours(true);
    try {
      const updated = await patch<TaskHourEntry>(`/timesheet/task-hours/${editingHours.id}`, {
        accumulated_seconds: Math.round(hours * 3600),
      });
      setTeamTaskHours((current) => (current ?? []).map((row) => (row.id === updated.id ? updated : row)));
      toast.success("Time entry updated.");
      setEditingHours(null);
    } catch (error) {
      toast.error(message(error, "Could not update that entry."));
    } finally {
      setSavingHours(false);
    }
  };

  const summary = useMemo(() => {
    const totalDaysWithHours = attendanceRows.filter((row) => row.worked_seconds > 0).length;
    const totalSeconds = attendanceRows.reduce((sum, row) => sum + row.worked_seconds, 0);
    const openDays = attendanceRows.filter((row) => !row.end_time).length;
    const activeStaff = new Set(attendanceRows.map((row) => row.profile_id)).size;
    return { totalDaysWithHours, totalSeconds, openDays, activeStaff };
  }, [attendanceRows]);

  const dailyColumns: Column<AttendanceDay>[] = [
    ...(isOwner
      ? ([
          {
            key: "staff",
            header: "Staff",
            cell: (row) => row.profile_name ?? "—",
            sortValue: (row) => row.profile_name ?? "",
          },
          {
            key: "role",
            header: "Role",
            cell: (row) => (row.role ? (ROLE_LABEL[row.role] ?? row.role) : "—"),
            sortValue: (row) => row.role ?? "",
          },
        ] satisfies Column<AttendanceDay>[])
      : []),
    { key: "date", header: "Date", cell: (row) => formatDate(row.work_date, "long"), sortValue: (row) => row.work_date },
    {
      key: "start",
      header: "Start time",
      cell: (row) => formatDateTime(row.start_time),
      sortValue: (row) => row.start_time,
    },
    {
      key: "end",
      header: "Off time",
      cell: (row) => (row.end_time ? formatDateTime(row.end_time) : <span className="text-muted">Not confirmed</span>),
      sortValue: (row) => row.end_time ?? "",
    },
    {
      key: "worked",
      header: "Hours",
      align: "right",
      cell: (row) => (row.worked_seconds > 0 ? formatDurationShort(row.worked_seconds) : "—"),
      sortValue: (row) => row.worked_seconds,
      exportValue: (row) => (row.worked_seconds / 3600).toFixed(2),
    },
    ...(isOwner
      ? ([
          {
            key: "actions",
            header: "",
            align: "right",
            cell: (row) => (
              <Button size="sm" variant="secondary" icon={<Pencil className="size-3.5" />} onClick={() => openEdit(row)}>
                Edit
              </Button>
            ),
          },
        ] satisfies Column<AttendanceDay>[])
      : []),
  ];

  const periodColumns: Column<AggregatedRow>[] = [
    ...(isOwner
      ? ([
          {
            key: "staff",
            header: "Staff",
            cell: (row) => row.profile_name ?? "—",
            sortValue: (row) => row.profile_name ?? "",
          },
          {
            key: "role",
            header: "Role",
            cell: (row) => (row.role ? (ROLE_LABEL[row.role] ?? row.role) : "—"),
            sortValue: (row) => row.role ?? "",
          },
        ] satisfies Column<AggregatedRow>[])
      : []),
    {
      key: "period",
      header: viewMode === "weekly" ? "Week" : "Month",
      cell: (row) => row.period_label,
      sortValue: (row) => row.period_key,
    },
    { key: "days", header: "Days worked", align: "right", cell: (row) => String(row.days_worked), sortValue: (row) => row.days_worked },
    {
      key: "total",
      header: "Total hours",
      align: "right",
      cell: (row) => formatDurationShort(row.total_seconds),
      sortValue: (row) => row.total_seconds,
      exportValue: (row) => (row.total_seconds / 3600).toFixed(2),
    },
  ];

  const attendanceRoleFilter: FilterSpec<AttendanceDay>[] = [
    { label: "Role", options: ROLE_OPTIONS, predicate: (row, value) => row.role === value },
  ];
  const periodRoleFilter: FilterSpec<AggregatedRow>[] = [
    { label: "Role", options: ROLE_OPTIONS, predicate: (row, value) => row.role === value },
  ];

  const taskHourColumns: Column<TaskHourEntry>[] = [
    ...(isOwner
      ? ([
          {
            key: "assignee",
            header: "Staff",
            cell: (row) => row.assignee_name ?? "—",
            sortValue: (row) => row.assignee_name ?? "",
          },
        ] satisfies Column<TaskHourEntry>[])
      : []),
    { key: "client", header: "Client", cell: (row) => row.client_name ?? "Internal", sortValue: (row) => row.client_name ?? "" },
    { key: "task", header: "Task", cell: (row) => row.task_title, sortValue: (row) => row.task_title },
    {
      key: "status",
      header: "Status",
      cell: (row) =>
        row.status === "running" ? (
          <span className="inline-flex items-center gap-1.5 text-success">
            <span className="size-1.5 animate-pulse rounded-full bg-success" /> Running
          </span>
        ) : (
          <span className="text-muted">Stopped</span>
        ),
      sortValue: (row) => row.status,
    },
    {
      key: "hours",
      header: "Hours spent",
      align: "right",
      cell: (row) => formatDurationShort(row.total_seconds),
      sortValue: (row) => row.total_seconds,
      exportValue: (row) => (row.total_seconds / 3600).toFixed(2),
    },
    ...(isOwner
      ? ([
          {
            key: "actions",
            header: "",
            align: "right",
            cell: (row) => (
              <Button size="sm" variant="secondary" icon={<Pencil className="size-3.5" />} onClick={() => openEditHours(row)}>
                Adjust
              </Button>
            ),
          },
        ] satisfies Column<TaskHourEntry>[])
      : []),
  ];

  const clientOptions = useMemo(() => {
    const names = new Set(taskHourRows.map((row) => row.client_name).filter((n): n is string => Boolean(n)));
    return [...names].sort().map((name) => ({ value: name, label: name }));
  }, [taskHourRows]);

  const taskHourFilters: FilterSpec<TaskHourEntry>[] = [
    { label: "Client", options: clientOptions, predicate: (row, value) => row.client_name === value },
  ];

  return (
    <div>
      <DashboardHeader
        title="Timesheet"
        subtitle={
          isOwner
            ? "Every staff member's sign-in/out and hours spent on client tasks."
            : "Your own daily sign-in/out and hours spent on client tasks."
        }
      />

      {isOwner ? (
        <KpiRow>
          <KpiTile tone="blue" value={String(summary.activeStaff)} label="Staff with activity" icon={<Users className="size-5" />} />
          <KpiTile tone="green" value={formatDurationShort(summary.totalSeconds)} label="Hours in range" icon={<Clock className="size-5" />} />
          <KpiTile tone="amber" value={String(summary.openDays)} label="Unconfirmed sign-offs" icon={<CalendarClock className="size-5" />} />
          <KpiTile tone="violet" value={String(summary.totalDaysWithHours)} label="Days completed" icon={<ListChecks className="size-5" />} />
        </KpiRow>
      ) : null}

      <div className="mt-6 rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
          <Tabs value={tab} onChange={(value) => setTab(value as typeof tab)}>
            <Tab id="attendance">Attendance</Tab>
            <Tab id="task-hours">Client task hours</Tab>
          </Tabs>
          {tab === "attendance" ? (
            <Select
              value={viewMode}
              onValueChange={(value) => setViewMode(value as ViewMode)}
              fullWidth={false}
              className="min-w-32"
              options={[
                { value: "daily", label: "Daily" },
                { value: "weekly", label: "Weekly" },
                { value: "monthly", label: "Monthly" },
              ]}
            />
          ) : null}
        </div>

        {tab === "attendance" ? (
          viewMode === "daily" ? (
            <DataTable
              rows={attendanceRows}
              columns={dailyColumns}
              searchKeys={(row) => `${row.profile_name ?? ""} ${row.work_date}`}
              searchPlaceholder="Search by staff or date…"
              filters={isOwner ? attendanceRoleFilter : []}
              emptyTitle="No attendance recorded yet"
              emptyDescription="Sign-in times are captured automatically the first time each day someone logs in."
              exportName={isOwner ? "timesheet-attendance" : undefined}
            />
          ) : (
            <DataTable
              rows={aggregate(attendanceRows, viewMode)}
              columns={periodColumns}
              searchKeys={(row) => `${row.profile_name ?? ""} ${row.period_label}`}
              searchPlaceholder="Search by staff or period…"
              filters={isOwner ? periodRoleFilter : []}
              emptyTitle="No attendance recorded yet"
              emptyDescription="Sign-in times are captured automatically the first time each day someone logs in."
              exportName={isOwner ? `timesheet-attendance-${viewMode}` : undefined}
            />
          )
        ) : (
          <DataTable
            rows={taskHourRows}
            columns={taskHourColumns}
            searchKeys={(row) => `${row.assignee_name ?? ""} ${row.client_name ?? ""} ${row.task_title}`}
            searchPlaceholder="Search by staff, client or task…"
            filters={taskHourFilters}
            emptyTitle="No time tracked yet"
            emptyDescription="Hours appear here once a staff member starts a task timer in Task Master."
            exportName={isOwner ? "timesheet-task-hours" : undefined}
          />
        )}
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit attendance"
        description={editing?.profile_name ? `${editing.profile_name} — ${formatDate(editing.work_date, "long")}` : undefined}
        width="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={() => void saveEdit()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Start time" required>
            <Input type="datetime-local" value={startValue} onChange={(e) => setStartValue(e.target.value)} />
          </Field>
          <Field label="Off time" hint="Leave blank for an unconfirmed sign-off.">
            <Input type="datetime-local" value={endValue} onChange={(e) => setEndValue(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={editingHours !== null}
        onClose={() => setEditingHours(null)}
        title="Adjust time entry"
        description={editingHours ? `${editingHours.assignee_name ?? "Staff"} — ${editingHours.task_title}` : undefined}
        width="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingHours(null)}>
              Cancel
            </Button>
            <Button onClick={() => void saveEditHours()} disabled={savingHours}>
              {savingHours ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <Field label="Total hours" required hint="Overwrites the banked time on this task for this staff member.">
          <Input type="number" min="0" step="0.25" value={hoursValue} onChange={(e) => setHoursValue(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}
