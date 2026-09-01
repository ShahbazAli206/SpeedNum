"use client";

import { FileText, MessageSquare, Paperclip, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { DashboardHeader } from "@/components/dashboard/page-shell";
import { useToast } from "@/components/toast";
import { Button, EmptyState, Field, Input, Textarea } from "@/components/ui";
import { ApiError, post } from "@/lib/api";
import { AUTH_CONFIGURED } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { formatBytes, relativeTime } from "@/lib/format";
import {
  type ClientMessageAttachmentDraft,
  clientMessageAttachmentUrl,
  uploadClientMessageAttachment,
  UploadError,
} from "@/lib/storage";
import type { ClientMessage, ClientMessageAttachment } from "@/lib/types";

interface PendingUpload {
  key: string;
  name: string;
  size: number;
  status: "uploading" | "done" | "error";
  draft?: ClientMessageAttachmentDraft;
}

export function MessagesClient({ messages }: { messages: ClientMessage[] }) {
  const toast = useToast();
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [sending, setSending] = useState(false);
  const markedRef = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const keySeq = useRef(0);

  // Oldest → newest so the conversation reads top to bottom.
  const thread = useMemo(
    () => [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [messages],
  );

  // Mark the firm's messages read once, on open, so the portal bell badge clears.
  useEffect(() => {
    if (!AUTH_CONFIGURED || markedRef.current) return;
    const unread = messages.filter((m) => !m.is_from_client && !m.is_read);
    if (unread.length === 0) return;
    markedRef.current = true;
    Promise.all(unread.map((m) => post(`/client-portal/messages/${m.id}/read`)))
      .then(() => router.refresh())
      .catch(() => {
        markedRef.current = false;
      });
  }, [messages, router]);

  const onPickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!AUTH_CONFIGURED) {
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
          const draft = await uploadClientMessageAttachment(file);
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
    if (!trimmed && drafts.length === 0) return;
    if (pending.some((item) => item.status === "uploading")) {
      toast.info("Still uploading", "Wait for the attachments to finish, then send.");
      return;
    }
    if (!AUTH_CONFIGURED) {
      toast.info("Demo mode", "Connect a backend to send a real message to your accountant.");
      return;
    }
    setSending(true);
    try {
      await post("/client-portal/messages", {
        subject: subject.trim() || null,
        body: trimmed,
        attachments: drafts,
      });
      toast.success("Message sent", "Your accountant will see this the next time they sign in.");
      setSubject("");
      setBody("");
      setPending([]);
      router.refresh();
    } catch (error) {
      toast.error("Couldn't send that message", error instanceof ApiError ? error.message : "Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <DashboardHeader
        title="Messages"
        subtitle="A two-way line to your accountant — ask a question, or reply to theirs"
      />

      <section className="rounded-xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
        <div className="space-y-4">
          <Field label="Subject" hint="Optional">
            <Input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="e.g. Question about my invoice"
            />
          </Field>
          <Field label="Message" hint={pending.some((item) => item.status === "done") ? "Optional if you're only sending a file" : undefined}>
            <Textarea
              rows={4}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Write your message here…"
            />
          </Field>

          {pending.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
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
                  <span className="max-w-[10rem] truncate">{item.name}</span>
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

          <div className="flex items-center justify-between gap-2">
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
      </section>

      <section className="mt-6 rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">Conversation</h2>
          <p className="mt-0.5 text-[13px] text-muted">Everything you and your accountant have exchanged</p>
        </div>
        {thread.length === 0 ? (
          <EmptyState
            title="No messages yet"
            description="Anything you send here goes straight to your accountant, and their replies show up here."
          />
        ) : (
          <div className="space-y-3 px-5 py-4">
            {thread.map((item) => (
              <div
                key={item.id}
                className={cn("flex flex-col", item.is_from_client ? "items-end" : "items-start")}
              >
                <div
                  className={cn(
                    "flex max-w-[80%] gap-2.5 rounded-2xl px-3.5 py-2 text-[13px]",
                    item.is_from_client
                      ? "rounded-tr-sm bg-brand text-white"
                      : "rounded-tl-sm bg-surface-2 text-ink",
                  )}
                >
                  {!item.is_from_client ? (
                    <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                      <MessageSquare className="size-3.5" />
                    </span>
                  ) : null}
                  <span className="min-w-0">
                    {item.subject ? (
                      <span className="mb-0.5 block font-semibold">{item.subject}</span>
                    ) : null}
                    {item.body ? <span className="block whitespace-pre-wrap">{item.body}</span> : null}
                    {item.attachments.length > 0 ? (
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        {item.attachments.map((attachment) => (
                          <button
                            key={attachment.id}
                            type="button"
                            onClick={() => void openAttachment(attachment)}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] transition",
                              item.is_from_client
                                ? "border-white/30 bg-white/10 text-white hover:bg-white/20"
                                : "border-line bg-surface text-ink-soft hover:bg-surface hover:text-ink",
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
                  </span>
                </div>
                <span className="mt-1 px-1 text-[11px] text-muted">
                  {item.is_from_client ? "You" : item.sender_name} · {relativeTime(item.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
