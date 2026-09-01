"use client";

import { MonitorUp, MonitorX } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/cn";

import { ControlButton } from "./control-button";

/**
 * Screen-share toggle with the mandatory confirm-before-share warning (spec
 * §33.7). Starting a share always shows the warning first; the browser's own
 * screen/window/tab picker then appears when toggle() is called — we never
 * auto-start a share, and never pick the surface for the user.
 */
export function ScreenShareButton({
  active,
  onToggle,
  className,
}: {
  active: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);

  if (active) {
    return (
      <ControlButton
        label="Stop sharing"
        onClick={onToggle}
        active
        icon={<MonitorX className="size-5" />}
        className={className}
      />
    );
  }

  return (
    <div className="relative">
      <ControlButton
        label="Share screen"
        onClick={() => setConfirming(true)}
        icon={<MonitorUp className="size-5" />}
        className={className}
      />
      {confirming ? (
        <div className="absolute bottom-full left-1/2 z-20 mb-2 w-64 -translate-x-1/2 rounded-xl bg-slate-800 p-3 text-sm text-white shadow-xl ring-1 ring-white/10">
          <p className="text-white/90">
            You&apos;re about to share your screen. Make sure any confidential or sensitive
            information that shouldn&apos;t be visible to other participants is hidden.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg px-3 py-1 text-white/70 hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                onToggle();
              }}
              className="rounded-lg bg-white px-3 py-1 font-semibold text-slate-900 hover:bg-white/90"
            >
              Continue
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
