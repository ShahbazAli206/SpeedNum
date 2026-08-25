"use client";

import { ChevronDown, Download, FileStack, FileText, Sheet } from "lucide-react";

import { Menu } from "@/components/ui";

/** The CSV/Excel/PDF dropdown used by every exportable admin table. */
export function ExportMenu({
  exportCsv,
  exportXlsx,
  exportPdf,
  exporting,
}: {
  exportCsv: () => void;
  exportXlsx: () => void;
  exportPdf: () => void;
  exporting: boolean;
}) {
  return (
    <Menu
      label="Export rows"
      minWidth={200}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-medium text-muted transition hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
      trigger={
        <>
          <Download className="size-3.5" />
          Export
          <ChevronDown className="size-3.5" />
        </>
      }
      items={[
        {
          label: "CSV",
          description: "Opens in any spreadsheet",
          icon: <FileText className="size-3.5" />,
          disabled: exporting,
          onSelect: exportCsv,
        },
        {
          label: "Excel",
          description: "Formatted .xlsx workbook",
          icon: <Sheet className="size-3.5" />,
          disabled: exporting,
          onSelect: exportXlsx,
        },
        {
          label: "PDF",
          description: "Printable table, all rows",
          icon: <FileStack className="size-3.5" />,
          disabled: exporting,
          onSelect: exportPdf,
        },
      ]}
    />
  );
}
