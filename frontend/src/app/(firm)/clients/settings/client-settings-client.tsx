"use client";

import { Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useToast } from "@/components/toast";
import { Button, Checkbox, Field, Input, Select } from "@/components/ui";
import { del, post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAction, useApi } from "@/lib/hooks";
import type { CustomField, FieldType } from "@/lib/types";

const TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
];

const TYPE_LABEL: Record<FieldType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  select: "Dropdown",
  checkbox: "Checkbox",
  email: "Email",
  phone: "Phone",
};

/** Pull a human-readable reason out of an ApiError without leaking `[object]`. */
function message(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function slugify(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

/**
 * Client-entity slice of the same real `/custom-fields` API that backs the
 * full admin page at /custom-fields — this page exists as a faster path from
 * the Clients list specifically, not a separate feature or a separate store.
 */
export function ClientSettingsClient() {
  const toast = useToast();
  const fields = useApi<CustomField[]>("/custom-fields?entity=client");
  const create = useAction();

  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<FieldType>("text");
  const [required, setRequired] = useState(false);

  const sorted = [...(fields.data ?? [])].sort((a, b) => a.position - b.position);

  const addField = () =>
    create.run(async () => {
      const trimmed = label.trim();
      if (!trimmed) return;
      const key = slugify(trimmed);
      if (!key) {
        toast.error("Couldn't add field", "Give it a label with at least one letter or number.");
        return;
      }
      await post<CustomField>("/custom-fields", {
        entity: "client",
        key,
        label: trimmed,
        field_type: fieldType,
        is_required: required,
        position: sorted.length,
      });
      toast.success(`"${trimmed}" added`, "New client records will show this field.");
      setLabel("");
      setFieldType("text");
      setRequired(false);
      await fields.reload();
    });

  const removeField = async (field: CustomField) => {
    try {
      await del(`/custom-fields/${field.id}`);
      toast.success("Field removed", field.label);
      await fields.reload();
    } catch (error) {
      toast.error("Could not remove field", message(error, "Please try again."));
    }
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
            {create.error ? <p className="text-[12.5px] font-medium text-danger">{create.error}</p> : null}
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
                onValueChange={(next) => setFieldType(next as FieldType)}
                options={TYPE_OPTIONS}
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
              loading={create.pending}
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
                {sorted.length} field{sorted.length === 1 ? "" : "s"} defined.
              </p>
            </div>
          </div>

          {fields.isLoading ? (
            <p className="px-5 py-10 text-center text-[13px] text-muted">Loading…</p>
          ) : sorted.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-muted">
              No custom fields defined yet. Add one on the left.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {sorted.map((field) => (
                <li key={field.id} className="flex items-start justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] font-semibold text-ink">{field.label}</p>
                      {field.is_required ? (
                        <span
                          className={cn(
                            "rounded-full bg-danger-soft px-2 py-0.5 text-[10.5px] font-bold text-danger uppercase",
                          )}
                        >
                          Required
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-muted">{TYPE_LABEL[field.field_type]}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeField(field)}
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
