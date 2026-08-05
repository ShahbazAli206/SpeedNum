import {
  Building2,
  CalendarClock,
  Mail,
  Phone,
  Signature,
  Tag,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { cn } from "@/lib/cn";
import {
  CLIENT_IDS,
  getClient,
  getContacts,
  getCustomFields,
  getDeadlines,
  getLetters,
  getServices,
  getTasks,
} from "@/lib/firm-demo";
import { formatDate, formatMoney, titleCase } from "@/lib/format";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function generateStaticParams() {
  return CLIENT_IDS.map((id) => ({ id }));
}

export async function generateMetadata({
  params,
}: PageProps<"/clients/[id]">): Promise<Metadata> {
  const { id } = await params;
  const client = getClient(id);
  return { title: client ? client.business_name : "Client not found" };
}

export default async function ClientDetailPage({ params }: PageProps<"/clients/[id]">) {
  const { id } = await params;
  const client = getClient(id);
  if (!client) notFound();

  const contacts = getContacts().filter((contact) => contact.client_id === client.id);
  const services = getServices().filter((service) => client.service_ids.includes(service.id));
  const deadlines = getDeadlines()
    .filter((deadline) => deadline.client_id === client.id)
    .sort((a, b) => a.days_remaining - b.days_remaining);
  const tasks = getTasks().filter((task) => task.client_id === client.id);
  const letters = getLetters().filter((letter) => letter.client_id === client.id);
  const customFields = getCustomFields().filter((field) => field.entity === "client");

  return (
    <>
      {/* Record header */}
      <div className="mb-6">
        <Link
          href="/clients"
          className="text-[12.5px] font-medium text-brand transition hover:underline"
        >
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
                    client.status === "active"
                      ? "bg-success-soft text-success"
                      : "bg-warn-soft text-warn",
                  )}
                >
                  {client.status}
                </span>
                {client.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-soft"
                  >
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
        <Counter icon={<Tag className="size-4" />} value={services.length} label="Assigned services" />
        <Counter
          icon={<CalendarClock className="size-4" />}
          value={client.open_deadlines}
          label="Open deadlines"
          tone={client.overdue_deadlines > 0 ? "danger" : "neutral"}
          hint={client.overdue_deadlines > 0 ? `${client.overdue_deadlines} overdue` : undefined}
        />
        <Counter icon={<Users className="size-4" />} value={client.open_tasks} label="Open tasks" />
        <Counter
          icon={<Signature className="size-4" />}
          value={letters.filter((letter) => letter.status === "signed").length}
          label="Signed letters"
          hint={`${letters.length} total`}
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-5">
          {/* Contacts */}
          <Panel title="Contacts" description="Each labelled with a designation">
            <ul className="divide-y divide-line">
              {contacts.length === 0 ? (
                <li className="px-5 py-8 text-center text-[13px] text-muted">
                  No contacts recorded yet.
                </li>
              ) : (
                contacts.map((contact) => (
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
                ))
              )}
            </ul>
          </Panel>

          {/* Custom fields */}
          <Panel title="Custom fields" description="Defined by your administrators">
            <dl className="divide-y divide-line">
              {customFields.map((field) => (
                <div key={field.id} className="flex items-start justify-between gap-4 px-5 py-3">
                  <dt className="text-[13px] text-muted">{field.label}</dt>
                  <dd className="text-right text-[13.5px] text-ink">
                    {client.custom[field.label] ?? "—"}
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>

        <div className="space-y-5">
          {/* Services */}
          <Panel title="Assigned services" description="Cadence drives the deadline board">
            {services.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] text-muted">
                No services assigned. Nothing will be scheduled until at least one is.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {services.map((service) => (
                  <li key={service.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-ink-soft">
                      {service.code}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-ink">
                        {service.name}
                      </span>
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
          </Panel>

          {/* Deadlines */}
          <Panel title="Deadlines" description="Generated from year-end and service cadences">
            {deadlines.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] text-muted">
                No deadlines yet.
              </p>
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
                      <span className="block truncate text-[13.5px] font-medium text-ink">
                        {deadline.title}
                      </span>
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
                      <span className="block text-[11px] text-muted">
                        {formatDate(deadline.due_date)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* Tasks */}
          <Panel title="Open work" description="Tasks across all projects for this client">
            {tasks.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] text-muted">No tasks.</p>
            ) : (
              <ul className="divide-y divide-line">
                {tasks.map((task) => (
                  <li key={task.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] text-ink">{task.title}</span>
                      <span className="block text-[12px] text-muted">
                        {task.assignee_name} · due {formatDate(task.due_date)}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        task.status === "complete"
                          ? "bg-success-soft text-success"
                          : task.status === "blocked"
                            ? "bg-danger-soft text-danger"
                            : task.status === "review"
                              ? "bg-warn-soft text-warn"
                              : "bg-surface-2 text-ink-soft",
                      )}
                    >
                      {titleCase(task.status)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* Letters */}
          <Panel title="Engagement letters" description="Scope and fees on record">
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
                      <span className="block truncate text-[13.5px] font-medium text-ink">
                        {letter.title}
                      </span>
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
          </Panel>
        </div>
      </div>
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
      <p
        className={cn(
          "mt-2 font-display text-2xl font-bold",
          tone === "danger" ? "text-danger" : "text-ink",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[12px] text-danger">{hint}</p> : null}
    </div>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        <p className="mt-0.5 text-[13px] text-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}
