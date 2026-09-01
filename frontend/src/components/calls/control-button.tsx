"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * The round in-call control button used across the control bar (mic, camera,
 * screen, chat, participants, hang-up). `danger` is the hang-up red; `active`
 * marks a toggled-on state; `muted` is the "this input is off" red used for
 * mic/camera. Always carries an aria-label since the face is icon-only.
 */
export function ControlButton({
  label,
  icon,
  onClick,
  active = false,
  muted = false,
  danger = false,
  disabled = false,
  className,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
  muted?: boolean;
  danger?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        "grid size-12 place-items-center rounded-full text-white transition disabled:opacity-50",
        danger
          ? "bg-rose-600 hover:bg-rose-500"
          : muted
            ? "bg-rose-500/90 hover:bg-rose-500"
            : active
              ? "bg-white text-slate-900 hover:bg-white/90"
              : "bg-white/10 hover:bg-white/20",
        className,
      )}
    >
      {icon}
    </button>
  );
}
