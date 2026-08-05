"use client";

import {
  Download,
  FileText,
  Folder,
  HardDrive,
  Paperclip,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";

import { KpiTile } from "@/components/charts";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { DashboardHeader, KpiRow } from "@/components/dashboard/page-shell";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { DocumentFile } from "@/lib/demo";
import { formatBytes, formatDate } from "@/lib/format";

const KIND_LABEL: Record<string, string> = {
  invoice: "Invoice",
  receipt: "Receipt",
  tax: "Tax form",
  contract: "Contract",
  statement: "Statement",
};

const KIND_TONE: Record<string, string> = {
  invoice: "bg-info-soft text-info",
  receipt: "bg-warn-soft text-warn",
  tax: "bg-brand-soft text-brand",
  contract: "bg-surface-2 text-ink-soft",
  statement: "bg-danger-soft text-danger",
};

export function DocumentsClient({
  documents,
  totals,
}: {
  documents: DocumentFile[];
  totals: { count: number; bytes: number; shared: number };
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  /**
   * Uploads are not wired to a backend yet — there is no documents endpoint.
   * The picker acknowledges the file and says so rather than silently doing
   * nothing, which would read as a bug.
   */
  const acknowledge = (files: FileList | null) => {
    if (!files?.length) return;
    const names = Array.from(files)
      .slice(0, 3)
      .map((file) => file.name)
      .join(", ");
    toast.info(
      `${files.length} file${files.length === 1 ? "" : "s"} selected`,
      `${names} — uploads go live once the documents API is connected.`,
    );
  };

  const columns: Column<DocumentFile>[] = [
    {
      key: "name",
      header: "File",
      cell: (row) => (
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted">
            <FileText className="size-4" />
          </span>
          <span className="block max-w-72 truncate font-medium text-ink">{row.name}</span>
        </div>
      ),
      sortValue: (row) => row.name,
    },
    {
      key: "kind",
      header: "Type",
      cell: (row) => (
        <span
          className={cn(
            "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
            KIND_TONE[row.kind],
          )}
        >
          {KIND_LABEL[row.kind]}
        </span>
      ),
      sortValue: (row) => row.kind,
    },
    {
      key: "uploadedBy",
      header: "Added by",
      cell: (row) => row.uploadedBy,
      sortValue: (row) => row.uploadedBy,
    },
    {
      key: "uploaded",
      header: "Date",
      cell: (row) => formatDate(row.uploaded),
      sortValue: (row) => row.uploaded,
    },
    {
      key: "size",
      header: "Size",
      align: "right",
      cell: (row) => formatBytes(row.size),
      sortValue: (row) => row.size,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            toast.info("Download queued", `${row.name} will download once storage is connected.`);
          }}
          className="rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-ink"
          aria-label={`Download ${row.name}`}
        >
          <Download className="size-4" />
        </button>
      ),
    },
  ];

  return (
    <>
      <DashboardHeader
        title="Documents"
        subtitle="Invoices, receipts, tax forms and contracts"
        actions={
          <Button icon={<Upload className="size-4" />} onClick={() => inputRef.current?.click()}>
            Upload
          </Button>
        }
      />

      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => acknowledge(event.target.files)}
      />

      <KpiRow>
        <KpiTile
          tone="blue"
          value={String(totals.count)}
          label="Total files"
          icon={<Folder className="size-5" />}
        />
        <KpiTile
          tone="green"
          value={formatBytes(totals.bytes)}
          label="Storage used"
          hint="Unlimited on your plan"
          icon={<HardDrive className="size-5" />}
        />
        <KpiTile
          tone="amber"
          value={String(totals.shared)}
          label="Shared by your accountant"
          icon={<Paperclip className="size-5" />}
        />
        <KpiTile
          tone="rose"
          value={String(totals.count - totals.shared)}
          label="Uploaded by you"
          icon={<Upload className="size-5" />}
        />
      </KpiRow>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          acknowledge(event.dataTransfer.files);
        }}
        className={cn(
          "mt-6 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition",
          dragging ? "border-brand bg-brand-soft/40" : "border-line bg-surface",
        )}
      >
        <span className="grid size-11 place-items-center rounded-full bg-surface-2 text-muted">
          <Upload className="size-5" />
        </span>
        <p className="text-[14px] font-medium text-ink">Drop files here to upload</p>
        <p className="text-[13px] text-muted">
          PDF, images and spreadsheets ·{" "}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="font-semibold text-brand hover:underline"
          >
            browse instead
          </button>
        </p>
      </div>

      <section className="mt-6 rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">Files</h2>
          <p className="mt-0.5 text-[13px] text-muted">All documents in your workspace</p>
        </div>
        <DataTable
          rows={documents}
          columns={columns}
          searchKeys={(row) => `${row.name} ${row.uploadedBy} ${KIND_LABEL[row.kind]}`}
          filters={[
            {
              label: "Types",
              options: Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label })),
              predicate: (row, value) => row.kind === value,
            },
          ]}
          emptyTitle="No documents match"
          emptyDescription="Try clearing the search or the type filter."
          exportName="speednum-documents"
        />
      </section>
    </>
  );
}
