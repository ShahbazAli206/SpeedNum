"use client";

import { Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useToast } from "@/components/toast";
import { Button, Checkbox, Field, Input, Select, toOptions } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { CustomField } from "@/lib/firm-demo";

const FIELD_TYPES = ["Text", "Paragraph", "Number", "Date", "Dropdown", "Checkbox"] as const;
type FieldTypeLabel = (typeof FIELD_TYPES)[number];

interface DraftField {
  id: string;
  label: string;
  fieldType: FieldTypeLabel;
  required: boolean;
}

const TYPE_LABEL: Record<CustomField["field_type"], FieldTypeLabel> = {
  text: "Text",
  number: "Number",
  date: "Date",
  select: "Dropdown",
  checkbox: "Checkbox",
  email: "Text",
  phone: "Text",
};

let draftSeq = 0;
function nextDraftId() {
  draftSeq += 1;
  return `client-field-${draftSeq}`;
}

export function ClientSettingsClient({ initialFields }: { initialFields: CustomField[] }) {
  const toast = useToast();

  const [fields, setFields] = useState<DraftField[]>(() =>
    initialFields
      .sort((a, b) => a.position - b.position)
      .map((field) => ({
        id: field.id,
        label: field.label,
        fieldType: TYPE_LABEL[field.field_type],
        required: field.is_required,
      })),
  );

  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<FieldTypeLabel>("Text");
  const [required, setRequired] = useState(false);

  const addField = () => {
    const trimmed = label.trim();
    if (!trimmed) return;

    setFields((current) => [
      ...current,
      { id: nextDraftId(), label: trimmed, fieldType, required },
    ]);
    toast.success(`"${trimmed}" added`, "New client records will show this field.");
    setLabel("");
    setFieldType("Text");
    setRequired(false);
  };

  const removeField = (id: string) => {
    setFields((current) => current.filter((field) => field.id !== id));
  };

  return (
    <>
      <Link
        href="/clients"
        className="text-[12.5px] font-medium text-brand transition hover:underline"
      >
        ← Back to clients
      </Link>

      <div className="mt-3 mb-6 flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
          <SlidersHorizontal className="size-5" />
        </span>
        <div>
          <h1 className="font-display text-[1.6rem] font-bold tracking-tight text-ink">
            Client settings
          </h1>
          <p className="mt-0.5 text-[14px] text-muted">
            Customize the fields captured on every client record.
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
          <div className="flex items-start gap-3 border-b border-line px-5 py-4">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-soft">
              <Plus className="size-4.5" />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Add a field</h2>
              <p className="mt-0.5 text-[13px] text-muted">
                New fields appear on every client&apos;s add/edit form.
              </p>
            </div>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              addField();
            }}
            className="space-y-4 p-5"
          >
            <Field label="Field label" required>
              <Input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="e.g. CRA Business Number"
              />
            </Field>

            <Field label="Field type">
              <Select
                value={fieldType}
                onValueChange={(next) => setFieldType(next as FieldTypeLabel)}
                options={toOptions(FIELD_TYPES)}
              />
            </Field>

            <Checkbox
              label="Required field"
              checked={required}
              onChange={(event) => setRequired(event.target.checked)}
            />

            <Button
              type="submit"
              className="w-full justify-center"
              disabled={!label.trim()}
              icon={<Plus className="size-4" />}
            >
              Add field
            </Button>
          </form>
        </section>

        <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
          <div className="flex items-start gap-3 border-b border-line px-5 py-4">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-soft">
              <SlidersHorizontal className="size-4.5" />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Custom client fields</h2>
              <p className="mt-0.5 text-[13px] text-muted">
                {fields.length} field{fields.length === 1 ? "" : "s"} defined. Hidden fields stay
                stored but are not shown on the form.
              </p>
            </div>
          </div>

          {fields.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-muted">
              No custom fields defined yet. Add one on the left.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {fields.map((field) => (
                <li key={field.id} className="flex items-start justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] font-semibold text-ink">{field.label}</p>
                      {field.required ? (
                        <span
                          className={cn(
                            "rounded-full bg-danger-soft px-2 py-0.5 text-[10.5px] font-bold text-danger uppercase",
                          )}
                        >
                          Required
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-muted">{field.fieldType}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeField(field.id)}
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-danger-soft hover:text-danger"
                    aria-label={`Remove ${field.label}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
