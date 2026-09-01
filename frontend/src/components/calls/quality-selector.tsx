"use client";

import { Gauge } from "lucide-react";

import { QUALITY_MODES, type QualityMode } from "@/lib/livekit/room";
import { cn } from "@/lib/cn";

/**
 * Auto / 360p / 720p / 1080p (spec §4). The label deliberately reads as a
 * ceiling, not a floor: selecting 1080p means "allow up to 1080p", and the
 * network may still be served a lower layer — the adaptation in
 * lib/livekit/room.ts is what actually decides delivered quality.
 */
export function QualitySelector({
  value,
  onChange,
  className,
}: {
  value: QualityMode;
  onChange: (mode: QualityMode) => void;
  className?: string;
}) {
  return (
    <label className={cn("inline-flex items-center gap-2 text-sm text-white/80", className)}>
      <Gauge className="size-4" aria-hidden />
      <span className="sr-only">Video quality</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as QualityMode)}
        className="rounded-lg border border-white/15 bg-white/10 px-2 py-1 text-white focus:outline-none focus:ring-2 focus:ring-white/30"
        title="Maximum video quality — the call may still send less when the network can't sustain it"
      >
        {QUALITY_MODES.map((m) => (
          <option key={m.value} value={m.value} className="text-black">
            {m.label}
          </option>
        ))}
      </select>
    </label>
  );
}
