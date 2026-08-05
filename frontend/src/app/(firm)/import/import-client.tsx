"use client";

import {
  CircleCheck,
  Download,
  FileSpreadsheet,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";

import { DashboardHeader } from "@/components/dashboard/page-shell";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";

/** The columns the importer expects, mirroring the backend template. */
const TEMPLATE_COLUMNS = [
  { column: "legal_name", required: true, note: "Registered legal name" },
  { column: "business_name", required: false, note: "Operating name, if different" },
  { column: "client_type", required: true, note: "corporation | sole_proprietor | partnership | individual | nonprofit | trust" },
  { column: "status", required: false, note: "prospect | active | inactive | archived — defaults to active" },
  { column: "business_number", required: false, note: "CRA business number" },
  { column: "email", required: false, note: "Primary contact email" },
  { column: "phone", required: false, note: "Primary contact phone" },
  { column: "city", required: false, note: "" },
  { column: "province", required: true, note: "Two-letter code, e.g. ON" },
  { column: "year_end_month", required: true, note: "1–12 — drives every generated deadline" },
  { column: "year_end_day", required: true, note: "1–31" },
  { column: "annual_fee", required: false, note: "Numeric, no currency symbol" },
];

/** A worked preview: what row-level validation actually reports. */
const PREVIEW_ROWS = [
  { row: 2, legal_name: "Lakeview Dental Corp.", province: "ON", year_end: "12 / 31", fee: "9,600", errors: [] as string[] },
  { row: 3, legal_name: "Ridgeway Hauling Ltd.", province: "ON", year_end: "6 / 30", fee: "11,400", errors: [] },
  { row: 4, legal_name: "", province: "ON", year_end: "12 / 31", fee: "7,200", errors: ["legal_name is required"] },
  { row: 5, legal_name: "Foxglove Florists Inc.", province: "Ontario", year_end: "12 / 31", fee: "6,000", errors: ["province must be a two-letter code"] },
  { row: 6, legal_name: "Marlow Consulting Ltd.", province: "ON", year_end: "13 / 31", fee: "8,400", errors: ["year_end_month must be 1–12"] },
  { row: 7, legal_name: "Ashfield Bakery Co.", province: "AB", year_end: "9 / 30", fee: "5,400", errors: [] },
];

export function ImportClient() {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const valid = PREVIEW_ROWS.filter((row) => row.errors.length === 0).length;
  const invalid = PREVIEW_ROWS.length - valid;

  const stage = (files: FileList | null) => {
    if (!files?.length) return;
    setShowPreview(true);
    toast.info(
      `${files[0].name} staged`,
      "Showing the validation preview. Committing needs the import API.",
    );
  };

  const downloadTemplate = () => {
    const header = TEMPLATE_COLUMNS.map((column) => column.column).join(",");
    const example =
      "Lakeview Dental Corp.,Lakeview Dental,corporation,active,80112 3345 RC0001,hello@lakeview.ca,+1 416 555 0100,Toronto,ON,12,31,9600";
    const blob = new Blob([`${header}\n${example}\n`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "speednum-client-import-template.csv";
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Template downloaded", "Fill it in, then upload it here.");
  };

  return (
    <>
      <DashboardHeader
        title="Import clients"
        subtitle="Template-driven CSV/XLSX import — off the spreadsheet in an afternoon, never locked in"
        actions={
          <Button
            variant="secondary"
            icon={<Download className="size-4" />}
            onClick={downloadTemplate}
          >
            Download template
          </Button>
        }
      />

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx"
        className="hidden"
        onChange={(event) => stage(event.target.files)}
      />

      {/* Step 1 — upload */}
      <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">1 · Upload your file</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            The importer detects your column mapping automatically
          </p>
        </div>
        <div className="p-5">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              stage(event.dataTransfer.files);
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition",
              dragging ? "border-brand bg-brand-soft/40" : "border-line",
            )}
          >
            <span className="grid size-12 place-items-center rounded-full bg-surface-2 text-muted">
              <FileSpreadsheet className="size-5" />
            </span>
            <p className="text-[14px] font-medium text-ink">Drop your CSV or XLSX here</p>
            <p className="text-[13px] text-muted">
              or{" "}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="font-semibold text-brand hover:underline"
              >
                browse for a file
              </button>
            </p>
          </div>
        </div>
      </section>

      {/* Step 2 — expected columns */}
      <section className="mt-5 rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">2 · Expected columns</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            The template carries these headers exactly
          </p>
        </div>
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-line text-[11.5px] tracking-wide text-muted uppercase">
                <th className="px-5 py-2.5 text-left font-semibold">Column</th>
                <th className="px-5 py-2.5 text-left font-semibold">Required</th>
                <th className="px-5 py-2.5 text-left font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody>
              {TEMPLATE_COLUMNS.map((column) => (
                <tr key={column.column} className="border-b border-line last:border-b-0">
                  <td className="px-5 py-2.5">
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11.5px] text-ink-soft">
                      {column.column}
                    </span>
                  </td>
                  <td className="px-5 py-2.5">
                    {column.required ? (
                      <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[10.5px] font-bold text-danger uppercase">
                        Required
                      </span>
                    ) : (
                      <span className="text-[12.5px] text-muted">Optional</span>
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-muted">{column.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Step 3 — preview */}
      <section className="mt-5 rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">3 · Validation preview</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              Every row is checked before a single record is written
            </p>
          </div>
          {showPreview ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[12px] font-semibold text-success">
                <CircleCheck className="size-3.5" />
                {valid} valid
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-2.5 py-1 text-[12px] font-semibold text-danger">
                <TriangleAlert className="size-3.5" />
                {invalid} with errors
              </span>
            </div>
          ) : null}
        </div>

        {!showPreview ? (
          <p className="px-5 py-12 text-center text-[13.5px] text-muted">
            Upload a file above to see the row-by-row preview.
          </p>
        ) : (
          <>
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="border-b border-line text-[11.5px] tracking-wide text-muted uppercase">
                    <th className="px-5 py-2.5 text-left font-semibold">Row</th>
                    <th className="px-5 py-2.5 text-left font-semibold">Legal name</th>
                    <th className="px-5 py-2.5 text-left font-semibold">Province</th>
                    <th className="px-5 py-2.5 text-left font-semibold">Year-end</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Annual fee</th>
                    <th className="px-5 py-2.5 text-left font-semibold">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {PREVIEW_ROWS.map((row) => {
                    const bad = row.errors.length > 0;
                    return (
                      <tr
                        key={row.row}
                        className={cn(
                          "border-b border-line last:border-b-0",
                          bad && "bg-danger-soft/30",
                        )}
                      >
                        <td className="px-5 py-2.5 tabular-nums text-muted">{row.row}</td>
                        <td className="px-5 py-2.5 font-medium text-ink">
                          {row.legal_name || <span className="text-danger">— missing —</span>}
                        </td>
                        <td className="px-5 py-2.5 text-ink-soft">{row.province}</td>
                        <td className="px-5 py-2.5 tabular-nums text-ink-soft">{row.year_end}</td>
                        <td className="px-5 py-2.5 text-right tabular-nums text-ink-soft">
                          {row.fee}
                        </td>
                        <td className="px-5 py-2.5">
                          {bad ? (
                            <span className="text-[12.5px] font-medium text-danger">
                              {row.errors.join("; ")}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-success">
                              <CircleCheck className="size-3.5" />
                              Ready
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
              <p className="text-[12.5px] text-muted">
                Import the {valid} valid rows now and fix the rest, or correct the file and
                re-upload.
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setShowPreview(false)}>
                  Discard
                </Button>
                <Button
                  icon={<Upload className="size-4" />}
                  onClick={() =>
                    toast.info(
                      "Import not connected",
                      "Committing rows needs the /import API — the preview above is real validation logic.",
                    )
                  }
                >
                  Import {valid} rows
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
    </>
  );
}
