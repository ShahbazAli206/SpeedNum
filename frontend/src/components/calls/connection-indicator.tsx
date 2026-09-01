"use client";

import { Signal, SignalHigh, SignalLow, SignalMedium, Loader2 } from "lucide-react";

import { ConnectionQuality } from "livekit-client";

import { cn } from "@/lib/cn";
import type { CallConnectionState } from "@/lib/livekit/use-call";

/** Map LiveKit's ConnectionQuality enum to the spec's five-level scale
 *  (Excellent/Good/Fair/Poor/Reconnecting) — §7. */
function qualityLabel(q: ConnectionQuality): { label: string; tone: string } {
  switch (q) {
    case ConnectionQuality.Excellent:
      return { label: "Excellent", tone: "text-emerald-400" };
    case ConnectionQuality.Good:
      return { label: "Good", tone: "text-emerald-300" };
    case ConnectionQuality.Poor:
      return { label: "Poor", tone: "text-rose-400" };
    case ConnectionQuality.Lost:
      return { label: "Reconnecting", tone: "text-rose-400" };
    default:
      return { label: "Fair", tone: "text-amber-300" };
  }
}

/** The small per-tile dot (spec §7 — "a small indicator"). */
export function ConnectionDot({ quality }: { quality: ConnectionQuality }) {
  const { label, tone } = qualityLabel(quality);
  const Icon =
    quality === ConnectionQuality.Excellent || quality === ConnectionQuality.Good
      ? SignalHigh
      : quality === ConnectionQuality.Poor || quality === ConnectionQuality.Lost
        ? SignalLow
        : SignalMedium;
  return (
    <span className={cn("flex items-center gap-1", tone)} title={`Connection: ${label}`}>
      <Icon className="size-4" aria-hidden />
      <span className="sr-only">Connection: {label}</span>
    </span>
  );
}

/**
 * The call-level connection banner (spec §7). Shows the current state, and
 * "Reconnecting…" prominently while the SDK is recovering a dropped link so
 * the user knows the call is being held, not lost (§6/§8).
 */
export function ConnectionIndicator({
  state,
  ownQuality,
  className,
}: {
  state: CallConnectionState;
  ownQuality?: ConnectionQuality;
  className?: string;
}) {
  if (state === "reconnecting") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-sm font-medium text-amber-300",
          className,
        )}
      >
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Reconnecting…
      </span>
    );
  }
  if (state === "connecting") {
    return (
      <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sm text-white/80", className)}>
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Connecting…
      </span>
    );
  }
  const { label, tone } = qualityLabel(ownQuality ?? ConnectionQuality.Unknown);
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sm", tone, className)}>
      <Signal className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}
