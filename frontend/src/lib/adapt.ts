/**
 * Adapters from API records to the row shapes the firm pages render.
 *
 * The pages were built against `lib/firm-demo`, whose types carry a few fields
 * the database has no column for — `plan` (a commercial label the firm keeps as a
 * tag), `joined` (an alias for created_at), `service_ids` (denormalised for the
 * demo's client-side joins) — and which narrow several nullable columns to
 * non-null. Rather than loosening every page's props to `T | ApiT`, the live
 * records are mapped once, here.
 *
 * Where a field genuinely does not exist server-side the fallback is explicit and
 * commented, so nobody later mistakes a placeholder for real data.
 */

import type {
  ClientRow,
  Contact as DemoContact,
  CustomField as DemoCustomField,
  Deadline as DemoDeadline,
  Letter as DemoLetter,
  Service as DemoService,
  Task as DemoTask,
  TeamRow,
  TeamStatus,
} from "./firm-demo";
import type {
  Client,
  Contact,
  CustomField,
  Deadline,
  Letter,
  Service,
  Task,
  TeamMember,
  UserRole,
} from "./types";

/** Plans live in `clients.tags` — the schema has no plan column. */
const PLAN_TAGS = ["Growth", "Professional", "Starter"];

function planFrom(tags: string[] | null | undefined): string {
  const match = (tags ?? []).find((tag) => PLAN_TAGS.includes(tag));
  return match ?? "Starter";
}

export function toClientRow(client: Client): ClientRow {
  return {
    id: client.id,
    code: client.code ?? "",
    legal_name: client.legal_name,
    business_name: client.business_name || client.legal_name,
    client_type: client.client_type,
    status: client.status,
    business_number: client.business_number ?? "",
    city: client.city ?? "",
    province: client.province ?? "",
    year_end_month: client.year_end_month,
    year_end_day: client.year_end_day,
    owner_id: client.owner_id ?? "",
    annual_fee: client.annual_fee,
    portal_enabled: client.portal_enabled,
    tags: client.tags ?? [],
    plan: planFrom(client.tags),
    joined: client.created_at?.slice(0, 10) ?? "",
    // JSONB, so values can be any type; the pages only ever display them.
    custom: Object.fromEntries(
      Object.entries(client.custom ?? {}).map(([key, value]) => [key, String(value ?? "")]),
    ),
    // Not returned by GET /clients — the detail page fetches
    // /clients/{id}/services when it needs the real assignments.
    service_ids: [],
    owner_name: client.owner_name ?? "Unassigned",
    open_tasks: client.open_tasks,
    open_deadlines: client.open_deadlines,
    overdue_deadlines: client.overdue_deadlines,
    next_due_date: client.next_due_date,
    service_count: client.service_count,
    monthly_fee: Math.round((client.annual_fee / 12) * 100) / 100,
    portal_invited_at: client.portal_invited_at,
    portal_signed_in: client.portal_signed_in,
  };
}

export function toDemoTask(task: Task): DemoTask {
  return {
    id: task.id,
    project_id: task.project_id,
    client_id: task.client_id,
    client_name: task.client_name ?? "—",
    title: task.title,
    description: task.description,
    task_type: task.task_type,
    status: task.status,
    priority: task.priority,
    assignee_id: task.assignee_id ?? "",
    assignee_name: task.assignee_name ?? "Unassigned",
    due_date: task.due_date,
    estimate_hours: task.estimate_hours ?? 0,
    created_at: task.created_at ?? "",
    time_spent_seconds: task.time_spent_seconds,
    timer_running: task.timer_running,
    timer_started_at: task.timer_started_at,
  };
}

/** A client's contact — the demo type narrows a few nullable columns to
 * non-null empty strings, same reasoning as toClientRow above. */
export function toDemoContact(contact: Contact): DemoContact {
  return {
    id: contact.id,
    client_id: contact.client_id,
    full_name: contact.full_name,
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    role: contact.role ?? "",
    is_primary: contact.is_primary,
  };
}

/** Client custom-field definitions — identical shape to the live record
 * except `help_text`, which the demo narrows to "" instead of null. */
export function toDemoCustomField(field: CustomField): DemoCustomField {
  return {
    id: field.id,
    entity: field.entity,
    key: field.key,
    label: field.label,
    field_type: field.field_type,
    options: field.options,
    help_text: field.help_text ?? "",
    is_required: field.is_required,
    position: field.position,
  };
}

/** Engagement letters, trimmed to the handful of fields the client detail
 * page's "Engagement letters" card actually renders — the live `Letter`
 * carries a lot more (body, terms, signature blobs) that has no demo
 * equivalent and nothing here needs. */
export function toDemoLetter(letter: Letter): DemoLetter {
  return {
    id: letter.id,
    client_id: letter.client_id,
    client_name: letter.client_name ?? "—",
    title: letter.title,
    status: letter.status,
    currency: letter.currency,
    subtotal: letter.subtotal,
    tax_rate: letter.tax_rate,
    recipient_name: letter.recipient_name ?? "—",
    recipient_email: letter.recipient_email ?? "—",
    sent_at: letter.sent_at,
    viewed_at: letter.viewed_at,
    signed_at: letter.signed_at,
    signer_name: letter.signer_name,
    items: letter.items.map((item) => ({ description: item.description, amount: item.amount })),
  };
}

export function toDemoDeadline(deadline: Deadline): DemoDeadline {
  return {
    id: deadline.id,
    client_id: deadline.client_id,
    service_id: deadline.service_id ?? "",
    title: deadline.title,
    period_label: deadline.period_label ?? "",
    due_date: deadline.due_date,
    status: deadline.status,
    assignee_id: deadline.assignee_id ?? "",
    filed_at: deadline.filed_at ?? undefined,
    client_name: deadline.client_name ?? "—",
    service_code: deadline.service_code ?? "—",
    assignee_name: deadline.assignee_name ?? "Unassigned",
    days_remaining: deadline.days_remaining,
    urgency: deadline.urgency,
  };
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * `services.due_rule` is the machine-readable grammar the compliance engine
 * evaluates (`backend/app/services/deadlines.py`); the catalogue shows it as a
 * sentence. Rendering it here rather than storing prose keeps one source of
 * truth — edit the rule and the label follows.
 */
export function describeDueRule(rule: Record<string, unknown> | null | undefined): string {
  if (!rule || Object.keys(rule).length === 0) return "—";
  const kind = String(rule.type ?? "offset_from_period_end");

  if (kind === "fixed_date") {
    const month = Number(rule.month ?? 12);
    const day = Number(rule.day ?? 31);
    const label = day < 0 ? `end of ${MONTHS_SHORT[month - 1]}` : `${MONTHS_SHORT[month - 1]} ${day}`;
    const offset = Number(rule.year_offset ?? 1);
    return offset === 0 ? label : `${label} of the following year`;
  }

  const months = Number(rule.months ?? 0);
  const days = Number(rule.days ?? 0);
  const basis = rule.period_basis === "calendar" ? "calendar period end" : "period end";
  if (months) return `${months} month${months === 1 ? "" : "s"} after ${basis}`;
  if (days) return `${days} day${days === 1 ? "" : "s"} after ${basis}`;
  return `6 months after ${basis}`;
}

export function toDemoService(service: Service): DemoService {
  return {
    id: service.id,
    code: service.code,
    name: service.name,
    category: service.category,
    frequency: service.frequency,
    default_price: service.default_price,
    lead_time_days: service.lead_time_days,
    is_active: service.is_active,
    due_rule: describeDueRule(service.due_rule),
  };
}

/**
 * `profiles` has only `is_active`, while the roster UI carries a third "away"
 * state. Live rows map to the two that exist rather than inventing a column no
 * endpoint would ever set.
 */
export function toTeamRow(member: TeamMember): TeamRow {
  const status: TeamStatus = member.is_active ? "active" : "inactive";
  return {
    id: member.id,
    full_name: member.full_name || member.email,
    email: member.email,
    phone: member.phone,
    title: member.title || "",
    role: member.role as UserRole,
    role_id: member.role_id,
    weekly_capacity: member.weekly_capacity,
    is_active: member.is_active,
    status,
    joined: member.created_at?.slice(0, 10) ?? "",
    clients: member.clients,
    open_tasks: member.open_tasks,
    overdue: member.overdue,
    // Would mean summing task estimates per assignee on every roster load; the
    // detail page computes it from the tasks it already has.
    estimated_hours: 0,
    must_change_password: member.must_change_password,
    is_superadmin: member.is_superadmin,
  };
}
