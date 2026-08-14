"use client";

import {
  Building2,
  ChevronRight,
  Info,
  ListChecks,
  Mail,
  Phone,
  Plus,
  Sparkle,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useToast } from "@/components/toast";
import { Button, Modal, Select, Textarea } from "@/components/ui";
import { ApiError, patch } from "@/lib/api";
import { cn } from "@/lib/cn";
import { daysFromToday, TODAY } from "@/lib/firm-demo";
import type { ClientRow, Task, TeamNote, TeamRow, TeamStatus } from "@/lib/firm-demo";
import { dueLabel, formatDate, initials, pluralise, titleCase } from "@/lib/format";
import type { TaskStatus } from "@/lib/types";

import { AccountantModal, type AccountantFormValues } from "../accountant-modal";

const STATUS_TONE: Record<TeamStatus, string> = {
  active: "bg-success-soft text-success",
  away: "bg-warn-soft text-warn",
  inactive: "bg-surface-2 text-muted",
};

const PRIORITY_TONE: Record<string, string> = {
  urgent: "bg-danger-soft text-danger",
  high: "bg-warn-soft text-warn",
  medium: "bg-surface-2 text-ink-soft",
  low: "bg-surface-2 text-muted",
};

const TASK_STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "review", label: "Review" },
  { value: "blocked", label: "Blocked" },
  { value: "complete", label: "Complete" },
];

const TABS = [
  { id: "overview", label: "Overview", icon: Info },
  { id: "clients", label: "Clients", icon: Building2 },
  { id: "tasks", label: "Tasks", icon: ListChecks },
  { id: "notes", label: "Notes", icon: Sparkle },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface NoteRow {
  id: string;
  body: string;
  when: string;
}

let localSeq = 0;
function nextId(prefix: string) {
  localSeq += 1;
  return `${prefix}-${localSeq}`;
}

export function TeamMemberClient({
  member,
  allClients,
  allTasks,
  initialNotes,
  isLive = false,
}: {
  member: TeamRow;
  allClients: ClientRow[];
  allTasks: Task[];
  initialNotes: TeamNote[];
  /** When true, edits and assignments are persisted through the API. */
  isLive?: boolean;
}) {
  const toast = useToast();

  const [profile, setProfile] = useState(member);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<TabId>("overview");

  const [assignedClientIds, setAssignedClientIds] = useState(
    () => new Set(allClients.filter((client) => client.owner_id === member.id).map((client) => client.id)),
  );
  const [assignClientOpen, setAssignClientOpen] = useState(false);
  const [pickedClientId, setPickedClientId] = useState("");

  const [assignedTaskIds, setAssignedTaskIds] = useState(
    () =>
      new Set(
        allTasks
          .filter((task) => task.assignee_id === member.id && task.status !== "complete")
          .map((task) => task.id),
      ),
  );
  const [taskStatus, setTaskStatus] = useState<Record<string, TaskStatus>>({});
  const [assignTaskOpen, setAssignTaskOpen] = useState(false);
  const [pickedTaskId, setPickedTaskId] = useState("");

  const [notes, setNotes] = useState<NoteRow[]>(
    initialNotes.map((note) => ({ id: note.id, body: note.body, when: note.when })),
  );
  const [noteDraft, setNoteDraft] = useState("");

  const assignedClients = useMemo(
    () =>
      allClients
        .filter((client) => assignedClientIds.has(client.id))
        .sort((a, b) => a.business_name.localeCompare(b.business_name)),
    [allClients, assignedClientIds],
  );
  const availableClients = useMemo(
    () => allClients.filter((client) => !assignedClientIds.has(client.id)),
    [allClients, assignedClientIds],
  );

  const assignedTasks = useMemo(
    () => allTasks.filter((task) => assignedTaskIds.has(task.id)),
    [allTasks, assignedTaskIds],
  );
  const availableTasks = useMemo(
    () => allTasks.filter((task) => !assignedTaskIds.has(task.id) && task.status !== "complete"),
    [allTasks, assignedTaskIds],
  );

  /**
   * Assignment is one field on the target row — `clients.owner_id` or
   * `tasks.assignee_id` — so every action here is a PATCH on the client/task,
   * not on the profile. Optimistic: the set is updated first and rolled back if
   * the request fails, because these are cheap, reversible reassignments made in
   * batches while looking at someone's workload.
   */
  const persist = async (path: string, body: unknown, undo: () => void, label: string) => {
    if (!isLive) return;
    try {
      await patch(path, body);
    } catch (error) {
      undo();
      toast.error(
        `Could not ${label}`,
        error instanceof ApiError ? error.message : "Please try again.",
      );
    }
  };

  const unassignClient = (client: ClientRow) => {
    setAssignedClientIds((current) => {
      const next = new Set(current);
      next.delete(client.id);
      return next;
    });
    toast.success(`${client.business_name} unassigned`, `No longer handled by ${profile.full_name}.`);
    void persist(
      `/clients/${client.id}`,
      { owner_id: null },
      () => setAssignedClientIds((current) => new Set(current).add(client.id)),
      "unassign that client",
    );
  };

  const assignClient = () => {
    const client = allClients.find((c) => c.id === pickedClientId);
    if (!client) return;
    setAssignedClientIds((current) => new Set(current).add(client.id));
    toast.success(`${client.business_name} assigned`, `Now handled by ${profile.full_name}.`);
    setAssignClientOpen(false);
    setPickedClientId("");
    void persist(
      `/clients/${client.id}`,
      { owner_id: member.id },
      () =>
        setAssignedClientIds((current) => {
          const next = new Set(current);
          next.delete(client.id);
          return next;
        }),
      "assign that client",
    );
  };

  const removeTask = (task: Task) => {
    setAssignedTaskIds((current) => {
      const next = new Set(current);
      next.delete(task.id);
      return next;
    });
    toast.success(`"${task.title}" unassigned`, "Removed from this member's task list.");
    void persist(
      `/tasks/${task.id}`,
      { assignee_id: null },
      () => setAssignedTaskIds((current) => new Set(current).add(task.id)),
      "unassign that task",
    );
  };

  const assignTask = () => {
    const task = allTasks.find((t) => t.id === pickedTaskId);
    if (!task) return;
    setAssignedTaskIds((current) => new Set(current).add(task.id));
    toast.success(`"${task.title}" assigned`, `Now on ${profile.full_name}'s task list.`);
    setAssignTaskOpen(false);
    setPickedTaskId("");
    void persist(
      `/tasks/${task.id}`,
      { assignee_id: member.id },
      () =>
        setAssignedTaskIds((current) => {
          const next = new Set(current);
          next.delete(task.id);
          return next;
        }),
      "assign that task",
    );
  };

  const changeTaskStatus = (task: Task, status: TaskStatus) => {
    const previous = taskStatus[task.id] ?? task.status;
    setTaskStatus((current) => ({ ...current, [task.id]: status }));
    toast.success(`"${task.title}" updated`, `Status set to ${titleCase(status)}.`);
    void persist(
      `/tasks/${task.id}`,
      { status },
      () => setTaskStatus((current) => ({ ...current, [task.id]: previous })),
      "update that task",
    );
  };

  const addNote = () => {
    const trimmed = noteDraft.trim();
    if (!trimmed) return;
    setNotes((current) => [{ id: nextId("note"), body: trimmed, when: formatDate(TODAY, "long") }, ...current]);
    setNoteDraft("");
  };

  const removeNote = (id: string) => {
    setNotes((current) => current.filter((note) => note.id !== id));
  };

  const submitEdit = async (values: AccountantFormValues) => {
    if (isLive) {
      setSaving(true);
      try {
        await patch(`/team/${member.id}`, {
          full_name: values.fullName,
          title: values.title,
          phone: values.phone || null,
          role: values.role,
          is_active: values.status !== "inactive",
        });
      } catch (error) {
        toast.error(
          "Could not save",
          error instanceof ApiError ? error.message : "Please try again.",
        );
        setSaving(false);
        return;
      } finally {
        setSaving(false);
      }
    }

    setProfile((current) => ({
      ...current,
      full_name: values.fullName,
      title: values.title,
      status: values.status,
      is_active: values.status !== "inactive",
      email: values.email || current.email,
      phone: values.phone || null,
      role: values.role,
    }));
    toast.success(`${values.fullName} updated`, "Changes saved to their roster entry.");
    setEditOpen(false);
  };

  return (
    <>
      <Link
        href="/team"
        className="text-[12.5px] font-medium text-brand transition hover:underline"
      >
        ← Back to accountants
      </Link>

      <div className="mt-3 mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-[15px] font-bold text-brand">
            {initials(profile.full_name)}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-[1.5rem] font-bold tracking-tight text-ink">
                {profile.full_name}
              </h1>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
                  STATUS_TONE[profile.status],
                )}
              >
                {profile.status}
              </span>
            </div>
            <p className="mt-0.5 text-[13.5px] text-muted">
              {pluralise(assignedClients.length, "client")} · {pluralise(assignedTasks.length, "open task")}
            </p>
          </div>
        </div>
        <Button icon={<UserPlus className="size-4" />} onClick={() => setEditOpen(true)}>
          Edit member
        </Button>
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-card)]">
        {TABS.map((entry) => {
          const Icon = entry.icon;
          const count =
            entry.id === "clients"
              ? assignedClients.length
              : entry.id === "tasks"
                ? assignedTasks.length
                : entry.id === "notes"
                  ? notes.length
                  : undefined;
          const active = tab === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13.5px] font-medium transition",
                active ? "bg-brand text-white shadow-sm" : "text-ink-soft hover:bg-surface-2 hover:text-ink",
              )}
            >
              <Icon className="size-4" />
              {entry.label}
              {count !== undefined ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums",
                    active ? "bg-white/20 text-white" : "bg-surface-2 text-muted",
                  )}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        {tab === "overview" ? (
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
              <div className="border-b border-line px-5 py-4">
                <h2 className="text-[15px] font-semibold text-ink">Contact & role</h2>
                <p className="mt-0.5 text-[13px] text-muted">
                  How to reach this team member and what they do.
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4 p-5">
                <Meta icon={<Mail className="size-3.5" />} label="Email" value={profile.email} />
                <Meta icon={<Phone className="size-3.5" />} label="Phone" value={profile.phone ?? "—"} />
                <Meta label="Role" value={profile.title || "—"} />
                <Meta label="On team since" value={formatDate(profile.joined, "long")} />
              </dl>
            </section>

            <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
              <div className="border-b border-line px-5 py-4">
                <h2 className="text-[15px] font-semibold text-ink">Workload</h2>
              </div>
              <div className="grid grid-cols-2 gap-4 p-5">
                <div>
                  <p className="text-[11px] tracking-wide text-muted uppercase">Clients handled</p>
                  <p className="mt-1 font-display text-2xl font-bold text-ink">
                    {assignedClients.length}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] tracking-wide text-muted uppercase">Open tasks</p>
                  <p className="mt-1 font-display text-2xl font-bold text-ink">
                    {assignedTasks.length}
                  </p>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {tab === "clients" ? (
          <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h2 className="text-[15px] font-semibold text-ink">Clients handled</h2>
                <p className="mt-0.5 text-[13px] text-muted">
                  Clients with {profile.full_name} as their assigned accountant.
                </p>
              </div>
              <Button
                size="sm"
                icon={<Plus className="size-3.5" />}
                disabled={availableClients.length === 0}
                onClick={() => setAssignClientOpen(true)}
              >
                Assign client
              </Button>
            </div>
            {assignedClients.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] text-muted">
                No clients assigned yet.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {assignedClients.map((client) => (
                  <li key={client.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <span className="min-w-0 truncate text-[13.5px] font-medium text-ink">
                      {client.business_name}
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <button
                        type="button"
                        onClick={() => unassignClient(client)}
                        className="inline-flex items-center gap-1 text-[12.5px] font-medium text-muted transition hover:text-danger"
                      >
                        <X className="size-3.5" />
                        Unassign
                      </button>
                      <Link
                        href={`/clients/${client.id}`}
                        className="grid size-7 place-items-center rounded-md text-muted transition hover:bg-surface-2 hover:text-ink"
                        aria-label={`Open ${client.business_name}`}
                      >
                        <ChevronRight className="size-4" />
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {tab === "tasks" ? (
          <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h2 className="text-[15px] font-semibold text-ink">Assigned tasks</h2>
                <p className="mt-0.5 text-[13px] text-muted">
                  {pluralise(assignedTasks.length, "task")} assigned to this member.
                </p>
              </div>
              <Button
                size="sm"
                icon={<Plus className="size-3.5" />}
                disabled={availableTasks.length === 0}
                onClick={() => setAssignTaskOpen(true)}
              >
                Assign task
              </Button>
            </div>
            {assignedTasks.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] text-muted">No tasks assigned.</p>
            ) : (
              <ul className="divide-y divide-line">
                {assignedTasks.map((task) => {
                  const days = task.due_date ? daysFromToday(task.due_date) : null;
                  const currentStatus = taskStatus[task.id] ?? task.status;
                  return (
                    <li
                      key={task.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
                    >
                      <div className="min-w-0 flex-1 basis-52">
                        <p className="truncate text-[13.5px] font-medium text-ink">{task.title}</p>
                        <p className="text-[12px] text-muted">{task.client_name}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase",
                            PRIORITY_TONE[task.priority],
                          )}
                        >
                          {task.priority}
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                            days === null
                              ? "bg-surface-2 text-muted"
                              : days < 0
                                ? "bg-danger-soft text-danger"
                                : days <= 3
                                  ? "bg-warn-soft text-warn"
                                  : "bg-success-soft text-success",
                          )}
                        >
                          {days === null ? "No due date" : dueLabel(days)}
                        </span>
                        <Select
                          value={currentStatus}
                          onValueChange={(next) => changeTaskStatus(task, next as TaskStatus)}
                          options={TASK_STATUSES}
                          size="sm"
                          variant="pill"
                          className="w-36"
                          aria-label={`Status for ${task.title}`}
                        />
                        <button
                          type="button"
                          onClick={() => removeTask(task)}
                          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-danger-soft hover:text-danger"
                          aria-label={`Unassign ${task.title}`}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : null}

        {tab === "notes" ? (
          <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-[15px] font-semibold text-ink">Notes</h2>
              <p className="mt-0.5 text-[13px] text-muted">
                Internal notes about this team member — visible to admins only.
              </p>
            </div>
            <div className="p-5">
              <Textarea
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                placeholder="Add a note — e.g. capacity, specialisations, time off…"
                rows={2}
              />
              <div className="mt-2.5 flex justify-end">
                <Button
                  size="sm"
                  icon={<Plus className="size-3.5" />}
                  disabled={!noteDraft.trim()}
                  onClick={addNote}
                >
                  Add note
                </Button>
              </div>
            </div>
            {notes.length === 0 ? (
              <p className="px-5 pb-8 text-center text-[13px] text-muted">No notes yet.</p>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {notes.map((note) => (
                  <li key={note.id} className="flex items-start justify-between gap-3 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="text-[13.5px] leading-relaxed text-ink-soft">{note.body}</p>
                      <p className="mt-1 text-[11.5px] text-muted">{note.when}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeNote(note.id)}
                      className="grid size-7 shrink-0 place-items-center rounded-md text-muted transition hover:bg-danger-soft hover:text-danger"
                      aria-label="Remove note"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </div>

      <AccountantModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        pending={saving}
        isLive={isLive}
        initial={{
          fullName: profile.full_name,
          title: profile.title,
          status: profile.status,
          email: profile.email,
          phone: profile.phone ?? "",
          role: profile.role,
          sendCredentials: false,
        }}
        onSubmit={(values) => void submitEdit(values)}
      />

      <Modal
        open={assignClientOpen}
        onClose={() => setAssignClientOpen(false)}
        title="Assign client"
        description={`Pick a client to hand to ${profile.full_name}.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssignClientOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!pickedClientId} onClick={assignClient}>
              Assign
            </Button>
          </>
        }
      >
        <Select
          value={pickedClientId}
          onValueChange={setPickedClientId}
          placeholder="Select a client…"
          searchPlaceholder="Search clients…"
          aria-label="Client to assign"
          options={availableClients.map((client) => ({
            value: client.id,
            label: client.business_name,
          }))}
        />
      </Modal>

      <Modal
        open={assignTaskOpen}
        onClose={() => setAssignTaskOpen(false)}
        title="Assign task"
        description={`Pick a task to hand to ${profile.full_name}.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssignTaskOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!pickedTaskId} onClick={assignTask}>
              Assign
            </Button>
          </>
        }
      >
        <Select
          value={pickedTaskId}
          onValueChange={setPickedTaskId}
          placeholder="Select a task…"
          searchPlaceholder="Search tasks…"
          aria-label="Task to assign"
          options={availableTasks.map((task) => ({
            value: task.id,
            label: task.title,
            description: task.client_name,
          }))}
        />
      </Modal>
    </>
  );
}

function Meta({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[11.5px] tracking-wide text-muted uppercase">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 text-[13.5px] font-medium text-ink">{value}</dd>
    </div>
  );
}
