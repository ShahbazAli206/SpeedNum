"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { endCall as endCallApi, getCall, getCallToken, removeParticipant } from "@/lib/calls-api";
import { profileIdFromIdentity, type Room } from "@/lib/livekit/room";
import { useCall, type ParticipantView } from "@/lib/livekit/use-call";
import { useMediaDevices } from "@/lib/livekit/use-media-devices";
import { cn } from "@/lib/cn";

import { CallControls } from "./call-controls";
import { ConnectionIndicator } from "./connection-indicator";
import { InviteParticipant } from "./invite-participant";
import { ParticipantList } from "./participant-list";
import { VideoGrid } from "./video-grid";

type Panel = "none" | "participants" | "chat";

/** getUserMedia rejects with a DOMException; map the common ones to copy a
 *  user can actually act on instead of a silent "stays off" toggle. */
function mediaErrorHint(err: unknown): string {
  const name = err instanceof DOMException ? err.name : undefined;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera/microphone access was blocked. Allow access in your browser's site settings, then retry.";
  }
  if (name === "NotFoundError") {
    return "No camera or microphone was found on this device.";
  }
  if (name === "NotReadableError") {
    return "Your camera or microphone is already in use by another app.";
  }
  return err instanceof Error && err.message ? err.message : "Could not access your camera or microphone.";
}

/**
 * The full in-call surface: fetches a LiveKit token for `callId`, connects,
 * and renders the video grid, connection state, control bar and side panels.
 * Owns the media session for as long as it is mounted — closing it (leave, or
 * the parent unmounting it) tears the LiveKit room down and tells the backend
 * the caller left.
 *
 * `renderChat` is injected by the parent (wired in Phase 11) so this file
 * doesn't hard-depend on the chat feature; until then the chat toggle shows a
 * short placeholder.
 */
export function CallWindow({
  callId,
  myProfileId,
  onClose,
  renderChat,
}: {
  callId: string;
  myProfileId: string | null;
  onClose: () => void;
  renderChat?: (args: { room: Room | null; onUnreadChange: (n: number) => void; visible: boolean }) => ReactNode;
}) {
  const call = useCall();
  const devices = useMediaDevices(call.room);
  const [panel, setPanel] = useState<Panel>("none");
  const [canModerate, setCanModerate] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [fatal, setFatal] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [callType, setCallType] = useState<"audio" | "video">("video");
  const connectOnce = useRef(false);

  // Fetch a token and join, exactly once per mount. getCallToken is also the
  // server-side "join" transition (backend calls.py), so this is what marks
  // the caller present.
  useEffect(() => {
    if (connectOnce.current) return;
    connectOnce.current = true;
    (async () => {
      try {
        const [{ livekit_url, token }, session] = await Promise.all([getCallToken(callId), getCall(callId)]);
        setCanModerate(!!myProfileId && session.initiator_profile_id === myProfileId);
        setCallType(session.call_type);
        await call.connect(livekit_url, token);
        // Enable mic and camera on join for a video call; the user can mute
        // immediately after. A pure audio call leaves the camera off. A
        // getUserMedia failure (permission denied, no device, device busy)
        // must not silently leave mic/camera showing "off" with no
        // explanation — surface it so the user can actually fix it.
        await call.toggleMic().catch((err) => setMediaError(mediaErrorHint(err)));
        if (session.call_type === "video") {
          await call.toggleCamera().catch((err) => setMediaError(mediaErrorHint(err)));
        }
      } catch (err) {
        setFatal(err instanceof Error ? err.message : "Could not join the call.");
      }
    })();
    // call/callId are stable for this window's lifetime; connectOnce guards re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId]);

  const retryMedia = useCallback(async () => {
    setMediaError(null);
    if (!call.isMicEnabled) await call.toggleMic().catch((err) => setMediaError(mediaErrorHint(err)));
    if (callType === "video" && !call.isCameraEnabled) {
      await call.toggleCamera().catch((err) => setMediaError(mediaErrorHint(err)));
    }
  }, [call, callType]);

  // When the call ends for everyone (or the local user is removed), close.
  useEffect(() => {
    if (call.connectionState === "disconnected" && connectOnce.current && !fatal) {
      onClose();
    }
  }, [call.connectionState, fatal, onClose]);

  const leave = useCallback(async () => {
    await endCallApi(callId).catch(() => {});
    await call.disconnect();
    onClose();
  }, [callId, call, onClose]);

  const remove = useCallback(
    async (view: ParticipantView) => {
      const pid = profileIdFromIdentity(view.identity);
      if (pid) await removeParticipant(callId, pid).catch(() => {});
    },
    [callId],
  );

  return (
    <div className="fixed inset-0 z-100 flex flex-col bg-slate-950 text-white">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <ConnectionIndicator state={call.connectionState} ownQuality={call.localView?.connectionQuality} />
        <button
          type="button"
          onClick={() => void leave()}
          aria-label="Close call"
          className="rounded-lg p-1.5 text-white/70 hover:bg-white/10"
        >
          <X className="size-5" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 gap-3 px-4">
        <div className="min-w-0 flex-1">
          {fatal ? (
            <div className="grid h-full place-items-center text-center">
              <div>
                <p className="text-lg font-semibold">Couldn&apos;t join the call</p>
                <p className="mt-1 text-white/60">{fatal}</p>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-4 rounded-full bg-white px-4 py-2 font-semibold text-slate-900"
                >
                  Close
                </button>
              </div>
            </div>
          ) : call.allViews.length === 0 ? (
            <div className="grid h-full place-items-center text-white/50">Connecting…</div>
          ) : (
            <VideoGrid views={call.allViews} className="h-full" />
          )}
        </div>

        {panel !== "none" ? (
          <aside className="flex w-72 shrink-0 flex-col rounded-xl bg-slate-900 p-3 ring-1 ring-white/10">
            {panel === "participants" ? (
              <>
                <h2 className="mb-1 text-sm font-semibold text-white/80">In this call</h2>
                <ParticipantList views={call.allViews} canRemove={canModerate} onRemove={(v) => void remove(v)} />
                <InviteParticipant
                  callId={callId}
                  alreadyInCallProfileIds={call.allViews
                    .map((v) => profileIdFromIdentity(v.identity))
                    .filter((id): id is string => !!id)}
                />
              </>
            ) : null}
            {panel === "chat" ? (
              renderChat ? (
                renderChat({ room: call.room, onUnreadChange: setChatUnread, visible: true })
              ) : (
                <p className="text-sm text-white/50">In-call chat is enabled once connected.</p>
              )
            ) : null}
          </aside>
        ) : null}
      </div>

      {mediaError ? (
        <div className="mx-4 mb-2 flex items-center justify-between gap-3 rounded-lg bg-amber-500/15 px-3 py-2 text-[13px] text-amber-200 ring-1 ring-amber-500/30">
          <span>{mediaError}</span>
          <button
            type="button"
            onClick={() => void retryMedia()}
            className="shrink-0 rounded-full bg-amber-500/20 px-3 py-1 font-semibold text-amber-100 hover:bg-amber-500/30"
          >
            Retry
          </button>
        </div>
      ) : null}

      <footer className={cn("px-4 py-4", call.isReconnecting && "opacity-90")}>
        <CallControls
          call={call}
          devices={devices}
          onLeave={() => void leave()}
          onToggleParticipants={() => setPanel((p) => (p === "participants" ? "none" : "participants"))}
          onToggleChat={() => {
            setPanel((p) => (p === "chat" ? "none" : "chat"));
            setChatUnread(0);
          }}
          participantCount={call.allViews.length}
          chatUnread={chatUnread}
        />
      </footer>

      {/* Keep chat mounted (hidden) while another panel is open so its live
          data-channel subscription and unread counter keep running. */}
      {panel !== "chat" && renderChat ? (
        <div className="hidden">{renderChat({ room: call.room, onUnreadChange: setChatUnread, visible: false })}</div>
      ) : null}
    </div>
  );
}
