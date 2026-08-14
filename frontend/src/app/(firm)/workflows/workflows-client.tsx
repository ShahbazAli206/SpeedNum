"use client";

import {
  CalendarX,
  CheckCheck,
  Clock,
  Eye,
  Kanban,
  Layers,
  ListChecks,
  Pencil,
  Plus,
  Table2,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { KpiTile } from "@/components/charts";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { DashboardHeader } from "@/components/dashboard/page-shell";
import { useToast } from "@/components/toast";
import { ButtonLink } from "@/components/ui";
import { del, patch } from "@/lib/api";
import { cn } from "@/lib/cn";
import { daysFromToday, type Task } from "@/lib/firm-demo";
import { dueLabel, formatDate, titleCase } from "@/lib/format";
import type { TaskStatus, TaskType } from "@/lib/types";

const COLUMNS: { status: TaskStatus; label: string; dot: string }[] = [
  { status: "todo", label: "To do", dot: "bg-muted" },
  { status: "in_progress", label: "In progress", dot: "bg-info" },
  { status: "review", label: "Review", dot: "bg-warn" },
  { status: "blocked", label: "Blocked", dot: "bg-danger" },
  { status: "complete", label: "Complete", dot: "bg-success" },
];

const PRIORITY_TONE: Record<string, string> = {
  urgent: "bg-danger-soft text-danger",
  high: "bg-warn-soft text-warn",
  medium: "bg-surface-2 text-ink-soft",
  low: "bg-surface-2 text-muted",
};

const STATUS_TONE: Record<TaskStatus, string> = {
  todo: "bg-surface-2 text-ink-soft",
  in_progress: "bg-info-soft text-info",
  review: "bg-warn-soft text-warn",
  blocked: "bg-danger-soft text-danger",
  complete: "bg-success-soft text-success",
};

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "review", label: "Review" },
  { value: "blocked", label: "Blocked" },
  { value: "complete", label: "Complete" },
];

const TYPE_LABEL: Record<TaskType, string> = { internal: "Internal", client: "Client", other: "Other" };

const TYPE_TABS: { value: "all" | TaskType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "internal", label: "Internal" },
  { value: "client", label: "Client" },
  { value: "other", label: "Other" },
];

const DUE_TONE = (task: Task, status: TaskStatus): string => {
  if (status === "complete" || !task.due_date) return "text-muted";
  const days = daysFromToday(task.due_date);
  if (days < 0) return "text-danger";
  if (days <= 1) return "text-warn";
  return "text-success";
};

export function WorkflowsClient({
  tasks,
  assignees,
}: {
  tasks: Task[];
  assignees: string[];
}) {
  const toast = useToast();
  const router = useRouter();
  const [view, setView] = useState<"board" | "table">("board");
  const [typeFilter, setTypeFilter] = useState<"all" | TaskType>("all");
  const [assignee, setAssignee] = useState("all");
  const [query, setQuery] = useState("");

  // Status changes and deletes try the real API, but always apply to
  // component state too — this still has to feel real on demo data, and on
  // most setups today there is no live backend to hit at all.
  const [moved, setMoved] = useState<Record<string, TaskStatus>>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const statusOf = (task: Task): TaskStatus => moved[task.id] ?? task.status;
  const live = useMemo(() => tasks.filter((task) => !removed.has(task.id)), [tasks, removed]);

  // KPIs always reflect every task regardless of the type/assignee/search
  // filters below them — the reference keeps these fixed while the list
  // scopes down, so a filter reads as "narrowing the view", not "recounting".
  const overview = useMemo(() => {
    const withStatus = live.map((task) => ({ ...task, status: statusOf(task) }));
    const open = withStatus.filter((task) => task.status !== "complete");
    const overdue = open.filter((task) => task.due_date && daysFromToday(task.due_date) < 0);
    const dueSoon = open.filter(
      (task) => task.due_date && daysFromToday(task.due_date) >= 0 && daysFromToday(task.due_date) <= 14,
    );
    return {
      total: live.length,
      open: open.length,
      dueSoon: dueSoon.length,
      overdue: overdue.length,
      completed: live.length - open.length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, moved]);

  const typeFiltered = useMemo(
    () => (typeFilter === "all" ? live : live.filter((task) => task.task_type === typeFilter)),
    [live, typeFilter],
  );

  const assigneeFiltered = useMemo(
    () => (assignee === "all" ? typeFiltered : typeFiltered.filter((task) => task.assignee_name === assignee)),
    [typeFiltered, assignee],
  );

  const boardFiltered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return assigneeFiltered.filter((task) => {
      if (!term) return true;
      return `${task.title} ${task.client_name} ${task.assignee_name}`.toLowerCase().includes(term);
    });
  }, [assigneeFiltered, query]);

  const move = (task: Task, status: TaskStatus) => {
    setMoved((current) => ({ ...current, [task.id]: status }));
    toast.success(`Moved to ${titleCase(status)}`, `${task.title} · ${task.client_name}`);
    patch(`/tasks/${task.id}`, { status }).catch(() => {
      // No live backend reachable — the change already applied locally above.
    });
  };

  const remove = (task: Task) => {
    if (typeof window !== "undefined" && !window.confirm(`Delete "${task.title}"? This can't be undone.`)) {
      return;
    }
    setRemoved((current) => new Set(current).add(task.id));
    toast.success("Task deleted", task.title);
    del(`/tasks/${task.id}`).catch(() => {});
  };

  const columns: Column<Task>[] = [
    {
      key: "task",
      header: "Task",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{row.title}</p>
          <p className="text-[11.5px] text-muted">{TYPE_LABEL[row.task_type]}</p>
        </div>
      ),
      sortValue: (row) => row.title,
    },
    {
      key: "client",
      header: "Client",
      cell: (row) =>
        row.client_id ? (
          <Link
            href={`/clients/${row.client_id}?tab=tasks`}
            onClick={(event) => event.stopPropagation()}
            className="font-medium text-brand transition hover:underline"
          >
            {row.client_name}
          </Link>
        ) : (
          <span className="text-muted">—</span>
        ),
      sortValue: (row) => row.client_name,
    },
    {
      key: "assignee",
      header: "Assignee",
      cell: (row) => row.assignee_name,
      sortValue: (row) => row.assignee_name,
    },
    {
      key: "priority",
      header: "Priority",
      cell: (row) => (
        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold", PRIORITY_TONE[row.priority])}>
          {titleCase(row.priority)}
        </span>
      ),
      sortValue: (row) => row.priority,
    },
    {
      key: "due",
      header: "Due",
      cell: (row) => (
        <div>
          <p className="text-ink-soft">{formatDate(row.due_date)}</p>
          {row.due_date ? (
            <p className={cn("flex items-center gap-1 text-[11.5px] font-medium", DUE_TONE(row, statusOf(row)))}>
              <Clock className="size-3" />
              {dueLabel(daysFromToday(row.due_date))}
            </p>
          ) : null}
        </div>
      ),
      sortValue: (row) => row.due_date ?? "9999-99-99",
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <select
          value={statusOf(row)}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => move(row, event.target.value as TaskStatus)}
          aria-label={`Status for ${row.title}`}
          className={cn(
            "h-7 rounded-full border-0 py-0 pr-6 pl-2.5 text-[11.5px] font-semibold transition",
            STATUS_TONE[statusOf(row)],
          )}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ),
      sortValue: (row) => statusOf(row),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <div className="flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
          <Link
            href={`/workflows/${row.id}`}
            aria-label={`View ${row.title}`}
            className="rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-ink"
          >
            <Eye className="size-4" />
          </Link>
          <Link
            href={`/workflows/${row.id}?edit=1`}
            aria-label={`Edit ${row.title}`}
            className="rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-ink"
          >
            <Pencil className="size-4" />
          </Link>
          <button
            type="button"
            onClick={() => remove(row)}
            aria-label={`Delete ${row.title}`}
            className="rounded-lg p-1.5 text-muted transition hover:bg-danger-soft hover:text-danger"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <DashboardHeader
        title="Task Master"
        subtitle="Internal, client and other work — assigned to your team with deadline reminders."
        actions={
          <ButtonLink href="/workflows/new" icon={<Plus className="size-4" />}>
            New task
          </ButtonLink>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiTile tone="blue" value={String(overview.total)} label="Total tasks" icon={<Layers className="size-5" />} />
        <KpiTile tone="violet" value={String(overview.open)} label="Open" icon={<ListChecks className="size-5" />} />
        <KpiTile tone="amber" value={String(overview.dueSoon)} label="Due soon" icon={<Clock className="size-5" />} />
        <KpiTile tone="rose" value={String(overview.overdue)} label="Overdue" icon={<CalendarX className="size-5" />} />
        <KpiTile tone="green" value={String(overview.completed)} label="Completed" icon={<CheckCheck className="size-5" />} />
      </div>

      {/* Type filter, always visible — narrows both views the same way */}
      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
          {TYPE_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setTypeFilter(tab.value)}
              aria-pressed={typeFilter === tab.value}
              className={cn(
                "rounded-md px-3 py-1.5 text-[13px] font-medium transition",
                typeFilter === tab.value ? "bg-brand text-white shadow-sm" : "text-muted hover:text-ink",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <p className="text-[12.5px] text-muted">
          {typeFiltered.length} of {live.length} tasks
        </p>

        {view === "board" ? (
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tasks…"
            aria-label="Search tasks"
            className="h-9 min-w-52 flex-1 rounded-lg border border-line bg-surface px-3 text-[13.5px] text-ink transition placeholder:text-muted/70 focus:border-brand sm:max-w-xs sm:flex-none"
          />
        ) : null}

        <select
          value={assignee}
          onChange={(event) => setAssignee(event.target.value)}
          aria-label="Assignee"
          className={cn(
            "h-9 min-w-40 rounded-lg border border-line-strong bg-surface pr-8 pl-3 text-[13.5px] text-ink transition focus:border-brand",
            view === "board" ? "" : "ml-auto",
          )}
        >
          <option value="all">All assignees</option>
          {assignees.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
          <button
            type="button"
            onClick={() => setView("board")}
            aria-pressed={view === "board"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition",
              view === "board" ? "bg-brand text-white shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            <Kanban className="size-3.5" />
            Board
          </button>
          <button
            type="button"
            onClick={() => setView("table")}
            aria-pressed={view === "table"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition",
              view === "table" ? "bg-brand text-white shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            <Table2 className="size-3.5" />
            Table
          </button>
        </div>
      </div>

      {view === "board" ? (
        <div className="scroll-thin -mx-1 overflow-x-auto pb-2">
          <div className="flex min-w-max gap-4 px-1">
            {COLUMNS.map((column) => {
              const columnTasks = boardFiltered.filter((task) => statusOf(task) === column.status);
              return (
                <section key={column.status} className="w-72 shrink-0">
                  <div className="mb-2.5 flex items-center gap-2 px-1">
                    <span className={cn("size-2 rounded-full", column.dot)} />
                    <h2 className="text-[13px] font-semibold text-ink">{column.label}</h2>
                    <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] tabular-nums text-muted">
                      {columnTasks.length}
                    </span>
                  </div>

                  <ul className="space-y-2">
                    {columnTasks.map((task) => (
                      <li
                        key={task.id}
                        onClick={() => router.push(`/workflows/${task.id}`)}
                        className="cursor-pointer rounded-xl border border-line bg-surface p-3 shadow-[var(--shadow-card)] transition hover:border-line-strong"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[13px] font-medium text-ink">{task.title}</p>
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold capitalize",
                              PRIORITY_TONE[task.priority],
                            )}
                          >
                            {task.priority}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-[12px] text-muted">
                          {TYPE_LABEL[task.task_type]}
                          {task.client_id ? ` · ${task.client_name}` : ""}
                        </p>
                        <div className="mt-2.5 flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="grid size-5 place-items-center rounded-full bg-brand-soft text-[9px] font-bold text-brand">
                              {task.assignee_name
                                .split(" ")
                                .map((part) => part[0])
                                .join("")}
                            </span>
                            <span className="text-[11.5px] text-muted">{formatDate(task.due_date)}</span>
                          </span>
                          <span className="text-[11.5px] tabular-nums text-muted">{task.estimate_hours}h</span>
                        </div>

                        {/* Inline status change — no need to open the card */}
                        <select
                          value={statusOf(task)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => move(task, event.target.value as TaskStatus)}
                          aria-label={`Status for ${task.title}`}
                          className="mt-2.5 h-7 w-full rounded-md border border-line bg-surface-2/60 px-2 text-[11.5px] text-ink-soft transition focus:border-brand"
                        >
                          {COLUMNS.map((option) => (
                            <option key={option.status} value={option.status}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </li>
                    ))}
                    {columnTasks.length === 0 ? (
                      <li className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-[12px] text-muted">
                        Nothing here
                      </li>
                    ) : null}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
          <DataTable
            rows={assigneeFiltered}
            columns={columns}
            searchKeys={(row) => `${row.title} ${row.client_name} ${row.assignee_name}`}
            searchPlaceholder="Search tasks…"
            filters={[
              {
                label: "Statuses",
                options: STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
                predicate: (row, value) => statusOf(row) === value,
              },
            ]}
            onRowClick={(row) => router.push(`/workflows/${row.id}`)}
            emptyTitle="No tasks match"
            emptyDescription="Try clearing the search or the filters above."
            exportName="speednum-tasks"
          />
        </section>
      )}
    </>
  );
}
