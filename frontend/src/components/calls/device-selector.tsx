"use client";

import { Camera, Mic, Volume2 } from "lucide-react";

import type { UseMediaDevices } from "@/lib/livekit/use-media-devices";
import { cn } from "@/lib/cn";

/**
 * Mic / camera / speaker pickers (spec §22). Speaker selection is only shown
 * when the browser actually reports output devices (Firefox and some mobile
 * browsers don't expose setSinkId / audiooutput enumeration).
 */
export function DeviceSelector({ devices, className }: { devices: UseMediaDevices; className?: string }) {
  const row = "flex items-center gap-2 text-sm";
  const select =
    "min-w-0 flex-1 rounded-lg border border-white/15 bg-white/10 px-2 py-1.5 text-white focus:outline-none focus:ring-2 focus:ring-white/30";

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <label className={row}>
        <Mic className="size-4 shrink-0 text-white/70" aria-hidden />
        <select
          className={select}
          value={devices.activeMicrophoneId ?? ""}
          onChange={(e) => void devices.selectMicrophone(e.target.value)}
        >
          {devices.microphones.map((d) => (
            <option key={d.deviceId} value={d.deviceId} className="text-black">
              {d.label}
            </option>
          ))}
        </select>
      </label>

      <label className={row}>
        <Camera className="size-4 shrink-0 text-white/70" aria-hidden />
        <select
          className={select}
          value={devices.activeCameraId ?? ""}
          onChange={(e) => void devices.selectCamera(e.target.value)}
        >
          {devices.cameras.map((d) => (
            <option key={d.deviceId} value={d.deviceId} className="text-black">
              {d.label}
            </option>
          ))}
        </select>
      </label>

      {devices.speakers.length > 0 ? (
        <label className={row}>
          <Volume2 className="size-4 shrink-0 text-white/70" aria-hidden />
          <select
            className={select}
            value={devices.activeSpeakerId ?? ""}
            onChange={(e) => void devices.selectSpeaker(e.target.value)}
          >
            {devices.speakers.map((d) => (
              <option key={d.deviceId} value={d.deviceId} className="text-black">
                {d.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
