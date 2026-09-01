"use client";

import { Mic, MicOff, MonitorUp, UserMinus, Video, VideoOff } from "lucide-react";

import type { ParticipantView } from "@/lib/livekit/use-call";
import { cn } from "@/lib/cn";

/**
 * The in-call participant roster (spec §22, §25). `onRemove` is only passed
 * when the local user is the initiator/a moderator — the backend re-checks
 * that permission on DELETE regardless, so a hidden button is only a UX
 * nicety, not the security boundary.
 */
export function ParticipantList({
  views,
  canRemove = false,
  onRemove,
  className,
}: {
  views: ParticipantView[];
  canRemove?: boolean;
  onRemove?: (view: ParticipantView) => void;
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-col divide-y divide-white/10", className)}>
      {views.map((v) => (
        <li key={v.identity} className="flex items-center gap-3 py-2.5">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-semibold text-white">
            {(v.name || "?").slice(0, 1).toUpperCase()}
          </div>
          <span className="min-w-0 flex-1 truncate text-sm text-white">
            {v.name}
            {v.isLocal ? <span className="text-white/50"> (you)</span> : null}
          </span>
          <span className="flex items-center gap-1.5 text-white/60">
            {v.isScreenSharing ? <MonitorUp className="size-4 text-emerald-300" aria-label="Sharing screen" /> : null}
            {v.isMicEnabled ? <Mic className="size-4" aria-label="Mic on" /> : <MicOff className="size-4 text-rose-300" aria-label="Mic off" />}
            {v.isCameraEnabled ? <Video className="size-4" aria-label="Camera on" /> : <VideoOff className="size-4 text-white/40" aria-label="Camera off" />}
            {canRemove && !v.isLocal && onRemove ? (
              <button
                type="button"
                onClick={() => onRemove(v)}
                aria-label={`Remove ${v.name}`}
                title={`Remove ${v.name}`}
                className="ml-1 rounded-lg p-1 text-rose-300 hover:bg-rose-500/20"
              >
                <UserMinus className="size-4" />
              </button>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
