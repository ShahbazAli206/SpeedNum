"use client";

import { ChevronDown, Download, FileImage, FileText, FileType } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";

import { downloadLetterDocx } from "./letter-docx";
import type { LetterDocumentData } from "./letter-document";
import { downloadLetterImage } from "./letter-image";
import { downloadLetterPdf } from "./letter-pdf";

type Format = "pdf" | "docx" | "png" | "jpg";

const OPTIONS: { format: Format; label: string; icon: typeof FileText }[] = [
  { format: "pdf", label: "PDF", icon: FileText },
  { format: "docx", label: "Word (.docx)", icon: FileType },
  { format: "png", label: "PNG image", icon: FileImage },
  { format: "jpg", label: "JPG image", icon: FileImage },
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
}: {
  letter: LetterDocumentData;
  firmName: string;
  firmLogoUrl?: string | null;
  filenameHint: string;
  documentRef: React.RefObject<HTMLElement | null>;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Format | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
      setOpen(false);
    }
  };

  return (
    <div ref={menuRef} className="relative inline-block">
      <Button
        variant="secondary"
        icon={<Download className="size-4" />}
        trailingIcon={<ChevronDown className="size-3.5" />}
        loading={busy !== null}
        onClick={() => setOpen((current) => !current)}
      >
        {label}
      </Button>

      {open ? (
        <div
          role="menu"
          className="absolute top-full right-0 z-30 mt-1.5 w-48 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-[var(--shadow-lift)]"
        >
          {OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.format}
                type="button"
                role="menuitem"
                disabled={busy !== null}
                onClick={() => void run(option.format)}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] text-ink-soft transition",
                  "hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                <Icon className="size-4 text-muted" />
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
