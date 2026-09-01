"use client";

import { Video } from "lucide-react";
import { useState } from "react";

import { Modal } from "@/components/ui";
import { cn } from "@/lib/cn";

import { CandidatePicker } from "./candidate-picker";
import { useCalls } from "./call-provider";

/**
 * The "start a call" entry point — a single button (drop it in a shell
 * topbar) that opens the authorized-candidate picker and starts a call.
 * Multi-select, so it doubles as the group-call launcher (spec §10 + §21).
 * Hidden while already in a call.
 */
export function CallLauncher({ className }: { className?: string }) {
  const { startCall, inCall } = useCalls();
  const [open, setOpen] = useState(false);

  if (inCall) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Start a call"
        title="Start a call"
        className={cn(
          "grid size-9 place-items-center rounded-lg border border-line text-ink-soft transition hover:bg-surface-2",
          className,
        )}
      >
        <Video className="size-4" />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Start a call" width="sm">
        <CandidatePicker
          multiple
          confirmLabel="Start call"
          onConfirm={(ids) => {
            setOpen(false);
            void startCall(ids, "video");
          }}
        />
      </Modal>
    </>
  );
}
