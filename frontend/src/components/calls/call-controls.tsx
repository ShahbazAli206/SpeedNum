"use client";

import {
  Mic,
  MicOff,
  MessageSquare,
  PhoneOff,
  Settings2,
  Users,
  Video,
  VideoOff,
  WifiLow,
} from "lucide-react";
import { useState } from "react";

import type { UseCall } from "@/lib/livekit/use-call";
import type { UseMediaDevices } from "@/lib/livekit/use-media-devices";
import { cn } from "@/lib/cn";

import { ControlButton } from "./control-button";
import { DeviceSelector } from "./device-selector";
import { QualitySelector } from "./quality-selector";
import { ScreenShareButton } from "./screen-share-button";

/**
 * The in-call control bar (spec §22): mic, camera, screen-share, quality,
 * device/settings, low-data toggle, participants, chat, and hang-up. The
 * participants/chat toggles and their unread/count badges are driven from the
 * parent (CallWindow) so the panels live there.
 */
export function CallControls({
  call,
  devices,
  onLeave,
  onToggleParticipants,
  onToggleChat,
  participantCount,
  chatUnread = 0,
  className,
}: {
  call: UseCall;
  devices: UseMediaDevices;
  onLeave: () => void;
  onToggleParticipants: () => void;
  onToggleChat: () => void;
  participantCount: number;
  chatUnread?: number;
  className?: string;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-2 sm:gap-3", className)}>
      <ControlButton
        label={call.isMicEnabled ? "Mute microphone" : "Unmute microphone"}
        onClick={() => void call.toggleMic()}
        muted={!call.isMicEnabled}
        icon={call.isMicEnabled ? <Mic className="size-5" /> : <MicOff className="size-5" />}
      />
      <ControlButton
        label={call.isCameraEnabled ? "Turn camera off" : "Turn camera on"}
        onClick={() => void call.toggleCamera()}
        muted={!call.isCameraEnabled}
        icon={call.isCameraEnabled ? <Video className="size-5" /> : <VideoOff className="size-5" />}
      />
      <ScreenShareButton active={call.isScreenSharing} onToggle={() => void call.toggleScreenShare()} />

      <ControlButton
        label={call.lowDataMode ? "Leave low-data mode" : "Low-data mode"}
        onClick={() => void call.setLowDataMode(!call.lowDataMode)}
        active={call.lowDataMode}
        icon={<WifiLow className="size-5" />}
      />

      <div className="relative">
        <ControlButton
          label="Devices and quality"
          onClick={() => setSettingsOpen((v) => !v)}
          active={settingsOpen}
          icon={<Settings2 className="size-5" />}
        />
        {settingsOpen ? (
          <div className="absolute bottom-full left-1/2 z-20 mb-2 w-72 -translate-x-1/2 rounded-xl bg-slate-800 p-4 shadow-xl ring-1 ring-white/10">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">Video quality</p>
            <QualitySelector value={call.quality} onChange={(m) => void call.setQuality(m)} />
            <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-white/50">Devices</p>
            <DeviceSelector devices={devices} />
          </div>
        ) : null}
      </div>

      <ControlButton
        label={`Participants (${participantCount})`}
        onClick={onToggleParticipants}
        icon={
          <span className="relative">
            <Users className="size-5" />
            <span className="absolute -right-2 -top-2 grid min-w-4 place-items-center rounded-full bg-white/20 px-1 text-[10px] font-bold">
              {participantCount}
            </span>
          </span>
        }
      />

      <ControlButton
        label="Chat"
        onClick={onToggleChat}
        icon={
          <span className="relative">
            <MessageSquare className="size-5" />
            {chatUnread > 0 ? (
              <span className="absolute -right-2 -top-2 grid min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold">
                {chatUnread > 9 ? "9+" : chatUnread}
              </span>
            ) : null}
          </span>
        }
      />

      <ControlButton
        label="Leave call"
        onClick={onLeave}
        danger
        icon={<PhoneOff className="size-5" />}
      />
    </div>
  );
}
