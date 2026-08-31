"use client";

import { FileText, Paperclip, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useToast } from "@/components/toast";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatBytes, relativeTime } from "@/lib/format";
import {
  type SupportAttachmentDraft,
  type SupportScope,
  supportAttachmentUrl,
  uploadSupportAttachment,
  UploadError,
} from "@/lib/storage";
import type { SupportAttachment, SupportMessage } from "@/lib/types";

interface PendingUpload {
  key: string;
  name: string;
  size: number;
  status: "uploading" | "done" | "error";
  draft?: SupportAttachmentDraft;
}

interface ConversationProps {
  initialMessages: SupportMessage[];
  /** Which side the viewer is on — decides which bubbles align right ("me"). */
  meIsPlatform: boolean;
  scope: SupportScope;
  /** How to label the other party's messages when the sender name is blank. */
  otherName: string;
  emptyTitle: string;
  emptyDescription: string;
  /** No backend (demo mode) — the composer explains rather than posting. */
  live?: boolean;
  onSend: (body: string, attachments: SupportAttachmentDraft[]) => Promise<SupportMessage>;
}

function reason(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function Conversation({
  initialMessages,
  meIsPlatform,
  scope,
  otherName,
  emptyTitle,
  emptyDescription,
  live = true,
  onSend,
}: ConversationProps) {
  const toast = useToast();
  const [messages, setMessages] = useState<SupportMessage[]>(initialMessages);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [sending, setSending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const keySeq = useRef(0);

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const openAttachment = async (attachment: SupportAttachment) => {
    try {
      const url = await supportAttachmentUrl(scope, attachment.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error("Could not open that file", reason(error, "The link may have expired — try again."));
    }
  };

  const onPickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!live) {
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
          const draft = await uploadSupportAttachment(scope, file);
          setPending((current) =>
            current.map((item) => (item.key === key ? { ...item, status: "done", draft } : item)),
          );
        } catch (error) {
          setPending((current) => current.map((item) => (item.key === key ? { ...item, status: "error" } : item)));
          const message = error instanceof UploadError ? error.message : reason(error, "Upload failed.");
          toast.error(`Couldn't attach ${file.name}`, message);
        }
      }),
    );
  };

  const removePending = (key: string) =>
    setPending((current) => current.filter((item) => item.key !== key));

  const send = async () => {
    const trimmed = body.trim();
    const drafts = pending.filter((item) => item.status === "done" && item.draft).map((item) => item.draft!);
    if (!trimmed && drafts.length === 0) return;
    if (pending.some((item) => item.status === "uploading")) {
      toast.info("Still uploading", "Wait for the attachments to finish, then send.");
      return;
    }
    if (!live) {
      toast.info("Demo mode", "Connect a backend to send a real message.");
      return;
    }

    setSending(true);
    try {
      const created = await onSend(trimmed, drafts);
      setMessages((current) => [...current, created]);
      setBody("");
      setPending([]);
    } catch (error) {
      toast.error("Couldn't send that message", reason(error, "Please try again."));
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void send();
    }
  };

  return (
    <section className="flex min-h-[28rem] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
      <div className="scroll-thin flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
        {messages.length === 0 ? (
          <div className="grid h-full min-h-[18rem] place-items-center px-6 text-center">
            <div>
              <p className="text-[15px] font-semibold text-ink">{emptyTitle}</p>
              <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted">{emptyDescription}</p>
            </div>
          </div>
        ) : (
          messages.map((message) => {
            const mine = message.from_platform === meIsPlatform;
            return (
              <div key={message.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[85%] sm:max-w-[75%]", mine ? "items-end" : "items-start")}>
                  <div
                    className={cn(
                      "mb-1 flex items-center gap-2 text-[11.5px] text-muted",
                      mine ? "justify-end" : "justify-start",
                    )}
                  >
                    <span className="font-medium text-ink-soft">{mine ? "You" : message.sender_name || otherName}</span>
                    <span aria-hidden>·</span>
                    <span>{relativeTime(message.created_at)}</span>
                  </div>
                  <div
                    className={cn(
                      "rounded-2xl px-3.5 py-2.5 text-[13.5px] whitespace-pre-wrap",
                      mine
                        ? "rounded-br-sm bg-brand text-white"
                        : "rounded-bl-sm border border-line bg-surface-2 text-ink",
                    )}
                  >
                    {message.body}
                  </div>
                  {message.attachments.length > 0 ? (
                    <div className={cn("mt-1.5 flex flex-wrap gap-1.5", mine ? "justify-end" : "justify-start")}>
                      {message.attachments.map((attachment) => (
                        <button
                          key={attachment.id}
                          type="button"
                          onClick={() => void openAttachment(attachment)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] text-ink-soft transition hover:bg-surface-2 hover:text-ink"
                        >
                          <FileText className="size-3.5 shrink-0 text-muted" />
                          <span className="max-w-[12rem] truncate">{attachment.name}</span>
                          {attachment.size_bytes ? (
                            <span className="text-muted">{formatBytes(attachment.size_bytes)}</span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottom} />
      </div>

      <div className="border-t border-line bg-surface-2/40 px-4 py-3 sm:px-6">
        {pending.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {pending.map((item) => (
              <span
                key={item.key}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px]",
                  item.status === "error"
                    ? "border-danger/40 bg-danger-soft text-danger"
                    : "border-line bg-surface text-ink-soft",
                )}
              >
                <FileText className="size-3.5 shrink-0 text-muted" />
                <span className="max-w-[10rem] truncate">{item.name}</span>
                <span className="text-muted">
                  {item.status === "uploading" ? "uploading…" : item.status === "error" ? "failed" : formatBytes(item.size)}
                </span>
                <button
                  type="button"
                  onClick={() => removePending(item.key)}
                  className="rounded p-0.5 text-muted transition hover:bg-surface-2 hover:text-ink"
                  aria-label={`Remove ${item.name}`}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex items-end gap-2">
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
            className="mb-0.5 grid size-10 shrink-0 place-items-center rounded-lg border border-line text-muted transition hover:bg-surface-2 hover:text-ink"
            aria-label="Attach a file"
          >
            <Paperclip className="size-4.5" />
          </button>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            placeholder="Write a message…  (Ctrl/⌘ + Enter to send)"
            className="scroll-thin max-h-40 min-h-[2.75rem] flex-1 resize-y rounded-lg border border-line bg-surface px-3 py-2.5 text-[13.5px] text-ink outline-none transition placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          <Button
            icon={<Send className="size-4" />}
            loading={sending}
            disabled={!body.trim() && !pending.some((item) => item.status === "done")}
            onClick={() => void send()}
            className="mb-0.5"
          >
            Send
          </Button>
        </div>
      </div>
    </section>
  );
}
