"use client";

import { Building2, CalendarClock, Layers, Paperclip, Pencil, Save, Send, Trash2, Upload, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";

import { useToast } from "@/components/toast";
import { Button, EmptyState, Field, Input, LoadingBlock, Select, Textarea } from "@/components/ui";
import { del, patch, post } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { ClientRow, Task, TeamRow } from "@/lib/firm-demo";
import { formatBytes, formatDate, formatDateTime, titleCase } from "@/lib/format";
import { useAction, useApi } from "@/lib/hooks";
import { taskAttachmentUrl, uploadTaskAttachment } from "@/lib/storage";
import type { TaskAttachment, TaskComment, TaskPriority, TaskStatus, TaskType } from "@/lib/types";

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

/** Pull a human-readable reason out of an ApiError without leaking `[object]`. */
function message(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function TaskDetailClient({
  task,
  clients,
  team,
  initialEditing,
  isLive,
}: {
  task: Task;
  clients: ClientRow[];
  team: TeamRow[];
  initialEditing: boolean;
  /** False for the handful of demo fixture ids that still exist for design
   * reference — every real task (a UUID from the API) is live. Attachments
   * and comments only make sense against a live task; a demo task has
   * nothing behind its id for those endpoints to find. */
  isLive: boolean;
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
  const [assigneeId, setAssigneeId] = useState(task.assignee_id ?? "");
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
    setAssigneeId(task.assignee_id ?? "");
    setAssigneeName(task.assignee_name ?? "");
    setPriority(task.priority);
    setDueDate(task.due_date ?? "");
  };

  const changeStatus = async (next: TaskStatus) => {
    const previous = status;
    setStatus(next);
    try {
      await patch(`/tasks/${task.id}`, { status: next });
      toast.success(`Marked ${statusLabel(next).toLowerCase()}`, title);
    } catch (error) {
      setStatus(previous);
      toast.error("Could not update status", message(error, "Please try again."));
    }
  };

  const saveEdits = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    setSaving(true);
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
      setAssigneeName(team.find((member) => member.id === assigneeId)?.full_name ?? "Unassigned");
      toast.success("Task updated", trimmedTitle);
      setEditing(false);
    } catch (error) {
      toast.error("Could not save changes", message(error, "Please try again."));
    } finally {
      setSaving(false);
    }
  };

  const [deleting, setDeleting] = useState(false);

  const removeTask = async () => {
    if (typeof window !== "undefined" && !window.confirm(`Delete "${title}"? This can't be undone.`)) return;
    setDeleting(true);
    try {
      await del(`/tasks/${task.id}`);
      setDeleted(true);
      toast.success("Task deleted", title);
      router.push("/workflows");
    } catch (error) {
      toast.error("Could not delete task", message(error, "Please try again."));
    } finally {
      setDeleting(false);
    }
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
                  <Select
                    value={taskType}
                    onValueChange={(next) => setTaskType(next as TaskType)}
                    options={TYPE_OPTIONS}
                  />
                </Field>
                <Field label="Assign to">
                  <Select
                    value={assigneeId}
                    onValueChange={setAssigneeId}
                    placeholder="Unassigned"
                    options={[
                      { value: "", label: "Unassigned" },
                      ...team.map((member) => ({
                        value: member.id,
                        label: member.full_name,
                        description: member.email,
                      })),
                    ]}
                  />
                </Field>

                {taskType === "client" ? (
                  <Field label="Client" className="sm:col-span-2">
                    <Select
                      value={clientId}
                      onValueChange={setClientId}
                      placeholder="No specific client"
                      searchPlaceholder="Search clients…"
                      options={[
                        { value: "", label: "No specific client" },
                        ...clients.map((row) => ({
                          value: row.id,
                          label: row.business_name,
                        })),
                      ]}
                    />
                  </Field>
                ) : null}

                <Field label="Priority">
                  <Select
                    value={priority}
                    onValueChange={(next) => setPriority(next as TaskPriority)}
                    options={PRIORITY_OPTIONS}
                  />
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
              <MetaItem icon={<User className="size-3.5" />} label="Assigned to" value={assigneeName || "Unassigned"} />
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
              <Select
                value={status}
                onValueChange={(next) => changeStatus(next as TaskStatus)}
                options={STATUS_OPTIONS}
              />
            </Field>
            <Button
              variant="danger"
              icon={<Trash2 className="size-4" />}
              className="w-full"
              loading={deleting}
              onClick={removeTask}
            >
              Delete task
            </Button>
          </div>
        </section>
      </div>

      {isLive ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <TaskAttachments taskId={task.id} />
          <TaskComments taskId={task.id} />
        </div>
      ) : null}
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

function TaskAttachments({ taskId }: { taskId: string }) {
  const toast = useToast();
  const attachments = useApi<TaskAttachment[]>(`/tasks/${taskId}/attachments`);
  const upload = useAction();
  const remove = useAction();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    upload.run(async () => {
      await uploadTaskAttachment(taskId, file);
      toast.success("Attachment uploaded", file.name);
      await attachments.reload();
    });
  };

  const openAttachment = async (attachment: TaskAttachment) => {
    const url = await taskAttachmentUrl(taskId, attachment.id);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const deleteAttachment = (attachment: TaskAttachment) =>
    remove.run(async () => {
      await del(`/tasks/${taskId}/attachments/${attachment.id}`);
      toast.success("Attachment removed", attachment.name);
      await attachments.reload();
    });

  return (
    <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Attachments</h2>
          <p className="mt-0.5 text-[13px] text-muted">Files relevant to this task.</p>
        </div>
        <input ref={fileInputRef} type="file" className="hidden" onChange={onFileSelected} />
        <Button
          variant="secondary"
          size="sm"
          icon={<Upload className="size-3.5" />}
          loading={upload.pending}
          onClick={() => fileInputRef.current?.click()}
        >
          Upload
        </Button>
      </div>
      {upload.error ? <p className="px-5 pt-3 text-[12.5px] font-medium text-danger">{upload.error}</p> : null}
      {attachments.isLoading ? (
        <LoadingBlock label="Loading attachments…" />
      ) : !attachments.data?.length ? (
        <EmptyState icon={<Paperclip className="size-5" />} title="No attachments yet" />
      ) : (
        <ul className="divide-y divide-line">
          {attachments.data.map((attachment) => (
            <li key={attachment.id} className="flex items-center gap-3 px-5 py-3">
              <Paperclip className="size-4 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => openAttachment(attachment)}
                  className="block truncate text-left text-[13.5px] font-medium text-brand hover:underline"
                >
                  {attachment.name}
                </button>
                <p className="text-[11.5px] text-muted">
                  {formatBytes(attachment.size_bytes)} · {attachment.uploaded_by_name ?? "Unknown"} ·{" "}
                  {formatDateTime(attachment.created_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => deleteAttachment(attachment)}
                aria-label={`Remove ${attachment.name}`}
                className="shrink-0 rounded-md p-1.5 text-muted transition hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TaskComments({ taskId }: { taskId: string }) {
  const toast = useToast();
  const comments = useApi<TaskComment[]>(`/tasks/${taskId}/comments`);
  const submit = useAction();
  const [body, setBody] = useState("");

  const addComment = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    submit.run(async () => {
      await post(`/tasks/${taskId}/comments`, { body: trimmed });
      setBody("");
      await comments.reload();
    });
  };

  const deleteComment = (comment: TaskComment) =>
    submit.run(async () => {
      await del(`/tasks/${taskId}/comments/${comment.id}`);
      toast.success("Comment removed");
      await comments.reload();
    });

  return (
    <section className="flex flex-col rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-[15px] font-semibold text-ink">Comments</h2>
        <p className="mt-0.5 text-[13px] text-muted">Discuss progress with your team.</p>
      </div>

      {comments.isLoading ? (
        <LoadingBlock label="Loading comments…" />
      ) : !comments.data?.length ? (
        <p className="px-5 py-6 text-center text-[13px] text-muted">No comments yet.</p>
      ) : (
        <ul className="max-h-80 space-y-4 overflow-y-auto px-5 py-4">
          {comments.data.map((comment) => (
            <li key={comment.id} className="group flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[12.5px] font-semibold text-ink">
                  {comment.author_name ?? "Unknown"}{" "}
                  <span className="ml-1 font-normal text-muted">{formatDateTime(comment.created_at)}</span>
                </p>
                <p className="mt-0.5 text-[13.5px] leading-snug text-ink-soft whitespace-pre-wrap">{comment.body}</p>
              </div>
              <button
                type="button"
                onClick={() => deleteComment(comment)}
                aria-label="Delete comment"
                className="shrink-0 rounded-md p-1 text-muted opacity-0 transition group-hover:opacity-100 hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto flex items-end gap-2 border-t border-line p-4">
        <Textarea
          rows={2}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Add a comment…"
          className="flex-1"
        />
        <Button icon={<Send className="size-4" />} loading={submit.pending} onClick={addComment} disabled={!body.trim()}>
          Send
        </Button>
      </div>
    </section>
  );
}
