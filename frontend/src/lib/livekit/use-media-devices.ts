"use client";

/**
 * useMediaDevices — enumerate and switch the mic / camera / speaker (spec
 * §22). Wraps LiveKit's Room.switchActiveDevice plus the browser's
 * enumerateDevices so a component never touches navigator.mediaDevices
 * directly.
 *
 * Labels are only populated by the browser after permission has been granted
 * for that kind of device, so the list is (re)read whenever the room's active
 * devices change, not just once on mount.
 */

import { useCallback, useEffect, useState } from "react";

import { type Room } from "livekit-client";

export type MediaDeviceKind = "audioinput" | "videoinput" | "audiooutput";

export interface DeviceOption {
  deviceId: string;
  label: string;
}

export interface UseMediaDevices {
  microphones: DeviceOption[];
  cameras: DeviceOption[];
  speakers: DeviceOption[];
  activeMicrophoneId: string | undefined;
  activeCameraId: string | undefined;
  activeSpeakerId: string | undefined;
  selectMicrophone: (deviceId: string) => Promise<void>;
  selectCamera: (deviceId: string) => Promise<void>;
  selectSpeaker: (deviceId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

function label(d: MediaDeviceInfo, fallback: string): string {
  return d.label || `${fallback} ${d.deviceId.slice(0, 6)}`;
}

export function useMediaDevices(room: Room | null): UseMediaDevices {
  const [microphones, setMicrophones] = useState<DeviceOption[]>([]);
  const [cameras, setCameras] = useState<DeviceOption[]>([]);
  const [speakers, setSpeakers] = useState<DeviceOption[]>([]);
  const [activeMicrophoneId, setActiveMic] = useState<string>();
  const [activeCameraId, setActiveCam] = useState<string>();
  const [activeSpeakerId, setActiveSpeaker] = useState<string>();

  const refresh = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    setMicrophones(
      devices.filter((d) => d.kind === "audioinput").map((d) => ({ deviceId: d.deviceId, label: label(d, "Microphone") })),
    );
    setCameras(
      devices.filter((d) => d.kind === "videoinput").map((d) => ({ deviceId: d.deviceId, label: label(d, "Camera") })),
    );
    setSpeakers(
      devices.filter((d) => d.kind === "audiooutput").map((d) => ({ deviceId: d.deviceId, label: label(d, "Speaker") })),
    );
    // The browser reports which device is currently active only via the live
    // track's settings; read them off the room when connected.
    if (room) {
      setActiveMic(room.getActiveDevice("audioinput"));
      setActiveCam(room.getActiveDevice("videoinput"));
      setActiveSpeaker(room.getActiveDevice("audiooutput"));
    }
  }, [room]);

  useEffect(() => {
    void refresh();
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return;
    const onChange = () => void refresh();
    navigator.mediaDevices.addEventListener?.("devicechange", onChange);
    return () => navigator.mediaDevices.removeEventListener?.("devicechange", onChange);
  }, [refresh]);

  const select = useCallback(
    async (kind: MediaDeviceKind, deviceId: string) => {
      if (!room) return;
      await room.switchActiveDevice(kind, deviceId);
      await refresh();
    },
    [room, refresh],
  );

  return {
    microphones,
    cameras,
    speakers,
    activeMicrophoneId,
    activeCameraId,
    activeSpeakerId,
    selectMicrophone: (id) => select("audioinput", id),
    selectCamera: (id) => select("videoinput", id),
    selectSpeaker: (id) => select("audiooutput", id),
    refresh,
  };
}
