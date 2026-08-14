"use client";

import { FileSpreadsheet, Loader2 } from "lucide-react";
import { useRef, useState } from "react";

import { cn } from "@/lib/cn";

const ACCEPT = ".csv,.xlsx,.xlsm,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Drag-and-drop (or browse) for a CSV/XLSX upload.
 *
 * Shared by the client importer and the user importer so both accept the same
 * file types and report the same errors. The parent owns what happens next —
 * this only hands over a File.
 *
 * Keyboard reachable: the drop zone is a `<button>`, not a decorated `<div>`, so
 * Tab and Enter work without an extra "browse" link to hunt for.
 */
export function SpreadsheetDrop({
  onFile,
  busy = false,
  label = "Drop your CSV or XLSX here",
  hint,
  className,
}: {
  onFile: (file: File) => void;
  busy?: boolean;
  label?: string;
  hint?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);

  const accept = (files: FileList | null) => {
    setRejected(null);
    const file = files?.[0];
    if (!file) return;
    if (!/\.(csv|xlsx|xlsm)$/i.test(file.name)) {
      setRejected(`${file.name} is not a CSV or Excel file.`);
      return;
    }
    onFile(file);
  };

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(event) => {
          accept(event.target.files);
          // Reset so re-selecting the same file after a fix still fires change.
          event.target.value = "";
        }}
      />

      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!busy) accept(event.dataTransfer.files);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition",
          dragging ? "border-brand bg-brand-soft/40" : "border-line hover:border-line-strong hover:bg-surface-2/50",
          busy && "cursor-wait opacity-70",
        )}
      >
        <span className="grid size-12 place-items-center rounded-full bg-surface-2 text-muted">
          {busy ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <FileSpreadsheet className="size-5" />
          )}
        </span>
        <span className="text-[14px] font-medium text-ink">
          {busy ? "Reading your file…" : label}
        </span>
        <span className="text-[13px] text-muted">
          {hint ?? "or click to browse — CSV, XLSX and XLSM up to a few thousand rows"}
        </span>
      </button>

      {rejected ? (
        <p className="mt-2 text-[12.5px] font-medium text-danger" role="alert">
          {rejected}
        </p>
      ) : null}
    </div>
  );
}

/** Builds and downloads a CSV template from a header row and one example row. */
export function downloadTemplate(name: string, headers: string[], example: string[]) {
  const escape = (cell: string) => `"${cell.replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(","), example.map(escape).join(",")].join("\n");
  // A leading BOM so Excel on Windows reads the accents correctly.
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
