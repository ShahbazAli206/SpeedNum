"use client";

import { Building2, CalendarClock, Layers, Pencil, Save, Trash2, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { useToast } from "@/components/toast";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { del, patch } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { ClientRow, Task, TeamRow } from "@/lib/firm-demo";
import { formatDate, titleCase } from "@/lib/format";
import type { TaskPriority, TaskStatus, TaskType } from "@/lib/types";

const TYPE_OPTIONS: { value: TaskType; label: string }[] = [
  { value: "internal", label: "Internal" },
  { value: "client", label: "Client" },
  { value: "other", label: "Other" },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "review", label: "Review" },
  { value: "blocked", label: "Blocked" },
  { value: "complete", label: "Complete" },
];

const STATUS_TONE: Record<TaskStatus, string> = {
  todo: "bg-surface-2 text-ink-soft",
  in_progress: "bg-info-soft text-info",
  review: "bg-warn-soft text-warn",
  blocked: "bg-danger-soft text-danger",
  complete: "bg-success-soft text-success",
};

const PRIORITY_TONE: Record<TaskPriority, string> = {
  urgent: "bg-danger-soft text-danger",
  high: "bg-warn-soft text-warn",
  medium: "bg-surface-2 text-ink-soft",
  low: "bg-surface-2 text-muted",
};

const statusLabel = (value: TaskStatus) => STATUS_OPTIONS.find((option) => option.value === value)?.label ?? value;

export function TaskDetailClient({
  task,
  clients,
  team,
  initialEditing,
}: {
  task: Task;
  clients: ClientRow[];
  team: TeamRow[];
  initialEditing: boolean;
}) {
  const toast = useToast();
  const router = useRouter();

  const [deleted, setDeleted] = useState(false);
  const [status, setStatus] = useState<TaskStatus>(task.status);

  const [editing, setEditing] = useState(initialEditing);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [taskType, setTaskType] = useState<TaskType>(task.task_type);
  const [clientId, setClientId] = useState(task.client_id ?? "");
  const [assigneeId, setAssigneeId] = useState(task.assignee_id);
  const [assigneeName, setAssigneeName] = useState(task.assignee_name);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [saving, setSaving] = useState(false);

  const client = clients.find((row) => row.id === clientId);

  const resetEdits = () => {
    setTitle(task.title);
    setDescription(task.description ?? "");
    setTaskType(task.task_type);
    setClientId(task.client_id ?? "");
    setAssigneeId(task.assignee_id);
    setAssigneeName(task.assignee_name);
    setPriority(task.priority);
    setDueDate(task.due_date ?? "");
  };

  const changeStatus = async (next: TaskStatus) => {
    setStatus(next);
    toast.success(`Marked ${statusLabel(next).toLowerCase()}`, title);
    try {
      await patch(`/tasks/${task.id}`, { status: next });
    } catch {
      // No live backend reachable — the change already applied above.
    }
  };

  const saveEdits = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    setSaving(true);
    setAssigneeName(team.find((member) => member.id === assigneeId)?.full_name ?? "Unassigned");
    try {
      await patch(`/tasks/${task.id}`, {
        title: trimmedTitle,
        description: description.trim() || null,
        task_type: taskType,
        client_id: taskType === "client" && clientId ? clientId : null,
        assignee_id: assigneeId || null,
        priority,
        due_date: dueDate || null,
      });
    } catch {
      // No live backend reachable — the edits still apply to this view below.
    }
    toast.success("Task updated", trimmedTitle);
    setEditing(false);
    setSaving(false);
  };

  const removeTask = async () => {
    if (typeof window !== "undefined" && !window.confirm(`Delete "${title}"? This can't be undone.`)) return;
    setDeleted(true);
    toast.success("Task deleted", title);
    try {
      await del(`/tasks/${task.id}`);
    } catch {
      // No live backend reachable — leaving Task Master still reflects the delete.
    }
    router.push("/workflows");
  };

  if (deleted) return null;

  return (
    <>
      <Link href="/workflows" className="text-[12.5px] font-medium text-brand transition hover:underline">
        ← Back to Task Master
      </Link>

      <div className="mt-3 mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-[1.6rem] font-bold tracking-tight text-ink">{title}</h1>
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_TONE[status])}>
              {statusLabel(status)}
            </span>
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", PRIORITY_TONE[priority])}>
              {titleCase(priority)} priority
            </span>
          </div>
          <p className="mt-0.5 text-[14px] text-muted">{titleCase(taskType)} task</p>
        </div>
        {!editing ? (
          <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
            Edit task
          </Button>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-semibold text-ink">Details</h2>
            <p className="mt-0.5 text-[13px] text-muted">Everything captured for this task.</p>
          </div>

          {editing ? (
            <div className="space-y-4 p-5">
              <Field label="Title" required>
                <Input value={title} onChange={(event) => setTitle(event.target.value)} />
              </Field>
              <Field label="Description">
                <Textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Type">
                  <Select value={taskType} onChange={(event) => setTaskType(event.target.value as TaskType)}>
                    {TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Assign to">
                  <Select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
                    <option value="">Unassigned</option>
                    {team.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.full_name}
                      </option>
                    ))}
                  </Select>
                </Field>

                {taskType === "client" ? (
                  <Field label="Client" className="sm:col-span-2">
                    <Select value={clientId} onChange={(event) => setClientId(event.target.value)}>
                      <option value="">No specific client</option>
                      {clients.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.business_name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : null}

                <Field label="Priority">
                  <Select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
                    {PRIORITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Due date">
                  <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                </Field>
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="secondary"
                  disabled={saving}
                  onClick={() => {
                    resetEdits();
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
                <Button icon={<Save className="size-4" />} loading={saving} onClick={saveEdits}>
                  Save changes
                </Button>
              </div>
            </div>
          ) : (
            <dl className="grid gap-x-6 gap-y-5 p-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <dt className="text-[11.5px] tracking-wide text-muted uppercase">Description</dt>
                <dd className="mt-1 text-[13.5px] leading-relaxed text-ink">{description || "No description."}</dd>
              </div>
              <MetaItem icon={<Layers className="size-3.5" />} label="Type" value={titleCase(taskType)} />
              <MetaItem icon={<User className="size-3.5" />} label="Assigned to" value={assigneeName} />
              <div>
                <dt className="flex items-center gap-1.5 text-[11.5px] tracking-wide text-muted uppercase">
                  <Building2 className="size-3.5" />
                  Client
                </dt>
                <dd className="mt-1 text-[13.5px] font-medium">
                  {client ? (
                    <Link href={`/clients/${client.id}?tab=tasks`} className="text-brand transition hover:underline">
                      {client.business_name}
                    </Link>
                  ) : (
                    <span className="text-ink">—</span>
                  )}
                </dd>
              </div>
              <MetaItem
                icon={<CalendarClock className="size-3.5" />}
                label="Due date"
                value={dueDate ? formatDate(dueDate) : "—"}
              />
              <MetaItem label="Created" value={formatDate(task.created_at)} />
            </dl>
          )}
        </section>

        <section className="h-fit rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-semibold text-ink">Manage</h2>
            <p className="mt-0.5 text-[13px] text-muted">Update status or remove this task.</p>
          </div>
          <div className="space-y-4 p-5">
            <Field label="Status">
              <Select value={status} onChange={(event) => changeStatus(event.target.value as TaskStatus)}>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              variant="danger"
              icon={<Trash2 className="size-4" />}
              className="w-full"
              onClick={removeTask}
            >
              Delete task
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}

function MetaItem({ icon, label, value }: { icon?: ReactNode; label: string; value: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[11.5px] tracking-wide text-muted uppercase">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 text-[13.5px] font-medium text-ink">{value}</dd>
    </div>
  );
}
