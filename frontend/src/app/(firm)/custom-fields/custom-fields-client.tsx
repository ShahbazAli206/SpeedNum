"use client";

import { Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";

import { useToast } from "@/components/toast";
import { Button, Checkbox, Field, Input, Modal, Select, Textarea } from "@/components/ui";
import { del, post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { titleCase } from "@/lib/format";
import { useAction, useApi } from "@/lib/hooks";
import type { CustomEntity, CustomField, FieldType } from "@/lib/types";

const TYPE_TONE: Record<FieldType, string> = {
  text: "bg-surface-2 text-ink-soft",
  number: "bg-info-soft text-info",
  date: "bg-brand-soft text-brand",
  select: "bg-warn-soft text-warn",
  checkbox: "bg-surface-2 text-muted",
  email: "bg-info-soft text-info",
  phone: "bg-info-soft text-info",
};

const ENTITIES: { key: CustomEntity; label: string; blurb: string }[] = [
  { key: "client", label: "Client records", blurb: "Appear on every client in the book" },
  { key: "project", label: "Projects", blurb: "Appear on every project in Task Master" },
  { key: "task", label: "Tasks", blurb: "Appear on every task" },
];

const TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Select" },
  { value: "checkbox", label: "Checkbox" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
];

/** Pull a human-readable reason out of an ApiError without leaking `[object]`. */
function message(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

const KEY_PATTERN = /^[a-z0-9_]+$/;

function slugify(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

export function CustomFieldsClient() {
  const toast = useToast();
  const fields = useApi<CustomField[]>("/custom-fields");
  const create = useAction();
  const remove = useAction();

  const [open, setOpen] = useState(false);
  const [entity, setEntity] = useState<CustomEntity>("client");
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<FieldType>("text");
  const [helpText, setHelpText] = useState("");
  const [isRequired, setIsRequired] = useState(false);
  const [optionsText, setOptionsText] = useState("");

  const resetForm = () => {
    setEntity("client");
    setLabel("");
    setFieldType("text");
    setHelpText("");
    setIsRequired(false);
    setOptionsText("");
  };

  const submit = () =>
    create.run(async () => {
      const trimmed = label.trim();
      if (!trimmed) return;
      const key = slugify(trimmed);
      if (!KEY_PATTERN.test(key)) {
        toast.error("Couldn't create field", "Give it a label with at least one letter or number.");
        return;
      }
      await post<CustomField>("/custom-fields", {
        entity,
        key,
        label: trimmed,
        field_type: fieldType,
        options: fieldType === "select" ? optionsText.split(",").map((o) => o.trim()).filter(Boolean) : [],
        help_text: helpText.trim() || null,
        is_required: isRequired,
        position: fields.data?.filter((f) => f.entity === entity).length ?? 0,
      });
      toast.success("Field added", trimmed);
      setOpen(false);
      resetForm();
      await fields.reload();
    });

  const deleteField = (field: CustomField) =>
    remove.run(async () => {
      try {
        await del(`/custom-fields/${field.id}`);
        toast.success("Field removed", field.label);
        await fields.reload();
      } catch (error) {
        toast.error("Could not remove field", message(error, "Please try again."));
      }
    });

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[1.6rem] font-bold tracking-tight text-ink">Custom fields</h1>
          <p className="mt-0.5 text-[14px] text-muted">
            Typed, admin-defined fields — filterable and exportable, unlike a note
          </p>
        </div>
        <Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>
          Add field
        </Button>
      </div>

      <div className="space-y-5">
        {ENTITIES.map((entityDef) => {
          const rows = (fields.data ?? [])
            .filter((field) => field.entity === entityDef.key)
            .sort((a, b) => a.position - b.position);

          return (
            <section
              key={entityDef.key}
              className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]"
            >
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <div>
                  <h2 className="text-[15px] font-semibold text-ink">{entityDef.label}</h2>
                  <p className="mt-0.5 text-[13px] text-muted">{entityDef.blurb}</p>
                </div>
                <span className="text-[12.5px] text-muted">
                  {rows.length} field{rows.length === 1 ? "" : "s"}
                </span>
              </div>

              {fields.isLoading ? (
                <p className="px-5 py-8 text-center text-[13px] text-muted">Loading…</p>
              ) : rows.length === 0 ? (
                <p className="px-5 py-8 text-center text-[13px] text-muted">
                  No custom fields defined for this entity yet.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {rows.map((field) => (
                    <li key={field.id} className="group flex flex-wrap items-start gap-4 px-5 py-4">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-[11px] font-bold text-muted">
                        {field.position}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[14px] font-semibold text-ink">{field.label}</p>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase",
                              TYPE_TONE[field.field_type],
                            )}
                          >
                            {titleCase(field.field_type)}
                          </span>
                          {field.is_required ? (
                            <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[10.5px] font-bold text-danger uppercase">
                              Required
                            </span>
                          ) : null}
                        </div>
                        {field.help_text ? (
                          <p className="mt-1 text-[12.5px] text-muted">{field.help_text}</p>
                        ) : null}
                        <p className="mt-1 font-mono text-[11.5px] text-muted">{field.key}</p>

                        {field.options.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {field.options.map((option) => (
                              <span
                                key={String(option)}
                                className="rounded-md border border-line px-2 py-0.5 text-[11.5px] text-ink-soft"
                              >
                                {String(option)}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        onClick={() => deleteField(field)}
                        aria-label={`Remove ${field.label}`}
                        className="shrink-0 rounded-md p-1.5 text-muted opacity-0 transition group-hover:opacity-100 hover:bg-danger-soft hover:text-danger"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-xl border border-line bg-surface-2/50 p-5">
        <SlidersHorizontal className="mt-0.5 size-4.5 shrink-0 text-muted" aria-hidden />
        <p className="text-[13px] leading-relaxed text-muted">
          Because these fields are typed rather than free text, they behave like built-in ones:
          select fields render as dropdowns with a fixed option list, dates use the date picker,
          required fields block save, and every value comes through the CSV/XLSX export.
        </p>
      </div>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          resetForm();
        }}
        title="Add custom field"
        description="Appears on every record of the chosen type, for every team member."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button loading={create.pending} disabled={!label.trim()} onClick={submit}>
              Add field
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {create.error ? <p className="text-[12.5px] font-medium text-danger">{create.error}</p> : null}
          <Field label="Applies to" required>
            <Select
              value={entity}
              onValueChange={(next) => setEntity(next as CustomEntity)}
              options={ENTITIES.map((e) => ({ value: e.key, label: e.label }))}
            />
          </Field>
          <Field label="Label" required>
            <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Referred by" />
          </Field>
          <Field label="Type">
            <Select
              value={fieldType}
              onValueChange={(next) => setFieldType(next as FieldType)}
              options={TYPE_OPTIONS}
            />
          </Field>
          {fieldType === "select" ? (
            <Field label="Options" hint="Comma-separated">
              <Input
                value={optionsText}
                onChange={(event) => setOptionsText(event.target.value)}
                placeholder="Referral, Website, Cold outreach"
              />
            </Field>
          ) : null}
          <Field label="Help text">
            <Textarea rows={2} value={helpText} onChange={(event) => setHelpText(event.target.value)} />
          </Field>
          <Checkbox
            label="Required"
            checked={isRequired}
            onChange={(event) => setIsRequired(event.target.checked)}
          />
        </div>
      </Modal>
    </>
  );
}
