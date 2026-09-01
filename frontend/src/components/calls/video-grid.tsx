"use client";

import type { ParticipantView } from "@/lib/livekit/use-call";
import { cn } from "@/lib/cn";

import { VideoTile } from "./video-tile";

/**
 * Lays out the call surface (spec §25):
 *   - if anyone is screen-sharing, that becomes a spotlight with the camera
 *     tiles as a filmstrip;
 *   - a 1:1 call is a single large remote tile with the local preview
 *     picture-in-picture;
 *   - otherwise a responsive grid whose column count grows with participants.
 *
 * Adaptive Stream (configured in lib/livekit/room.ts) means the small tiles
 * automatically receive a lower resolution than the spotlight — nothing here
 * has to manage that (§25).
 */
export function VideoGrid({ views, className }: { views: ParticipantView[]; className?: string }) {
  const sharer = views.find((v) => v.isScreenSharing);

  if (sharer) {
    return (
      <div className={cn("flex h-full flex-col gap-2", className)}>
        <VideoTile view={sharer} preferScreen className="min-h-0 flex-1" />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {views.map((v) => (
            <VideoTile key={v.identity} view={v} className="aspect-video w-40 shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  const remotes = views.filter((v) => !v.isLocal);
  const local = views.find((v) => v.isLocal);

  // 1:1 — the remote fills the surface, local is a small overlay.
  if (remotes.length === 1 && local) {
    return (
      <div className={cn("relative h-full", className)}>
        <VideoTile view={remotes[0]} className="size-full" />
        <VideoTile
          view={local}
          className="absolute bottom-4 right-4 aspect-video w-40 shadow-lg sm:w-56"
        />
      </div>
    );
  }

  const count = views.length;
  const cols = count <= 1 ? 1 : count <= 4 ? 2 : count <= 9 ? 3 : 4;

  return (
    <div
      className={cn("grid h-full gap-2", className)}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {views.map((v) => (
        <VideoTile key={v.identity} view={v} className="min-h-0" />
      ))}
    </div>
  );
}
