"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/components/icon";
import { cn } from "@/lib/cn";

import { useCalls } from "./call-provider";
import { CandidatePicker } from "./candidate-picker";

/**
 * The "Video Call" row for the app sidebars, placed directly under Messages.
 * Unlike the other rows it is not a navigation link — it opens the
 * authorized-contact picker and starts a call.
 *
 * The picker is rendered through a portal to document.body. The sidebar and
 * sticky topbar each create their own stacking context, so a normal in-tree
 * modal (the shared <Modal>, z-50) rendered from here paints *behind* the main
 * page. Portaling to the body root escapes every ancestor stacking context, so
 * z-200 reliably sits above the whole app. This is the fix for the popup that
 * was appearing behind the page.
 */
export function CallNavItem({ collapsed = false }: { collapsed?: boolean }) {
  const { startCall } = useCalls();
  const [open, setOpen] = useState(false);

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={collapsed ? "Video Call" : undefined}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg text-[14.5px] font-medium transition",
          collapsed ? "justify-center px-2 py-2.5" : "px-2.5 py-2.5",
          "text-ink-soft hover:bg-surface-2 hover:text-ink",
        )}
      >
        <Icon name="video-call" className="size-6 text-[21px]" />
        {!collapsed ? <span className="flex-1 truncate text-left">Video Call</span> : null}
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-200 flex items-start justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-[2px] sm:p-8"
              role="dialog"
              aria-modal="true"
              aria-label="Start a call"
            >
              <div className="absolute inset-0" onClick={() => setOpen(false)} aria-hidden />
              <div className="animate-in relative my-auto w-full max-w-md rounded-xl border border-line bg-surface shadow-xl">
                <div className="flex items-center justify-between border-b border-line px-5 py-4">
                  <h2 className="text-base font-semibold text-ink">Start a call</h2>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                    className="-m-1 rounded-lg p-1 text-muted transition hover:bg-surface-2 hover:text-ink"
                  >
                    <X className="size-4.5" />
                  </button>
                </div>
                <div className="scroll-thin max-h-[70vh] overflow-y-auto px-5 py-4">
                  <CandidatePicker
                    multiple
                    confirmLabel="Start call"
                    onConfirm={(ids) => {
                      setOpen(false);
                      void startCall(ids, "video");
                    }}
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </li>
  );
}
