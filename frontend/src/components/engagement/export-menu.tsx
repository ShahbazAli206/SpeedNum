"use client";

import { ChevronDown, Download, FileImage, FileText, FileType } from "lucide-react";
import { useState } from "react";

import { Menu } from "@/components/ui";
import { cn } from "@/lib/cn";

import { downloadLetterDocx } from "./letter-docx";
import type { LetterDocumentData } from "./letter-document";
import { downloadLetterImage } from "./letter-image";
import { downloadLetterPdf } from "./letter-pdf";

type Format = "pdf" | "docx" | "png" | "jpg";

const OPTIONS: {
  format: Format;
  label: string;
  description: string;
  icon: typeof FileText;
}[] = [
  { format: "pdf", label: "PDF", description: "Print-ready, keeps signatures", icon: FileText },
  { format: "docx", label: "Word (.docx)", description: "Editable document", icon: FileType },
  { format: "png", label: "PNG image", description: "Lossless screenshot", icon: FileImage },
  { format: "jpg", label: "JPG image", description: "Smaller file", icon: FileImage },
];

/**
 * Shared download menu for an engagement letter — PDF/Word are built from
 * structured data (letter-pdf.tsx / letter-docx.ts); PNG/JPG rasterize
 * whatever DOM node `documentRef` points at (letter-image.ts), so callers
 * must attach that ref to their rendered <LetterDocument>.
 */
export function ExportMenu({
  letter,
  firmName,
  firmLogoUrl,
  filenameHint,
  documentRef,
  label = "Download",
  className,
}: {
  letter: LetterDocumentData;
  firmName: string;
  firmLogoUrl?: string | null;
  filenameHint: string;
  documentRef: React.RefObject<HTMLElement | null>;
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState<Format | null>(null);

  const run = async (format: Format) => {
    setBusy(format);
    try {
      if (format === "pdf") {
        await downloadLetterPdf({ firmName, firmLogoUrl, letter, filenameHint });
      } else if (format === "docx") {
        await downloadLetterDocx({ firmName, firmLogoUrl, letter, filenameHint });
      } else if (documentRef.current) {
        await downloadLetterImage({ element: documentRef.current, filenameHint, format });
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <Menu
      label="Download this letter"
      minWidth={230}
      className={cn(
        "inline-flex h-9.5 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4",
        "text-sm font-medium text-ink transition hover:bg-surface-2 disabled:opacity-60",
        className,
      )}
      trigger={
        <>
          <Download className="size-4" />
          {busy ? "Preparing…" : label}
          <ChevronDown className="size-3.5 text-muted" />
        </>
      }
      items={OPTIONS.map((option) => {
        const Icon = option.icon;
        return {
          label: option.label,
          description: option.description,
          icon: <Icon className="size-3.5" />,
          disabled: busy !== null,
          onSelect: () => void run(option.format),
        };
      })}
    />
  );
}
