"use client";

import { MicOff, Video as VideoIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import type { ParticipantView } from "@/lib/livekit/use-call";
import { cn } from "@/lib/cn";

import { ConnectionDot } from "./connection-indicator";

/**
 * One participant's video (or screen-share) surface. Attaches the LiveKit
 * track to a real <video>/<audio> element via track.attach() and detaches on
 * cleanup — the SDK's supported way to render a track, rather than piping the
 * MediaStreamTrack by hand.
 *
 * `preferScreen` renders the screen-share publication instead of the camera,
 * so the same tile serves both the camera grid and a "someone is sharing"
 * spotlight.
 */
export function VideoTile({
  view,
  preferScreen = false,
  className,
}: {
  view: ParticipantView;
  preferScreen?: boolean;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const publication = preferScreen ? view.screenPublication : view.cameraPublication;
  const videoTrack = publication?.track;
  const showingVideo = !!videoTrack && !publication?.isMuted;

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !videoTrack) return;
    videoTrack.attach(el);
    return () => {
      videoTrack.detach(el);
    };
  }, [videoTrack]);

  // Remote audio is rendered per-tile too. The local participant's own mic is
  // never played back (that would be an echo) — guarded on !isLocal.
  const micTrack = view.micPublication?.track;
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !micTrack || view.isLocal) return;
    micTrack.attach(el);
    return () => {
      micTrack.detach(el);
    };
  }, [micTrack, view.isLocal]);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl bg-slate-900 ring-1 ring-white/10",
        view.isSpeaking && "ring-2 ring-emerald-400",
        className,
      )}
    >
      {showingVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          // The local camera is mirrored, as every video app does; a shared
          // screen is never mirrored.
          muted={view.isLocal}
          className={cn(
            "size-full object-cover",
            view.isLocal && !preferScreen && "-scale-x-100",
          )}
        />
      ) : (
        <div className="grid size-full place-items-center text-slate-500">
          <div className="flex flex-col items-center gap-2">
            <div className="grid size-16 place-items-center rounded-full bg-slate-800 text-xl font-semibold text-slate-300">
              {(view.name || "?").slice(0, 1).toUpperCase()}
            </div>
            <VideoIcon className="size-4 opacity-40" aria-hidden />
          </div>
        </div>
      )}

      {!view.isLocal ? <audio ref={audioRef} autoPlay /> : null}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
        <span className="flex items-center gap-1.5 text-sm font-medium text-white">
          {!view.isMicEnabled ? <MicOff className="size-3.5 text-rose-300" aria-hidden /> : null}
          {view.name}
          {view.isLocal ? <span className="text-white/60">(you)</span> : null}
          {preferScreen ? <span className="text-white/60">— screen</span> : null}
        </span>
        <ConnectionDot quality={view.connectionQuality} />
      </div>
    </div>
  );
}
