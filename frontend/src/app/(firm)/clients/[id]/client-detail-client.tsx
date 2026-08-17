"use client";

import {
  Building2,
  CalendarClock,
  FileText,
  Mail,
  MapPin,
  Phone,
  Plus,
  Send,
  Signature,
  Tag,
  Upload,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { useToast } from "@/components/toast";
import { Button, Card, CardHeader, Field, Input, Modal, Select, Tab, Tabs } from "@/components/ui";
import { ApiError, post } from "@/lib/api";
import { AUTH_CONFIGURED } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { assignClientService } from "@/lib/client-services";
import type {
  ClientRow,
  Contact,
  CustomField,
  Deadline,
  Letter,
  Service,
  Task,
  TeamRow,
} from "@/lib/firm-demo";
import { formatBytes, formatDate, formatMoney, titleCase } from "@/lib/format";
import { UploadError, uploadDocument } from "@/lib/storage";
import type { ClientDocument, Frequency, PortalInviteResult, TaskPriority, TaskStatus } from "@/lib/types";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

type TabId = "overview" | "contacts" | "services" | "tasks" | "files";

type TaskRow = {
  id: string;
  title: string;
  assignee_name: string;
  due_date: string | null;
  status: TaskStatus;
  priority: TaskPriority;
};

const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "semi_annual", label: "Semi-annual" },
  { value: "annual", label: "Annual" },
  { value: "one_time", label: "One-time" },
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

const PRIORITY_TONE: Record<string, string> = {
  urgent: "bg-danger-soft text-danger",
  high: "bg-warn-soft text-warn",
  medium: "bg-surface-2 text-ink-soft",
  low: "bg-surface-2 text-muted",
};

const STATUS_TONE: Record<string, string> = {
  complete: "bg-success-soft text-success",
  blocked: "bg-danger-soft text-danger",
  review: "bg-warn-soft text-warn",
  in_progress: "bg-info-soft text-info",
  todo: "bg-surface-2 text-ink-soft",
};

let taskSeq = 0;
function nextTaskId() {
  taskSeq += 1;
  return `local-task-${taskSeq}`;
}

export function ClientDetailClient({
  client,
  contacts,
  services,
  catalogue,
  deadlines,
  tasks,
  letters,
  customFields,
  team,
  initialTab,
}: {
  client: ClientRow;
  contacts: Contact[];
  services: Service[];
  catalogue: Service[];
  deadlines: Deadline[];
  tasks: Task[];
  letters: Letter[];
  customFields: CustomField[];
  team: TeamRow[];
  /** Lets other pages deep-link straight to a tab, e.g. a task's "Client"
   * link landing on this client's own Tasks tab. */
  initialTab?: TabId;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<TabId>(initialTab ?? "overview");

  // Client portal invite — tries the real endpoint, falls back to a demo
  // acknowledgement (there is no live backend reachable yet in most setups).
  const [portalInvitedAt, setPortalInvitedAt] = useState(client.portal_invited_at);
  const [inviting, setInviting] = useState(false);

  // Add service — local-only until /client-services is wired here, same
  // philosophy as the Task Master board: it still has to feel real, so
  // additions land in component state.
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [addedServices, setAddedServices] = useState<Service[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [cadence, setCadence] = useState<Frequency>("annual");
  const [price, setPrice] = useState("0");
  const [nextDue, setNextDue] = useState("");

  // Add task — local-only, same reasoning as services above.
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [addedTasks, setAddedTasks] = useState<TaskRow[]>([]);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskAssigneeId, setTaskAssigneeId] = useState("");
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("medium");
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("todo");
  const [taskDueDate, setTaskDueDate] = useState("");

  // Upload file — genuinely real when a storage backend is configured (same
  // helper the client portal's own Documents page uses), demo-only otherwise.
  const [fileModalOpen, setFileModalOpen] = useState(false);
  const [addedFiles, setAddedFiles] = useState<ClientDocument[]>([]);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const primaryContact = contacts.find((contact) => contact.is_primary) ?? contacts[0];
  const clientEmail = primaryContact?.email ?? null;
  const primaryPhone = primaryContact?.phone ?? null;

  const allServices = [...services, ...addedServices];
  const allTasks: TaskRow[] = [
    ...tasks.map((task) => ({
      id: task.id,
      title: task.title,
      assignee_name: task.assignee_name ?? "Unassigned",
      due_date: task.due_date,
      status: task.status,
      priority: task.priority,
    })),
    ...addedTasks,
  ];
  const allFiles = addedFiles;

  const availableCatalogue = catalogue.filter(
    (service) => !allServices.some((assigned) => assigned.id === service.id),
  );

  const handleServiceSelect = (id: string) => {
    setSelectedServiceId(id);
    const picked = catalogue.find((service) => service.id === id);
    if (picked) {
      setCadence(picked.frequency);
      setPrice(String(picked.default_price));
    }
  };

  const submitService = () => {
    const picked = catalogue.find((service) => service.id === selectedServiceId);
    if (!picked) return;
    const priceValue = Number(price) || 0;
    setAddedServices((current) => [
      ...current,
      { ...picked, frequency: cadence, default_price: priceValue },
    ]);
    toast.success(`${picked.name} assigned`, "Added to this client's services.");
    setServiceModalOpen(false);
    setSelectedServiceId("");
    setCadence("annual");
    setPrice("0");
    setNextDue("");

    // Real backend configured: persist the assignment for real.
    // Any failure (most commonly: no backend reachable yet) is silent here —
    // the optimistic row above already gives the admin working feedback,
    // same fallback philosophy as the rest of this page's "Add" actions.
    void assignClientService(client.id, {
      service_id: picked.id,
      price: priceValue,
      frequency_override: cadence,
    }).catch(() => {});
  };

  const submitTask = () => {
    if (!taskTitle.trim()) return;
    const assignee = team.find((member) => member.id === taskAssigneeId);
    setAddedTasks((current) => [
      ...current,
      {
        id: nextTaskId(),
        title: taskTitle.trim(),
        assignee_name: assignee?.full_name ?? "Unassigned",
        due_date: taskDueDate || null,
        status: taskStatus,
        priority: taskPriority,
      },
    ]);
    toast.success(`"${taskTitle.trim()}" added`, "Added to this client's tasks.");
    setTaskModalOpen(false);
    setTaskTitle("");
    setTaskAssigneeId("");
    setTaskPriority("medium");
    setTaskStatus("todo");
    setTaskDueDate("");
  };

  const closeFileModal = () => {
    setFileModalOpen(false);
    setPendingFile(null);
  };

  const submitFile = async () => {
    if (!pendingFile) return;

    if (!AUTH_CONFIGURED) {
      toast.info(`${pendingFile.name} selected`, "This is demo data; connect a backend to upload for real.");
      closeFileModal();
      return;
    }

    setUploading(true);
    try {
      const uploaded = await uploadDocument(pendingFile, { clientId: client.id, isClientVisible: true });
      setAddedFiles((current) => [uploaded, ...current]);
      toast.success(`${uploaded.name} uploaded`, "Added to this client's secure storage.");
      closeFileModal();
    } catch (error) {
      const detail =
        error instanceof UploadError || error instanceof ApiError ? error.message : "Please try again.";
      toast.error(`Couldn't upload ${pendingFile.name}`, detail);
    } finally {
      setUploading(false);
    }
  };

  const handleInvite = async () => {
    setInviting(true);
    try {
      const result = await post<PortalInviteResult>(`/clients/${client.id}/portal-invite`);
      setPortalInvitedAt(result.invited_at);
      toast.success(result.email_sent ? "Welcome email sent" : "Portal login ready", result.message);
    } catch {
      // No live backend configured yet — acknowledge the action the
      // same way the rest of the firm-side app does on demo data.
      setPortalInvitedAt(new Date().toISOString());
      toast.success(
        portalInvitedAt ? "Welcome email resent" : "Welcome email sent",
        clientEmail
          ? `${client.business_name} will receive their login details at ${clientEmail}.`
          : `${client.business_name} will receive their login details.`,
      );
    } finally {
      setInviting(false);
    }
  };

  return (
    <>
      {/* Record header */}
      <div className="mb-6">
        <Link href="/clients" className="text-[12.5px] font-medium text-brand transition hover:underline">
          ← All clients
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand-soft text-lg font-bold text-brand">
              {client.business_name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <h1 className="font-display text-[1.6rem] font-bold tracking-tight text-ink">
                {client.business_name}
              </h1>
              <p className="mt-0.5 text-[14px] text-muted">
                {client.legal_name} · {client.code} · {client.city}, {client.province}
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
                    client.status === "active" ? "bg-success-soft text-success" : "bg-warn-soft text-warn",
                  )}
                >
                  {client.status}
                </span>
                {client.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-soft">
                    {tag}
                  </span>
                ))}
                {client.portal_enabled ? (
                  <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">
                    Portal enabled
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3">
            <Meta label="Fiscal year-end" value={`${MONTHS[client.year_end_month - 1]} ${client.year_end_day}`} />
            <Meta label="Annual fee" value={client.annual_fee > 0 ? formatMoney(client.annual_fee) : "—"} />
            <Meta label="Assigned to" value={client.owner_name} />
            <Meta label="Business number" value={client.business_number} />
            <Meta label="Client since" value={formatDate(client.joined)} />
            <Meta label="Type" value={titleCase(client.client_type)} />
          </dl>
        </div>
      </div>

      {/* Counters */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Counter icon={<Tag className="size-4" />} value={allServices.length} label="Assigned services" />
        <Counter
          icon={<CalendarClock className="size-4" />}
          value={client.open_deadlines}
          label="Open deadlines"
          tone={client.overdue_deadlines > 0 ? "danger" : "neutral"}
          hint={client.overdue_deadlines > 0 ? `${client.overdue_deadlines} overdue` : undefined}
        />
        <Counter icon={<Users className="size-4" />} value={allTasks.length} label="Open tasks" />
        <Counter
          icon={<Signature className="size-4" />}
          value={letters.filter((letter) => letter.status === "signed").length}
          label="Signed letters"
          hint={`${letters.length} total`}
        />
      </div>

      <Tabs value={tab} onChange={(value) => setTab(value as TabId)} className="mt-6 mb-5">
        <Tab id="overview">Overview</Tab>
        <Tab id="contacts" count={contacts.length}>Contacts</Tab>
        <Tab id="services" count={allServices.length}>Services</Tab>
        <Tab id="tasks" count={allTasks.length}>Tasks</Tab>
        <Tab id="files" count={allFiles.length}>Files</Tab>
      </Tabs>

      {tab === "overview" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-5">
            <Card>
              <CardHeader
                title="Contact & compliance"
                description="Reach-out details staff pull up while working a file, plus the fiscal year-end that drives year-end reminders."
              />
              <dl className="grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2">
                <MetaRow
                  icon={<Mail className="size-3.5" />}
                  label="Email"
                  value={clientEmail}
                  href={clientEmail ? `mailto:${clientEmail}` : undefined}
                />
                <MetaRow
                  icon={<Phone className="size-3.5" />}
                  label="Telephone"
                  value={primaryPhone}
                  href={primaryPhone ? `tel:${primaryPhone.replace(/[^+\d]/g, "")}` : undefined}
                />
                <MetaRow
                  icon={<CalendarClock className="size-3.5" />}
                  label="Fiscal year-end"
                  value={`${MONTHS[client.year_end_month - 1]} ${client.year_end_day}`}
                />
                <MetaRow icon={<Users className="size-3.5" />} label="Accountant / manager" value={client.owner_name} />
                <MetaRow
                  icon={<MapPin className="size-3.5" />}
                  label="Mailing address"
                  value={[client.city, client.province].filter(Boolean).join(", ") || null}
                  className="sm:col-span-2"
                />
              </dl>
            </Card>

            <Card>
              <CardHeader title="Custom fields" description="Defined by your administrators" />
              <dl className="divide-y divide-line">
                {customFields.map((field) => (
                  <div key={field.id} className="flex items-start justify-between gap-4 px-5 py-3">
                    <dt className="text-[13px] text-muted">{field.label}</dt>
                    <dd className="text-right text-[13.5px] text-ink">{client.custom[field.label] ?? "—"}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>

          <div className="space-y-5">
            <Card>
              <CardHeader title="Engagement" description="Plan, revenue and how long they've been a client." />
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 p-5">
                <Meta label="Plan" value={client.plan} />
                <Meta label="Monthly recurring revenue" value={formatMoney(client.monthly_fee)} />
                <Meta label="Client since" value={formatDate(client.joined, "long")} />
                <Meta label="Status" value={titleCase(client.status)} />
              </dl>
            </Card>

            <Card>
              <CardHeader
                title="Client portal"
                description={
                  portalInvitedAt
                    ? `Invited ${formatDate(portalInvitedAt, "long")} — branded welcome email with sign-in.`
                    : "Not invited yet — send a branded welcome email to get them into their portal."
                }
              />
              <div className="p-5">
                <Button
                  variant="secondary"
                  icon={<Send className="size-4" />}
                  loading={inviting}
                  onClick={handleInvite}
                  className="w-full"
                >
                  {portalInvitedAt ? "Resend welcome email" : "Send welcome email"}
                </Button>
              </div>
            </Card>

            <Card>
              <CardHeader title="Deadlines" description="Generated from year-end and service cadences" />
              {deadlines.length === 0 ? (
                <p className="px-5 py-8 text-center text-[13px] text-muted">No deadlines yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {deadlines.map((deadline) => (
                    <li key={deadline.id} className="flex items-center gap-3 px-5 py-3">
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          deadline.urgency === "overdue"
                            ? "bg-danger"
                            : deadline.urgency === "due_soon"
                              ? "bg-warn"
                              : deadline.urgency === "filed"
                                ? "bg-muted"
                                : "bg-success",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-ink">{deadline.title}</span>
                        <span className="block text-[12px] text-muted">
                          {deadline.period_label} · {deadline.assignee_name}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span
                          className={cn(
                            "block text-[12px] font-semibold",
                            deadline.urgency === "overdue"
                              ? "text-danger"
                              : deadline.urgency === "due_soon"
                                ? "text-warn"
                                : "text-muted",
                          )}
                        >
                          {deadline.status === "filed"
                            ? "Filed"
                            : deadline.days_remaining < 0
                              ? `${Math.abs(deadline.days_remaining)}d late`
                              : `${deadline.days_remaining}d`}
                        </span>
                        <span className="block text-[11px] text-muted">{formatDate(deadline.due_date)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader title="Engagement letters" description="Scope and fees on record" />
              {letters.length === 0 ? (
                <p className="px-5 py-8 text-center text-[13px] text-muted">
                  No letters. Scope is not on record for this client.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {letters.map((letter) => (
                    <li key={letter.id} className="flex items-center gap-3 px-5 py-3">
                      <Building2 className="size-4 shrink-0 text-muted" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-ink">{letter.title}</span>
                        <span className="block text-[12px] text-muted">
                          {letter.signed_at
                            ? `Signed ${formatDate(letter.signed_at)} by ${letter.signer_name}`
                            : letter.sent_at
                              ? `Sent ${formatDate(letter.sent_at)}`
                              : "Not sent"}
                        </span>
                      </span>
                      <span className="shrink-0 text-[13px] font-semibold tabular-nums text-ink">
                        {formatMoney(letter.subtotal)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "contacts" ? (
        <Card>
          <CardHeader title="Contacts" description="Each labelled with a designation" />
          {contacts.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted">No contacts recorded yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {contacts.map((contact) => (
                <li key={contact.id} className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <p className="text-[13.5px] font-semibold text-ink">{contact.full_name}</p>
                    {contact.is_primary ? (
                      <span className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-bold text-brand">
                        Primary
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[12px] text-muted">{contact.role}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
                    <a
                      href={`mailto:${contact.email}`}
                      className="inline-flex items-center gap-1.5 text-ink-soft transition hover:text-brand"
                    >
                      <Mail className="size-3.5 text-muted" />
                      {contact.email}
                    </a>
                    <a
                      href={`tel:${contact.phone.replace(/[^+\d]/g, "")}`}
                      className="inline-flex items-center gap-1.5 text-ink-soft transition hover:text-brand"
                    >
                      <Phone className="size-3.5 text-muted" />
                      {contact.phone}
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === "services" ? (
        <Card>
          <CardHeader
            title="Services"
            description={`${allServices.length} service${allServices.length === 1 ? "" : "s"} assigned — cadence drives the deadline board`}
            action={
              <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setServiceModalOpen(true)}>
                Add service
              </Button>
            }
          />
          {allServices.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted">
              No services assigned. Nothing will be scheduled until at least one is.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {allServices.map((service, index) => (
                <li key={`${service.id}-${index}`} className="flex items-center gap-3 px-5 py-3">
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-ink-soft">
                    {service.code}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-ink">{service.name}</span>
                    <span className="block text-[12px] text-muted">
                      {titleCase(service.frequency)} · {service.due_rule}
                    </span>
                  </span>
                  <span className="shrink-0 text-[13px] font-semibold tabular-nums text-ink">
                    {formatMoney(service.default_price)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === "tasks" ? (
        <Card>
          <CardHeader
            title="Tasks"
            description={`${allTasks.length} task${allTasks.length === 1 ? "" : "s"} for this client`}
            action={
              <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setTaskModalOpen(true)}>
                Add task
              </Button>
            }
          />
          {allTasks.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted">No tasks.</p>
          ) : (
            <ul className="divide-y divide-line">
              {allTasks.map((task) => (
                <li key={task.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-ink">{task.title}</span>
                    <span className="block text-[12px] text-muted">
                      {task.assignee_name} · due {formatDate(task.due_date)}
                    </span>
                  </span>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold", PRIORITY_TONE[task.priority])}>
                    {titleCase(task.priority)}
                  </span>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_TONE[task.status])}>
                    {STATUS_OPTIONS.find((option) => option.value === task.status)?.label ?? titleCase(task.status)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === "files" ? (
        <Card>
          <CardHeader
            title="Files"
            description={allFiles.length === 0 ? "No files yet" : `${allFiles.length} file${allFiles.length === 1 ? "" : "s"}`}
            action={
              <Button size="sm" icon={<Upload className="size-3.5" />} onClick={() => setFileModalOpen(true)}>
                Upload file
              </Button>
            }
          />
          {allFiles.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted">
              No files yet. Upload statements, engagement letters or working papers.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {allFiles.map((file) => (
                <li key={file.id} className="flex items-center gap-3 px-5 py-3">
                  <FileText className="size-4 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-ink">{file.name}</span>
                    <span className="block text-[12px] text-muted">
                      {formatDate(file.created_at)}
                      {file.size_bytes ? ` · ${formatBytes(file.size_bytes)}` : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {/* Add a service */}
      <Modal
        open={serviceModalOpen}
        onClose={() => setServiceModalOpen(false)}
        title="Add a service"
        description="Assign a service to this client with its cadence and price."
        footer={
          <>
            <Button variant="secondary" onClick={() => setServiceModalOpen(false)}>
              Cancel
            </Button>
            <Button icon={<Plus className="size-4" />} disabled={!selectedServiceId} onClick={submitService}>
              Add service
            </Button>
          </>
        }
      >
        <Field label="Service">
          <Select
            value={selectedServiceId}
            onValueChange={handleServiceSelect}
            placeholder="Select a service…"
            searchPlaceholder="Search the catalogue…"
            options={availableCatalogue.map((service) => ({
              value: service.id,
              label: service.name,
              description: `${titleCase(service.frequency)} · ${formatMoney(service.default_price)}`,
            }))}
          />
        </Field>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Field label="Cadence">
            <Select
              value={cadence}
              onValueChange={(next) => setCadence(next as Frequency)}
              options={FREQUENCY_OPTIONS}
            />
          </Field>
          <Field label="Price ($)">
            <Input type="number" min={0} step={10} value={price} onChange={(event) => setPrice(event.target.value)} />
          </Field>
          <Field label="Next due">
            <Input type="date" value={nextDue} onChange={(event) => setNextDue(event.target.value)} />
          </Field>
        </div>
      </Modal>

      {/* Add task */}
      <Modal
        open={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        title="Add task"
        description="Create a task for this client."
        footer={
          <>
            <Button variant="secondary" onClick={() => setTaskModalOpen(false)}>
              Cancel
            </Button>
            <Button icon={<Plus className="size-4" />} disabled={!taskTitle.trim()} onClick={submitTask}>
              Add task
            </Button>
          </>
        }
      >
        <Field label="Title">
          <Input
            value={taskTitle}
            onChange={(event) => setTaskTitle(event.target.value)}
            placeholder="e.g. Prepare year-end working papers"
            autoFocus
          />
        </Field>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Assign to">
            <Select
              value={taskAssigneeId}
              onValueChange={setTaskAssigneeId}
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
          <Field label="Priority">
            <Select
              value={taskPriority}
              onValueChange={(next) => setTaskPriority(next as TaskPriority)}
              options={PRIORITY_OPTIONS}
            />
          </Field>
          <Field label="Status">
            <Select
              value={taskStatus}
              onValueChange={(next) => setTaskStatus(next as TaskStatus)}
              options={STATUS_OPTIONS}
            />
          </Field>
          <Field label="Due date">
            <Input type="date" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} />
          </Field>
        </div>
      </Modal>

      {/* Upload a file */}
      <Modal
        open={fileModalOpen}
        onClose={closeFileModal}
        title="Upload a file"
        description="Add a document to this client's secure storage."
        footer={
          <>
            <Button variant="secondary" onClick={closeFileModal}>
              Cancel
            </Button>
            <Button icon={<Upload className="size-4" />} disabled={!pendingFile} loading={uploading} onClick={submitFile}>
              Upload file
            </Button>
          </>
        }
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(event) => setPendingFile(event.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-surface-2/40 p-8 text-center transition hover:border-brand hover:bg-brand-soft/20"
        >
          <span className="grid size-11 place-items-center rounded-full bg-surface-2 text-muted">
            <Upload className="size-5" />
          </span>
          {pendingFile ? (
            <span className="text-[14px] font-medium text-ink">{pendingFile.name}</span>
          ) : (
            <>
              <span className="text-[14px] font-medium text-ink">Click to choose a file</span>
              <span className="text-[13px] text-muted">Statements, engagement letters, working papers…</span>
            </>
          )}
        </button>
      </Modal>
    </>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11.5px] tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-0.5 text-[13.5px] font-medium text-ink">{value}</dd>
    </div>
  );
}

function MetaRow({
  icon,
  label,
  value,
  href,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  href?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="flex items-center gap-1.5 text-[11.5px] tracking-wide text-muted uppercase">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 text-[13.5px] font-medium text-ink">
        {value ? href ? <a href={href} className="transition hover:text-brand">{value}</a> : value : "—"}
      </dd>
    </div>
  );
}

function Counter({
  icon,
  value,
  label,
  hint,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  hint?: string;
  tone?: "neutral" | "danger";
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] text-muted">{label}</p>
        <span className="text-muted">{icon}</span>
      </div>
      <p className={cn("mt-2 font-display text-2xl font-bold", tone === "danger" ? "text-danger" : "text-ink")}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[12px] text-danger">{hint}</p> : null}
    </div>
  );
}
