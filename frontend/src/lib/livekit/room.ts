"use client";

/**
 * LiveKit Room construction and the video-quality policy — the one module
 * that encodes the spec's quality philosophy (§3–§6) in one place.
 *
 * Nothing here talks to the SpidNums API; it only knows LiveKit. The token
 * and URL come from lib/calls-api.ts (getCallToken); this turns them into a
 * connected, correctly-configured Room.
 */

import {
  type LocalVideoTrack,
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  type RoomConnectOptions,
  type RoomOptions,
  type VideoResolution,
} from "livekit-client";

/** The user-facing quality choices (spec §4). "auto" is the default and
 *  means "let the network decide, up to 1080" — NOT "force 1080". */
export type QualityMode = "auto" | "360" | "720" | "1080";

export const QUALITY_MODES: { value: QualityMode; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "360", label: "360p" },
  { value: "720", label: "720p" },
  { value: "1080", label: "1080p" },
];

/** The capture resolution a quality choice CAPS the local camera publish at.
 *  "auto" targets 720 (spec §3's normal target) but — crucially — leaves
 *  simulcast + dynacast to send lower layers and drop unused ones, so the
 *  network still decides the delivered quality. Selecting 1080 means "allow
 *  up to 1080", never "force it" (spec §4). */
export function captureResolutionFor(mode: QualityMode): VideoResolution {
  switch (mode) {
    case "360":
      return VideoPresets.h360.resolution;
    case "1080":
      return VideoPresets.h1080.resolution;
    case "720":
    case "auto":
    default:
      return VideoPresets.h720.resolution;
  }
}

/**
 * Build the Room with the spec's adaptation features switched on:
 *   - adaptiveStream: subscribed video quality follows each video element's
 *     rendered size/visibility — this alone satisfies "don't send 1080 to a
 *     tiny thumbnail" (§5, §25) and is why the quality selector never has to
 *     recreate remote subscriptions (§4).
 *   - dynacast: stop transmitting simulcast layers nobody is consuming (§5).
 *   - simulcast publish: multiple resolution layers so the SFU can hand each
 *     receiver the layer their network sustains, and so degradation drops a
 *     layer rather than the whole track (§6).
 * Audio is left at LiveKit's defaults (Opus, with its own DTX/red) — audio is
 * the thing we protect, never the thing we degrade first (§3, §6).
 */
export function createCallRoom(initialQuality: QualityMode = "auto"): Room {
  const options: RoomOptions = {
    adaptiveStream: true,
    dynacast: true,
    videoCaptureDefaults: {
      resolution: captureResolutionFor(initialQuality),
    },
    publishDefaults: {
      simulcast: true,
      // Explicit low layers so a poor receiver always has a 180p/360p option
      // to fall back to before the track is dropped entirely (§6).
      videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
      // VP8/H.264 breadth over AV1 for v1 (§5 — "Do not make AV1 a
      // requirement for v1"). red (audio redundancy) stays on for resilience.
      red: true,
      dtx: true,
    },
    // Stop capture tracks when the tab is hidden to save the user's uplink,
    // but keep them ready to resume — LiveKit handles the resume on focus.
    stopLocalTrackOnUnpublish: true,
  };
  return new Room(options);
}

export const CONNECT_OPTIONS: RoomConnectOptions = {
  // Let the SDK pre-warm the connection; autoSubscribe so remote tracks
  // arrive without per-track subscribe calls (adaptiveStream still governs
  // their quality).
  autoSubscribe: true,
};

/** Re-apply a quality cap to an already-connected room by restarting the
 *  local camera track at the new capture resolution. Only the LOCAL publish
 *  is touched — remote/received video keeps flowing under adaptiveStream, so
 *  this never "recreates camera tracks" on the receiving side (§4). Safe to
 *  call when the camera is off (no-op until it's next enabled). */
export async function applyQualityCap(room: Room, mode: QualityMode): Promise<void> {
  const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
  // getTrackPublication is typed to the base publication; on the local
  // participant the camera track is always a LocalVideoTrack, which is the
  // one that carries restartTrack.
  const track = pub?.videoTrack as LocalVideoTrack | undefined;
  if (!track) return;
  await track.restartTrack({ resolution: captureResolutionFor(mode) });
}

/** Opaque LiveKit identity <-> SpidNums profile id (spec §19). Must match
 *  backend services/livekit_tokens.py::participant_identity exactly. */
export function profileIdFromIdentity(identity: string): string | null {
  return identity.startsWith("profile_") ? identity.slice("profile_".length) : null;
}

export { Room, RoomEvent, Track };
