"use client";

/**
 * The services catalogue, with editing.
 *
 * This page was previously a read-only server component over demo data — no
 * add, no edit, no delete — even though `backend/app/routers/services.py` has
 * exposed the full CRUD since the first migration. The catalogue is the
 * definition every deadline, project and letter line is generated from, so not
 * being able to add one meant a firm could never actually onboard its own work.
 *
 * The due rule is the interesting part. It is stored as JSON because
 * `backend/app/services/deadlines.py` evaluates it to generate filing dates:
 *
 *   {"type": "offset_from_period_end", "months": 6, "period_basis": "fiscal"}
 *   {"type": "fixed_date", "month": 4, "day": 30, "year_offset": 1}
 *
 * Rather than expose raw JSON, the form offers the two shapes as a choice and
 * builds the object — and `describeDueRule` (lib/adapt.ts) renders it back to
 * prose, so the rule stays the single source of truth in both directions.
 */

import {
  Banknote,
  CircleCheck,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  Repeat,
  Tag,
  Trash2,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { KpiTile } from "@/components/charts";
import { DashboardHeader, KpiRow } from "@/components/dashboard/page-shell";
import { ExportMenu } from "@/components/dashboard/export-menu";
import { useToast } from "@/components/toast";
import {
  Alert,
  Button,
  ButtonLink,
  Checkbox,
  Field,
  Input,
  Menu,
  Modal,
  Select,
  Textarea,
  toOptions,
} from "@/components/ui";
import { del, patch, post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatMoney, titleCase } from "@/lib/format";
import { useSpreadsheetExport } from "@/lib/spreadsheet-export";
import type { Frequency, Service } from "@/lib/types";

export interface ServiceRow {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  frequency: string;
  default_price: number;
  lead_time_days: number;
  is_active: boolean;
  due_rule: Record<string, unknown> | null;
  due_rule_label: string;
  client_count: number;
  annual_value: number;
}

const FREQUENCY_TONE: Record<string, string> = {
  monthly: "bg-info-soft text-info",
  quarterly: "bg-brand-soft text-brand",
  semi_annual: "bg-warn-soft text-warn",
  annual: "bg-surface-2 text-ink-soft",
  one_time: "bg-surface-2 text-muted",
};

const FREQUENCY_OPTIONS = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "semi_annual", label: "Semi-annual" },
  { value: "annual", label: "Annual" },
  { value: "one_time", label: "One time" },
];

const RULE_KINDS = [
  {
    value: "offset_from_period_end",
    label: "A number of months after period end",
    description: "e.g. a T2 due 6 months after the fiscal year end",
  },
  {
    value: "fixed_date",
    label: "A fixed calendar date",
    description: "e.g. a personal return always due 30 April",
  },
];

const MONTH_OPTIONS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
].map((label, index) => ({ value: String(index + 1), label }));

const DEFAULT_CATEGORIES = ["Compliance", "Bookkeeping", "Payroll", "Advisory", "Tax", "General"];

interface FormValues {
  code: string;
  name: string;
  description: string;
  category: string;
  frequency: string;
  defaultPrice: string;
  leadTimeDays: string;
  isActive: boolean;
  ruleKind: string;
  ruleMonths: string;
  ruleMonth: string;
  ruleDay: string;
  ruleYearOffset: string;
}

const BLANK: FormValues = {
  code: "",
  name: "",
  description: "",
  category: "Compliance",
  frequency: "annual",
  defaultPrice: "0",
  leadTimeDays: "30",
  isActive: true,
  ruleKind: "offset_from_period_end",
  ruleMonths: "6",
  ruleMonth: "4",
  ruleDay: "30",
  ruleYearOffset: "1",
};

function toForm(service: ServiceRow): FormValues {
  const rule = service.due_rule ?? {};
  const kind = String(rule.type ?? "offset_from_period_end");
  return {
    code: service.code,
    name: service.name,
    description: service.description,
    category: service.category,
    frequency: service.frequency,
    defaultPrice: String(service.default_price),
    leadTimeDays: String(service.lead_time_days),
    isActive: service.is_active,
    ruleKind: kind,
    ruleMonths: String(rule.months ?? 6),
    ruleMonth: String(rule.month ?? 4),
    ruleDay: String(rule.day ?? 30),
    ruleYearOffset: String(rule.year_offset ?? 1),
  };
}

/** Builds the JSON shape `services/deadlines.py` expects from the form. */
function toDueRule(form: FormValues): Record<string, unknown> {
  if (form.ruleKind === "fixed_date") {
    return {
      type: "fixed_date",
      month: Number(form.ruleMonth) || 12,
      day: Number(form.ruleDay) || 31,
      year_offset: Number(form.ruleYearOffset) || 0,
    };
  }
  return {
    type: "offset_from_period_end",
    months: Number(form.ruleMonths) || 6,
    period_basis: "fiscal",
  };
}

function reason(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function ServicesClient({
  services,
  isLive,
}: {
  services: ServiceRow[];
  isLive: boolean;
}) {
  const toast = useToast();
  const router = useRouter();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceRow | null>(null);
  const [form, setForm] = useState<FormValues>(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [removing, setRemoving] = useState<ServiceRow | null>(null);

  const active = services.filter((service) => service.is_active);
  const annualValue = services.reduce((total, service) => total + service.annual_value, 0);
  const categories = [...new Set(services.map((service) => service.category))];

  const grouped = categories.map((category) => ({
    category,
    services: services.filter((service) => service.category === category),
  }));

  const exportColumns = useMemo(
    () => [
      { header: "Code", value: (row: ServiceRow) => row.code },
      { header: "Name", value: (row: ServiceRow) => row.name },
      { header: "Category", value: (row: ServiceRow) => row.category },
      { header: "Cadence", value: (row: ServiceRow) => titleCase(row.frequency) },
      { header: "Due rule", value: (row: ServiceRow) => row.due_rule_label },
      { header: "Lead time (days)", value: (row: ServiceRow) => row.lead_time_days },
      { header: "Default price", value: (row: ServiceRow) => row.default_price },
      { header: "Client assignments", value: (row: ServiceRow) => row.client_count },
      { header: "Annual value", value: (row: ServiceRow) => row.annual_value },
      { header: "Active", value: (row: ServiceRow) => (row.is_active ? "Yes" : "No") },
    ],
    [],
  );
  const { exportCsv, exportXlsx, exportPdf, exporting } = useSpreadsheetExport(
    services,
    exportColumns,
    "speednum-services",
  );

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const openAdd = () => {
    setEditing(null);
    setForm(BLANK);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (service: ServiceRow) => {
    setEditing(service);
    setForm(toForm(service));
    setError(null);
    setModalOpen(true);
  };

  const submit = async () => {
    const code = form.code.trim().toUpperCase();
    const name = form.name.trim();
    if (!code) return setError("A short code is required — it identifies the service everywhere.");
    if (!name) return setError("Give the service a name.");

    if (!isLive) {
      toast.info(
        `${name} saved (demo)`,
        "No API is connected, so the catalogue wasn't changed.",
      );
      setModalOpen(false);
      return;
    }

    const body = {
      code,
      name,
      description: form.description.trim() || null,
      category: form.category.trim() || "General",
      frequency: form.frequency as Frequency,
      default_price: Number(form.defaultPrice) || 0,
      lead_time_days: Number(form.leadTimeDays) || 0,
      due_rule: toDueRule(form),
      is_active: form.isActive,
    };

    setPending(true);
    try {
      if (editing) {
        await patch<Service>(`/services/${editing.id}`, body);
        toast.success(`${name} updated`, "The catalogue entry has been saved.");
      } else {
        await post<Service>("/services", body);
        toast.success(`${name} added`, "It can now be assigned to clients.");
      }
      setModalOpen(false);
      router.refresh();
    } catch (caught) {
      const detail = reason(caught, "Please try again.");
      setError(detail);
      toast.error(editing ? "Could not save the service" : "Could not add the service", detail);
    } finally {
      setPending(false);
    }
  };

  const toggleActive = async (service: ServiceRow) => {
    if (!isLive) {
      toast.info("Demo mode", "Connect the API to change the catalogue.");
      return;
    }
    try {
      await patch<Service>(`/services/${service.id}`, { is_active: !service.is_active });
      toast.success(
        `${service.name} ${service.is_active ? "deactivated" : "reactivated"}`,
        service.is_active
          ? "It stays on existing assignments but can't be added to new ones."
          : "It can be assigned to clients again.",
      );
      router.refresh();
    } catch (caught) {
      toast.error("Could not update the service", reason(caught, "Please try again."));
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    const service = removing;
    setRemoving(null);

    if (!isLive) {
      toast.info("Demo mode", "Connect the API to change the catalogue.");
      return;
    }
    try {
      const result = await del<{ message: string }>(`/services/${service.id}`);
      toast.success(`${service.name} removed`, result.message);
      router.refresh();
    } catch (caught) {
      toast.error("Could not remove the service", reason(caught, "Please try again."));
    }
  };

  return (
    <>
      <DashboardHeader
        title="Services catalogue"
        subtitle="Typed services with code, cadence and price — the definition that drives deadlines, projects and letters"
        actions={
          <>
            <ExportMenu
              exportCsv={exportCsv}
              exportXlsx={exportXlsx}
              exportPdf={exportPdf}
              exporting={exporting}
            />
            <ButtonLink href="/import?mode=services" variant="secondary" icon={<Upload className="size-4" />}>
              Import
            </ButtonLink>
            <Button icon={<Plus className="size-4" />} onClick={openAdd}>
              Add service
            </Button>
          </>
        }
      />

      <KpiRow>
        <KpiTile
          tone="blue"
          value={String(services.length)}
          label="Services defined"
          hint={`${active.length} active`}
          icon={<Tag className="size-5" />}
        />
        <KpiTile
          tone="green"
          value={formatMoney(annualValue)}
          label="Annualised value"
          hint="Across all client assignments"
          icon={<Banknote className="size-5" />}
        />
        <KpiTile
          tone="amber"
          value={String(categories.length)}
          label="Categories"
          icon={<Repeat className="size-5" />}
        />
        <KpiTile
          tone="rose"
          value={String(services.reduce((total, service) => total + service.client_count, 0))}
          label="Client assignments"
          icon={<CircleCheck className="size-5" />}
        />
      </KpiRow>

      {services.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line p-12 text-center">
          <p className="text-[15px] font-semibold text-ink">No services yet</p>
          <p className="mx-auto mt-1 max-w-md text-[13.5px] text-muted">
            The catalogue is what deadlines and engagement letters are generated from. Add your
            first service to start assigning work to clients.
          </p>
          <Button className="mt-4" icon={<Plus className="size-4" />} onClick={openAdd}>
            Add service
          </Button>
        </div>
      ) : null}

      <div className="mt-6 space-y-5">
        {grouped.map((group) => (
          <section
            key={group.category}
            className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]"
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <h2 className="text-[14.5px] font-bold text-ink">{group.category}</h2>
              <span className="text-[12.5px] text-muted">
                {group.services.length} service{group.services.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="scroll-thin overflow-x-auto">
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="border-b border-line text-[11.5px] tracking-wide text-muted uppercase">
                    <th className="px-5 py-2.5 text-left font-semibold">Code</th>
                    <th className="px-5 py-2.5 text-left font-semibold">Service</th>
                    <th className="px-5 py-2.5 text-left font-semibold">Cadence</th>
                    <th className="px-5 py-2.5 text-left font-semibold">Due rule</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Lead time</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Price</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Clients</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Annual value</th>
                    <th className="px-5 py-2.5 text-right font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {group.services.map((service) => (
                    <tr
                      key={service.id}
                      className={cn(
                        "border-b border-line last:border-b-0",
                        !service.is_active && "opacity-55",
                      )}
                    >
                      <td className="px-5 py-3">
                        <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-ink-soft">
                          {service.code}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-medium text-ink">
                        {service.name}
                        {!service.is_active ? (
                          <span className="ml-2 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                            Inactive
                          </span>
                        ) : null}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            FREQUENCY_TONE[service.frequency],
                          )}
                        >
                          {titleCase(service.frequency)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-muted">{service.due_rule_label}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-muted">
                        {service.lead_time_days}d
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-ink">
                        {formatMoney(service.default_price)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-ink-soft">
                        {service.client_count}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums text-ink">
                        {service.annual_value > 0 ? formatMoney(service.annual_value) : "—"}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Menu
                          label={`Actions for ${service.name}`}
                          className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink"
                          trigger={<MoreHorizontal className="size-4" />}
                          items={[
                            {
                              label: "Edit service",
                              icon: <Pencil className="size-3.5" />,
                              onSelect: () => openEdit(service),
                            },
                            {
                              label: service.is_active ? "Deactivate" : "Reactivate",
                              description: service.is_active
                                ? "Hide from new assignments"
                                : "Allow new assignments",
                              icon: <Power className="size-3.5" />,
                              onSelect: () => void toggleActive(service),
                            },
                            {
                              label: "Delete",
                              // The server refuses when assignments exist, so
                              // say so up front rather than after the 409.
                              description:
                                service.client_count > 0
                                  ? `Blocked — ${service.client_count} client(s) assigned`
                                  : undefined,
                              icon: <Trash2 className="size-3.5" />,
                              danger: true,
                              separated: true,
                              disabled: service.client_count > 0,
                              onSelect: () => setRemoving(service),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>

      <p className="mt-6 rounded-xl border border-line bg-surface-2/50 p-5 text-[13px] leading-relaxed text-muted">
        Annual value multiplies each service&apos;s price by its cadence and the number of clients
        assigned to it — so it moves when an assignment changes, rather than being maintained by
        hand. Per-client price overrides live on the client record.
      </p>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit service" : "Add service"}
        description={
          editing
            ? "Changes apply to future deadlines; existing ones keep the dates they were generated with."
            : "Define a service once, then assign it to as many clients as you like."
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button icon={<Plus className="size-4" />} onClick={() => void submit()} loading={pending}>
              {editing ? "Save changes" : "Add service"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error ? <Alert tone="danger" title="Check the form">{error}</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
            <Field label="Code" required hint="Short, unique — e.g. T2">
              <Input
                value={form.code}
                onChange={(event) => set("code", event.target.value.toUpperCase())}
                placeholder="T2"
                autoFocus
              />
            </Field>
            <Field label="Name" required>
              <Input
                value={form.name}
                onChange={(event) => set("name", event.target.value)}
                placeholder="Corporate tax return"
              />
            </Field>
          </div>

          <Field label="Description" hint="Shown on engagement letters.">
            <Textarea
              rows={2}
              value={form.description}
              onChange={(event) => set("description", event.target.value)}
              placeholder="Preparation and filing of the T2 corporate income tax return."
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category">
              <Select
                value={form.category}
                onValueChange={(next) => set("category", next)}
                options={toOptions([
                  ...new Set([...DEFAULT_CATEGORIES, ...categories, form.category].filter(Boolean)),
                ])}
              />
            </Field>
            <Field label="Cadence">
              <Select
                value={form.frequency}
                onValueChange={(next) => set("frequency", next)}
                options={FREQUENCY_OPTIONS}
              />
            </Field>
            <Field label="Default price ($)">
              <Input
                type="number"
                min={0}
                step={50}
                value={form.defaultPrice}
                onChange={(event) => set("defaultPrice", event.target.value)}
              />
            </Field>
            <Field
              label="Lead time (days)"
              hint="How early work should start before the due date."
            >
              <Input
                type="number"
                min={0}
                step={5}
                value={form.leadTimeDays}
                onChange={(event) => set("leadTimeDays", event.target.value)}
              />
            </Field>
          </div>

          <div className="rounded-lg border border-line bg-surface-2/40 p-4">
            <Field
              label="When is it due?"
              hint="This is what generates each client's filing dates."
            >
              <Select
                value={form.ruleKind}
                onValueChange={(next) => set("ruleKind", next)}
                options={RULE_KINDS}
              />
            </Field>

            {form.ruleKind === "offset_from_period_end" ? (
              <Field label="Months after period end" className="mt-3">
                <Input
                  type="number"
                  min={0}
                  max={36}
                  value={form.ruleMonths}
                  onChange={(event) => set("ruleMonths", event.target.value)}
                />
              </Field>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="Month">
                  <Select
                    value={form.ruleMonth}
                    onValueChange={(next) => set("ruleMonth", next)}
                    options={MONTH_OPTIONS}
                  />
                </Field>
                <Field label="Day">
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={form.ruleDay}
                    onChange={(event) => set("ruleDay", event.target.value)}
                  />
                </Field>
                <Field label="Year">
                  <Select
                    value={form.ruleYearOffset}
                    onValueChange={(next) => set("ruleYearOffset", next)}
                    options={[
                      { value: "0", label: "Same year" },
                      { value: "1", label: "Following year" },
                    ]}
                  />
                </Field>
              </div>
            )}
          </div>

          <Checkbox
            label="Active — available to assign to clients"
            checked={form.isActive}
            onChange={(event) => set("isActive", event.target.checked)}
          />
        </div>
      </Modal>

      <Modal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Delete service"
        description="This removes the catalogue entry entirely."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon={<Trash2 className="size-4" />}
              onClick={() => void confirmRemove()}
            >
              Delete service
            </Button>
          </>
        }
      >
        {removing ? (
          <p className="text-[13.5px] leading-relaxed text-ink-soft">
            <strong className="font-semibold text-ink">{removing.name}</strong> will be removed from
            the catalogue. Deadlines already generated from it are kept — they are their own
            records. If you only want to stop offering it, deactivate it instead.
          </p>
        ) : null}
      </Modal>
    </>
  );
}
