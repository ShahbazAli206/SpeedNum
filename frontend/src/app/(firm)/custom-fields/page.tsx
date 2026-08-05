import { Plus, SlidersHorizontal } from "lucide-react";
import type { Metadata } from "next";

import { DashboardHeader } from "@/components/dashboard/page-shell";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getCustomFields } from "@/lib/firm-demo";
import { titleCase } from "@/lib/format";

export const metadata: Metadata = { title: "Custom fields" };

const TYPE_TONE: Record<string, string> = {
  text: "bg-surface-2 text-ink-soft",
  number: "bg-info-soft text-info",
  date: "bg-brand-soft text-brand",
  select: "bg-warn-soft text-warn",
  checkbox: "bg-surface-2 text-muted",
  email: "bg-info-soft text-info",
  phone: "bg-info-soft text-info",
};

const ENTITIES = [
  { key: "client", label: "Client records", blurb: "Appear on every client in the book" },
  { key: "project", label: "Projects", blurb: "Appear on every project in Task Master" },
  { key: "task", label: "Tasks", blurb: "Appear on every task" },
] as const;

export default function CustomFieldsPage() {
  const fields = getCustomFields();

  return (
    <>
      <DashboardHeader
        title="Custom fields"
        subtitle="Typed, admin-defined fields — filterable and exportable, unlike a note"
        actions={<Button icon={<Plus className="size-4" />}>Add field</Button>}
      />

      <div className="space-y-5">
        {ENTITIES.map((entity) => {
          const rows = fields
            .filter((field) => field.entity === entity.key)
            .sort((a, b) => a.position - b.position);

          return (
            <section
              key={entity.key}
              className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]"
            >
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <div>
                  <h2 className="text-[15px] font-semibold text-ink">{entity.label}</h2>
                  <p className="mt-0.5 text-[13px] text-muted">{entity.blurb}</p>
                </div>
                <span className="text-[12.5px] text-muted">
                  {rows.length} field{rows.length === 1 ? "" : "s"}
                </span>
              </div>

              {rows.length === 0 ? (
                <p className="px-5 py-8 text-center text-[13px] text-muted">
                  No custom fields defined for this entity yet.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {rows.map((field) => (
                    <li key={field.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
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
                        <p className="mt-1 text-[12.5px] text-muted">{field.help_text}</p>
                        <p className="mt-1 font-mono text-[11.5px] text-muted">{field.key}</p>

                        {field.options.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {field.options.map((option) => (
                              <span
                                key={option}
                                className="rounded-md border border-line px-2 py-0.5 text-[11.5px] text-ink-soft"
                              >
                                {option}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
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
    </>
  );
}
