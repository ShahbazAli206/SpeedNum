"use client";

import { Kanban, Plus, Table2 } from "lucide-react";
import { useMemo, useState } from "react";

import { DashboardHeader } from "@/components/dashboard/page-shell";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Project, Task } from "@/lib/firm-demo";
import { formatDate, titleCase } from "@/lib/format";
import type { TaskStatus } from "@/lib/types";

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

const PROJECT_TONE: Record<string, string> = {
  not_started: "bg-surface-2 text-muted",
  in_progress: "bg-info-soft text-info",
  review: "bg-warn-soft text-warn",
  complete: "bg-success-soft text-success",
  on_hold: "bg-danger-soft text-danger",
};

export function WorkflowsClient({
  projects,
  tasks,
  assignees,
}: {
  projects: Project[];
  tasks: Task[];
  assignees: string[];
}) {
  const toast = useToast();
  const [view, setView] = useState<"board" | "table">("board");
  const [assignee, setAssignee] = useState("all");
  const [query, setQuery] = useState("");

  // Status changes are local-only until the workflows API is wired; the board
  // still has to feel real, so moves are applied to component state.
  const [moved, setMoved] = useState<Record<string, TaskStatus>>({});

  const statusOf = (task: Task): TaskStatus => moved[task.id] ?? task.status;

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return tasks.filter((task) => {
      if (assignee !== "all" && task.assignee_name !== assignee) return false;
      if (!term) return true;
      return `${task.title} ${task.client_name} ${task.assignee_name}`
        .toLowerCase()
        .includes(term);
    });
  }, [tasks, assignee, query]);

  const move = (task: Task, status: TaskStatus) => {
    setMoved((current) => ({ ...current, [task.id]: status }));
    toast.success(`Moved to ${titleCase(status)}`, `${task.title} · ${task.client_name}`);
  };

  return (
    <>
      <DashboardHeader
        title="Task Master"
        subtitle="A project per client per period — table or Kanban, same records"
        actions={<Button icon={<Plus className="size-4" />}>New project</Button>}
      />

      {/* One filter row above everything it scopes */}
      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tasks…"
          aria-label="Search tasks"
          className="h-9 min-w-52 flex-1 rounded-lg border border-line bg-surface px-3 text-[13.5px] text-ink transition placeholder:text-muted/70 focus:border-brand sm:max-w-xs sm:flex-none"
        />
        <select
          value={assignee}
          onChange={(event) => setAssignee(event.target.value)}
          aria-label="Assignee"
          className="h-9 min-w-40 rounded-lg border border-line-strong bg-surface pr-8 pl-3 text-[13.5px] text-ink transition focus:border-brand"
        >
          <option value="all">All assignees</option>
          {assignees.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        <div className="ml-auto inline-flex rounded-lg border border-line bg-surface p-0.5">
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
              const columnTasks = filtered.filter((task) => statusOf(task) === column.status);
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
                        className="rounded-xl border border-line bg-surface p-3 shadow-[var(--shadow-card)]"
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
                        <p className="mt-1 truncate text-[12px] text-muted">{task.client_name}</p>
                        <div className="mt-2.5 flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="grid size-5 place-items-center rounded-full bg-brand-soft text-[9px] font-bold text-brand">
                              {task.assignee_name
                                .split(" ")
                                .map((part) => part[0])
                                .join("")}
                            </span>
                            <span className="text-[11.5px] text-muted">
                              {formatDate(task.due_date)}
                            </span>
                          </span>
                          <span className="text-[11.5px] tabular-nums text-muted">
                            {task.estimate_hours}h
                          </span>
                        </div>

                        {/* Inline status change — no need to open the card */}
                        <select
                          value={statusOf(task)}
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
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-semibold text-ink">Projects</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              One per client per period, with rolled-up completion
            </p>
          </div>
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-line text-[11.5px] tracking-wide text-muted uppercase">
                  <th className="px-5 py-2.5 text-left font-semibold">Project</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Client</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Period</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Owner</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Progress</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Due</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => {
                  const pct =
                    project.task_count === 0
                      ? 0
                      : Math.round((project.completed_tasks / project.task_count) * 100);
                  return (
                    <tr key={project.id} className="border-b border-line last:border-b-0">
                      <td className="px-5 py-3 font-medium text-ink">{project.name}</td>
                      <td className="px-5 py-3 text-ink-soft">{project.client_name}</td>
                      <td className="px-5 py-3 text-muted">{project.period_label}</td>
                      <td className="px-5 py-3 text-ink-soft">{project.assignee_name}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2">
                            <div
                              className="h-full rounded-full bg-brand"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-14 text-right text-[12px] tabular-nums text-muted">
                            {project.completed_tasks}/{project.task_count}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-ink-soft">
                        {formatDate(project.due_date)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            PROJECT_TONE[project.status],
                          )}
                        >
                          {titleCase(project.status)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
