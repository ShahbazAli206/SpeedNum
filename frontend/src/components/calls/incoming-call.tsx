"use client";

import { Phone, PhoneOff, Video } from "lucide-react";

import type { CallSession } from "@/lib/calls-api";

/**
 * The incoming-call ring (spec §20). Surfaced by CallProvider's ringing poll.
 * Shows who's calling (the initiator participant) and offers accept/decline.
 * The persistent record of a missed/handled call is the existing Notification
 * feed — this modal is only the live "your phone is ringing" moment.
 */
export function IncomingCall({
  call,
  onAccept,
  onDecline,
}: {
  call: CallSession;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const initiator = call.participants.find((p) => p.profile_id === call.initiator_profile_id);
  const callerName = initiator?.full_name || initiator?.email || "Someone";
  const isVideo = call.call_type === "video";

  return (
    <div className="fixed inset-x-0 bottom-6 z-110 mx-auto w-[min(92vw,26rem)] rounded-2xl bg-slate-900 p-5 text-white shadow-2xl ring-1 ring-white/10">
      <div className="flex items-center gap-4">
        <span className="relative grid size-14 shrink-0 place-items-center rounded-full bg-white/10 text-xl font-semibold">
          {callerName.slice(0, 1).toUpperCase()}
          <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/30" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{callerName}</p>
          <p className="flex items-center gap-1.5 text-sm text-white/60">
            {isVideo ? <Video className="size-4" aria-hidden /> : <Phone className="size-4" aria-hidden />}
            Incoming {isVideo ? "video" : "audio"} call…
          </p>
        </div>
      </div>

      <div className="mt-5 flex gap-3">
        <button
          type="button"
          onClick={onDecline}
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-rose-600 px-4 py-2.5 font-semibold hover:bg-rose-500"
        >
          <PhoneOff className="size-5" aria-hidden />
          Decline
        </button>
        <button
          type="button"
          onClick={onAccept}
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-2.5 font-semibold hover:bg-emerald-500"
        >
          <Phone className="size-5" aria-hidden />
          Accept
        </button>
      </div>
    </div>
  );
}
