"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  acceptCall,
  createCall,
  declineCall,
  listRingingCalls,
  type CallSession,
  type CallType,
} from "@/lib/calls-api";
import { useSession } from "@/lib/session";

import { CallChat } from "./call-chat";
import { CallWindow } from "./call-window";
import { IncomingCall } from "./incoming-call";

/**
 * The one component that decides when a call surface is on screen (spec §20).
 * Mounted once per shell (firm + portal), inside SessionProvider.
 *
 * - `startCall(...)` creates a call and opens the CallWindow (the caller joins
 *   their own room and waits — the "outgoing ringing" state is the window
 *   showing just themselves until a callee joins).
 * - A short poll of `GET /calls?status=ringing` surfaces an incoming call as a
 *   ring modal, backed by the existing Notification feed for the persistent /
 *   was-offline case (Phase 0 decision — no new push channel). The poll only
 *   runs while no call window is open, so an in-progress call never triggers a
 *   ring for itself.
 */

const RING_POLL_MS = 5_000;

interface CallContextValue {
  startCall: (inviteeProfileIds: string[], type?: CallType) => Promise<void>;
  /** True while any call surface (outgoing/in-call) is open. */
  inCall: boolean;
}

const CallContext = createContext<CallContextValue | null>(null);

export function useCalls(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCalls must be used within <CallProvider>");
  return ctx;
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { me, isLive } = useSession();
  const myProfileId = me?.profile.id ?? null;

  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<CallSession | null>(null);
  // Calls this user has already dismissed/handled, so a declined call that is
  // still briefly "ringing" server-side doesn't immediately re-prompt.
  const dismissed = useRef<Set<string>>(new Set());

  const startCall = useCallback(
    async (inviteeProfileIds: string[], type: CallType = "video") => {
      if (!inviteeProfileIds.length) return;
      const call = await createCall({ invitee_profile_ids: inviteeProfileIds, call_type: type });
      setActiveCallId(call.id);
    },
    [],
  );

  // Poll for an incoming call while idle. A call I initiated never rings me
  // (I'm its initiator); anything I've dismissed is ignored until it leaves
  // the ringing set.
  useEffect(() => {
    if (!isLive || !myProfileId || activeCallId) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const ringing = await listRingingCalls();
        if (cancelled) return;
        const forMe = ringing.find((c) => {
          if (c.initiator_profile_id === myProfileId) return false;
          if (dismissed.current.has(c.id)) return false;
          const mine = c.participants.find((p) => p.profile_id === myProfileId);
          return mine && (mine.status === "ringing" || mine.status === "invited");
        });
        setIncoming(forMe ?? null);
      } catch {
        // A transient failure just means no ring this tick; the next one retries.
      }
    };

    void tick();
    const id = window.setInterval(tick, RING_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isLive, myProfileId, activeCallId]);

  const onAccept = useCallback(async () => {
    if (!incoming) return;
    const id = incoming.id;
    setIncoming(null);
    await acceptCall(id).catch(() => {});
    setActiveCallId(id);
  }, [incoming]);

  const onDecline = useCallback(async () => {
    if (!incoming) return;
    const id = incoming.id;
    dismissed.current.add(id);
    setIncoming(null);
    await declineCall(id).catch(() => {});
  }, [incoming]);

  const closeWindow = useCallback(() => {
    if (activeCallId) dismissed.current.add(activeCallId);
    setActiveCallId(null);
  }, [activeCallId]);

  const value = useMemo<CallContextValue>(
    () => ({ startCall, inCall: !!activeCallId }),
    [startCall, activeCallId],
  );

  return (
    <CallContext.Provider value={value}>
      {children}

      {/* An incoming ring only shows while no call window is open. */}
      {incoming && !activeCallId ? (
        <IncomingCall call={incoming} onAccept={() => void onAccept()} onDecline={() => void onDecline()} />
      ) : null}

      {activeCallId ? (
        <CallWindow
          callId={activeCallId}
          myProfileId={myProfileId}
          onClose={closeWindow}
          renderChat={({ room, onUnreadChange, visible }) => (
            <CallChat room={room} callId={activeCallId} visible={visible} onUnreadChange={onUnreadChange} />
          )}
        />
      ) : null}
    </CallContext.Provider>
  );
}
