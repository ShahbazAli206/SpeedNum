"use client";

import { ListChecks } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useToast } from "@/components/toast";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { post } from "@/lib/api";
import type { ClientRow, TeamRow } from "@/lib/firm-demo";
import type { Task, TaskPriority, TaskStatus, TaskType } from "@/lib/types";

/** Pull a human-readable reason out of an ApiError without leaking `[object]`. */
function message(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

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

export function NewTaskClient({ clients, team }: { clients: ClientRow[]; team: TeamRow[] }) {
  const toast = useToast();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("internal");
  const [clientId, setClientId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title is required.");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await post<Task>("/tasks", {
        title: trimmedTitle,
        description: description.trim() || undefined,
        task_type: taskType,
        client_id: taskType === "client" && clientId ? clientId : undefined,
        assignee_id: assigneeId || undefined,
        priority,
        status,
        due_date: dueDate || undefined,
      });
      toast.success(`"${trimmedTitle}" created`, "Added to Task Master.");
      router.push("/workflows");
    } catch (err) {
      toast.error("Could not create task", message(err, "Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Link href="/workflows" className="text-[12.5px] font-medium text-brand transition hover:underline">
        ← Back to Task Master
      </Link>

      <div className="mt-3 mb-6 flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
          <ListChecks className="size-5" />
        </span>
        <div>
          <h1 className="font-display text-[1.6rem] font-bold tracking-tight text-ink">New task</h1>
          <p className="mt-0.5 text-[14px] text-muted">Create an internal, client or other task.</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-semibold text-ink">Task details</h2>
            <p className="mt-0.5 text-[13px] text-muted">Assign work to a team member with a deadline.</p>
          </div>

          <div className="space-y-4 p-5">
            <Field label="Title" required>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. File GST/HST return"
                autoFocus
              />
            </Field>

            <Field label="Description">
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                placeholder="Add any context your team needs…"
              />
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
                <Field
                  label="Client"
                  hint="Optional — leave unselected for client work not tied to one record."
                  className="sm:col-span-2"
                >
                  <Select
                    value={clientId}
                    onValueChange={setClientId}
                    placeholder="No specific client"
                    searchPlaceholder="Search clients…"
                    options={[
                      { value: "", label: "No specific client" },
                      ...clients.map((client) => ({
                        value: client.id,
                        label: client.business_name,
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
              <Field label="Status">
                <Select
                  value={status}
                  onValueChange={(next) => setStatus(next as TaskStatus)}
                  options={STATUS_OPTIONS}
                />
              </Field>
              <Field label="Due date">
                <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              </Field>
            </div>
          </div>
        </section>

        {error ? (
          <p role="alert" className="text-[13px] font-medium text-danger">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2 pb-2">
          <Button type="button" variant="secondary" disabled={submitting} onClick={() => router.push("/workflows")}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Create task
          </Button>
        </div>
      </form>
    </>
  );
}
