"use client";

import { MessageSquare, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { DashboardHeader } from "@/components/dashboard/page-shell";
import { useToast } from "@/components/toast";
import { Button, EmptyState, Field, Input, Textarea } from "@/components/ui";
import { ApiError, post } from "@/lib/api";
import { AUTH_CONFIGURED } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { relativeTime } from "@/lib/format";
import type { ClientMessage } from "@/lib/types";

export function MessagesClient({ messages }: { messages: ClientMessage[] }) {
  const toast = useToast();
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const markedRef = useRef(false);

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

  const send = async () => {
    if (!body.trim()) return;
    if (!AUTH_CONFIGURED) {
      toast.info("Demo mode", "Connect a backend to send a real message to your accountant.");
      return;
    }
    setSending(true);
    try {
      await post("/client-portal/messages", {
        subject: subject.trim() || null,
        body: body.trim(),
      });
      toast.success("Message sent", "Your accountant will see this the next time they sign in.");
      setSubject("");
      setBody("");
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
          <Field label="Message" required>
            <Textarea
              rows={4}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Write your message here…"
            />
          </Field>
          <div className="flex justify-end">
            <Button icon={<Send className="size-4" />} loading={sending} disabled={!body.trim()} onClick={send}>
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
                    <span className="block whitespace-pre-wrap">{item.body}</span>
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
