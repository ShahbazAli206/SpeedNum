"use client";

import { Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { listChat, postChat, type CallMessage } from "@/lib/calls-api";
import { RoomEvent, type Room } from "@/lib/livekit/room";

/**
 * In-call chat (spec §16). Two paths, on purpose:
 *   - LIVE delivery is LiveKit's data channel — publishData / DataReceived —
 *     so a message appears instantly for everyone in the room, no polling.
 *   - PERSISTENCE is a POST to the backend, so the transcript survives a
 *     reload/rejoin. History is loaded once from the backend on mount.
 *
 * The two are reconciled by message id: an echoed persist of our own message
 * is de-duplicated, and a live message we later also see in history won't
 * double up.
 */

const CHAT_TOPIC = "chat";

interface WireMessage {
  id: string;
  senderName: string;
  message: string;
  createdAt: string;
}

export function CallChat({
  room,
  callId,
  visible,
  onUnreadChange,
}: {
  room: Room | null;
  callId: string;
  visible: boolean;
  onUnreadChange: (n: number) => void;
}) {
  const [messages, setMessages] = useState<CallMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const seen = useRef<Set<string>>(new Set());
  const unread = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const append = useCallback(
    (msg: CallMessage, fromRemote: boolean) => {
      if (msg.id && seen.current.has(msg.id)) return;
      if (msg.id) seen.current.add(msg.id);
      setMessages((prev) => [...prev, msg]);
      if (fromRemote && !visible) {
        unread.current += 1;
        onUnreadChange(unread.current);
      }
    },
    [visible, onUnreadChange],
  );

  // Load persisted history once.
  useEffect(() => {
    let cancelled = false;
    listChat(callId)
      .then((rows) => {
        if (cancelled) return;
        rows.forEach((r) => r.id && seen.current.add(r.id));
        setMessages(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [callId]);

  // Subscribe to live data-channel messages.
  useEffect(() => {
    if (!room) return;
    const decoder = new TextDecoder();
    const onData = (payload: Uint8Array, _participant?: unknown, _kind?: unknown, topic?: string) => {
      if (topic && topic !== CHAT_TOPIC) return;
      try {
        const wire = JSON.parse(decoder.decode(payload)) as WireMessage;
        append(
          {
            id: wire.id,
            sender_profile_id: null,
            sender_name: wire.senderName,
            message: wire.message,
            created_at: wire.createdAt,
          },
          true,
        );
      } catch {
        // Non-chat / malformed data payloads are ignored.
      }
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room, append]);

  // Clear unread whenever the panel is visible.
  useEffect(() => {
    if (visible) {
      unread.current = 0;
      onUnreadChange(0);
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [visible, messages.length, onUnreadChange]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft("");
    try {
      // Persist first so we get the canonical id, then broadcast that id over
      // the data channel so remotes de-dupe against a later history load.
      const saved = await postChat(callId, text);
      append(saved, false);
      if (room) {
        const wire: WireMessage = {
          id: saved.id,
          senderName: saved.sender_name ?? "You",
          message: saved.message,
          createdAt: saved.created_at ?? new Date().toISOString(),
        };
        const payload = new TextEncoder().encode(JSON.stringify(wire));
        await room.localParticipant
          .publishData(payload, { reliable: true, topic: CHAT_TOPIC })
          .catch(() => {});
      }
    } catch {
      // Restore the draft so a failed send isn't silently lost.
      setDraft(text);
    } finally {
      setSending(false);
    }
  }, [draft, sending, callId, room, append]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <h2 className="mb-2 text-sm font-semibold text-white/80">Chat</h2>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <p className="text-sm text-white/40">No messages yet.</p>
        ) : (
          messages.map((m, i) => (
            <div key={m.id || i} className="text-sm">
              <span className="font-medium text-white/90">{m.sender_name ?? "Someone"}</span>
              <p className="whitespace-pre-wrap break-words text-white/70">{m.message}</p>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
      <form
        className="mt-2 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message"
          maxLength={2000}
          className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          aria-label="Send message"
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-slate-900 disabled:opacity-50"
        >
          <Send className="size-4" />
        </button>
      </form>
    </div>
  );
}
