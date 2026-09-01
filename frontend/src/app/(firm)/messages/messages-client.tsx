"use client";

import { FileText, MessageSquare, Paperclip, Plus, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { DashboardHeader } from "@/components/dashboard/page-shell";
import { useToast } from "@/components/toast";
import { Button, EmptyState, Textarea } from "@/components/ui";
import { post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatBytes, relativeTime } from "@/lib/format";
import { useSession } from "@/lib/session";
import {
  type ClientMessageAttachmentDraft,
  clientMessageAttachmentUrl,
  uploadClientMessageAttachment,
  UploadError,
} from "@/lib/storage";
import type { Client, ClientMessage, ClientMessageAttachment } from "@/lib/types";

/** Pull a human-readable reason out of an ApiError without leaking `[object]`. */
function reason(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** The sidebar's one-line preview — falls back to an attachment count for a
 * file-only message, which otherwise previews as a blank line. */
function lastMessagePreview(message: ClientMessage | undefined) {
  if (!message) return "";
  if (message.body) return message.body;
  const count = message.attachments.length;
  return count ? `📎 ${count} attachment${count === 1 ? "" : "s"}` : "";
}

interface PendingUpload {
  key: string;
  name: string;
  size: number;
  status: "uploading" | "done" | "error";
  draft?: ClientMessageAttachmentDraft;
}

interface Conversation {
  clientId: string;
  clientName: string;
  messages: ClientMessage[]; // oldest → newest
  unread: number;
  lastAt: string;
}

function buildConversations(
  messages: ClientMessage[],
  read: Record<string, boolean>,
): Conversation[] {
  const byClient = new Map<string, ClientMessage[]>();
  for (const m of messages) {
    const list = byClient.get(m.client_id) ?? [];
    list.push(m);
    byClient.set(m.client_id, list);
  }
  const convos = [...byClient.entries()].map(([clientId, list]) => {
    const sorted = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const unread = sorted.filter((m) => m.is_from_client && !(read[m.id] ?? m.is_read)).length;
    return {
      clientId,
      clientName: sorted[0]?.client_name ?? "Unknown client",
      messages: sorted,
      unread,
      lastAt: sorted[sorted.length - 1]?.created_at ?? "",
    };
  });
  convos.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  return convos;
}

export function MessagesClient({
  messages,
  clients,
  isLive,
}: {
  messages: ClientMessage[];
  clients: Client[];
  isLive: boolean;
}) {
  const toast = useToast();
  const session = useSession();
  const router = useRouter();

  const [read, setRead] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [sending, setSending] = useState(false);
  // Threads we've already fired "mark read" for this session, so re-selecting
  // one doesn't POST the same reads again.
  const markedRef = useRef<Set<string>>(new Set());
  const fileInput = useRef<HTMLInputElement>(null);
  const keySeq = useRef(0);

  const conversations = useMemo(() => buildConversations(messages, read), [messages, read]);

  const clientName = (id: string) => {
    const c = clients.find((client) => client.id === id);
    return c?.business_name || c?.legal_name || "client";
  };

  const activeId = selected ?? conversations[0]?.clientId ?? null;
  const active = conversations.find((c) => c.clientId === activeId) ?? null;
  // Composing to a client who has no thread yet: show an empty thread to type into.
  const composeName = composing && activeId ? clientName(activeId) : null;

  const openThread = (clientId: string) => {
    setComposing(false);
    setSelected(clientId);
    setPending([]);
    if (!isLive || markedRef.current.has(clientId)) return;
    const convo = conversations.find((c) => c.clientId === clientId);
    const unread = (convo?.messages ?? []).filter((m) => m.is_from_client && !(read[m.id] ?? m.is_read));
    if (unread.length === 0) return;
    markedRef.current.add(clientId);
    setRead((current) => ({ ...current, ...Object.fromEntries(unread.map((m) => [m.id, true])) }));
    Promise.all(unread.map((m) => post(`/client-portal/messages/${m.id}/read`)))
      .then(() => session.refresh())
      .catch(() => {
        markedRef.current.delete(clientId);
      });
  };

  const startCompose = (clientId: string) => {
    setComposing(true);
    setSelected(clientId);
    setBody("");
    setPending([]);
  };

  const onPickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !activeId) return;
    if (!isLive) {
      toast.info("Demo mode", "Connect a backend to attach files to a real message.");
      return;
    }
    const chosen = Array.from(files);
    if (fileInput.current) fileInput.current.value = "";

    await Promise.all(
      chosen.map(async (file) => {
        const key = `u${(keySeq.current += 1)}`;
        setPending((current) => [...current, { key, name: file.name, size: file.size, status: "uploading" }]);
        try {
          const draft = await uploadClientMessageAttachment(file, activeId);
          setPending((current) =>
            current.map((item) => (item.key === key ? { ...item, status: "done", draft } : item)),
          );
        } catch (error) {
          setPending((current) => current.map((item) => (item.key === key ? { ...item, status: "error" } : item)));
          const message = error instanceof UploadError ? error.message : "Upload failed.";
          toast.error(`Couldn't attach ${file.name}`, message);
        }
      }),
    );
  };

  const removePending = (key: string) => setPending((current) => current.filter((item) => item.key !== key));

  const openAttachment = async (attachment: ClientMessageAttachment) => {
    try {
      const url = await clientMessageAttachmentUrl(attachment.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Could not open that file", "The link may have expired — try again.");
    }
  };

  const send = async () => {
    const trimmed = body.trim();
    const drafts = pending.filter((item) => item.status === "done" && item.draft).map((item) => item.draft!);
    if (!activeId || (!trimmed && drafts.length === 0)) return;
    if (pending.some((item) => item.status === "uploading")) {
      toast.info("Still uploading", "Wait for the attachments to finish, then send.");
      return;
    }
    if (!isLive) {
      toast.info("Demo mode", "Connect a backend to send a real message.");
      return;
    }
    setSending(true);
    try {
      await post(`/client-portal/messages?client_id=${activeId}`, {
        subject: null,
        body: trimmed,
        attachments: drafts,
      });
      setBody("");
      setPending([]);
      setComposing(false);
      router.refresh(); // reload the server-rendered thread so the new message shows
      session.refresh(); // update the bell badge
      toast.success("Message sent", `${clientName(activeId)} will see it in their portal.`);
    } catch (error) {
      toast.error("Couldn't send that message", reason(error, "Please try again."));
    } finally {
      setSending(false);
    }
  };

  // Clients not already in a conversation — the "start a new thread" options.
  const withThread = new Set(conversations.map((c) => c.clientId));
  const newTargets = clients.filter((c) => !withThread.has(c.id));

  return (
    <>
      <DashboardHeader
        title="Messages"
        subtitle="Two-way conversations with your clients — they see your replies in their portal"
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        {/* Conversation list */}
        <section className="flex flex-col rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <h2 className="text-[14px] font-semibold text-ink">Conversations</h2>
            <div className="relative">
              <select
                aria-label="Start a new conversation with a client"
                className="cursor-pointer appearance-none rounded-lg border border-line bg-surface-2 py-1.5 pr-8 pl-2.5 text-[12.5px] font-medium text-ink"
                value=""
                onChange={(event) => {
                  if (event.target.value) startCompose(event.target.value);
                }}
              >
                <option value="">＋ New message…</option>
                {newTargets.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.business_name || c.legal_name}
                  </option>
                ))}
              </select>
              <Plus className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted" />
            </div>
          </div>

          {conversations.length === 0 && !composing ? (
            <EmptyState
              title="No conversations yet"
              description="Pick a client from “New message…” to start one, or wait for a client to write in."
            />
          ) : (
            <ul className="divide-y divide-line overflow-y-auto">
              {composing && activeId && !withThread.has(activeId) ? (
                <li>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left bg-brand-soft/30"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                      <MessageSquare className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-ink">
                        {composeName}
                      </span>
                      <span className="block text-[12px] text-muted">New message</span>
                    </span>
                  </button>
                </li>
              ) : null}
              {conversations.map((convo) => (
                <li key={convo.clientId}>
                  <button
                    type="button"
                    onClick={() => openThread(convo.clientId)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2",
                      convo.clientId === activeId && !composing && "bg-surface-2",
                    )}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-info-soft text-info">
                      <MessageSquare className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13.5px] font-semibold text-ink">
                          {convo.clientName}
                        </span>
                        {convo.unread > 0 ? (
                          <span className="shrink-0 rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white tabular-nums">
                            {convo.unread}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-muted">
                        {lastMessagePreview(convo.messages[convo.messages.length - 1])}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Thread + reply */}
        <section className="flex min-h-[28rem] flex-col rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
          {!activeId ? (
            <EmptyState
              title="No conversation selected"
              description="Choose a conversation on the left, or start a new one."
            />
          ) : (
            <>
              <div className="border-b border-line px-5 py-3.5">
                <h2 className="text-[15px] font-semibold text-ink">
                  {active?.clientName ?? composeName}
                </h2>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                {active && active.messages.length > 0 ? (
                  active.messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn("flex flex-col", m.is_from_client ? "items-start" : "items-end")}
                    >
                      <div
                        className={cn(
                          "max-w-[80%] rounded-2xl px-3.5 py-2 text-[13px] whitespace-pre-wrap",
                          m.is_from_client
                            ? "rounded-tl-sm bg-surface-2 text-ink"
                            : "rounded-tr-sm bg-brand text-white",
                        )}
                      >
                        {m.subject ? (
                          <span className="mb-0.5 block font-semibold">{m.subject}</span>
                        ) : null}
                        {m.body}
                        {m.attachments.length > 0 ? (
                          <span className="mt-1.5 flex flex-wrap gap-1.5">
                            {m.attachments.map((attachment) => (
                              <button
                                key={attachment.id}
                                type="button"
                                onClick={() => void openAttachment(attachment)}
                                className={cn(
                                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] transition",
                                  m.is_from_client
                                    ? "border-line bg-surface text-ink-soft hover:bg-surface hover:text-ink"
                                    : "border-white/30 bg-white/10 text-white hover:bg-white/20",
                                )}
                              >
                                <FileText className="size-3.5 shrink-0" />
                                <span className="max-w-48 truncate">{attachment.name}</span>
                                {attachment.size_bytes ? (
                                  <span className="opacity-75">{formatBytes(attachment.size_bytes)}</span>
                                ) : null}
                              </button>
                            ))}
                          </span>
                        ) : null}
                      </div>
                      <span className="mt-1 px-1 text-[11px] text-muted">
                        {m.is_from_client ? m.sender_name : "You"} · {relativeTime(m.created_at)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="py-8 text-center text-[13px] text-muted">
                    No messages yet — say hello to {composeName ?? active?.clientName}.
                  </p>
                )}
              </div>

              <div className="border-t border-line p-4">
                <Textarea
                  rows={3}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder={`Write a message to ${active?.clientName ?? composeName}…`}
                />

                {pending.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {pending.map((item) => (
                      <span
                        key={item.key}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px]",
                          item.status === "error"
                            ? "border-danger/40 bg-danger-soft text-danger"
                            : "border-line bg-surface-2 text-ink-soft",
                        )}
                      >
                        <FileText className="size-3.5 shrink-0 text-muted" />
                        <span className="max-w-40 truncate">{item.name}</span>
                        <span className="text-muted">
                          {item.status === "uploading"
                            ? "uploading…"
                            : item.status === "error"
                              ? "failed"
                              : formatBytes(item.size)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removePending(item.key)}
                          className="rounded p-0.5 text-muted transition hover:bg-surface hover:text-ink"
                          aria-label={`Remove ${item.name}`}
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-2 flex items-center justify-between gap-2">
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(event) => void onPickFiles(event.target.files)}
                  />
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[12.5px] font-medium text-ink-soft transition hover:bg-surface-2 hover:text-ink"
                  >
                    <Paperclip className="size-4" />
                    Attach a file
                  </button>
                  <Button
                    icon={<Send className="size-4" />}
                    loading={sending}
                    disabled={!body.trim() && !pending.some((item) => item.status === "done")}
                    onClick={send}
                  >
                    Send
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
