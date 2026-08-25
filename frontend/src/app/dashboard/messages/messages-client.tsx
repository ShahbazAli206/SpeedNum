"use client";

import { CheckCheck, MessageSquare, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
        subtitle="A question, a complaint, anything you want your accountant to see"
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
          <h2 className="text-[15px] font-semibold text-ink">Sent messages</h2>
          <p className="mt-0.5 text-[13px] text-muted">Everything you&apos;ve sent your accountant</p>
        </div>
        {messages.length === 0 ? (
          <EmptyState
            title="No messages yet"
            description="Anything you send here goes straight to your accountant&apos;s notification feed."
          />
        ) : (
          <ul className="divide-y divide-line">
            {messages.map((item) => (
              <li key={item.id} className="flex items-start gap-3.5 px-5 py-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                  <MessageSquare className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  {item.subject ? (
                    <span className="block text-[13.5px] font-semibold text-ink">{item.subject}</span>
                  ) : null}
                  <span className="mt-0.5 block whitespace-pre-wrap text-[13px] text-ink-soft">{item.body}</span>
                  <span className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-muted">
                    {relativeTime(item.created_at)}
                    {item.is_read ? (
                      <span className={cn("inline-flex items-center gap-1 font-medium text-success")}>
                        <CheckCheck className="size-3" /> Seen by your accountant
                      </span>
                    ) : (
                      <span>· Sent</span>
                    )}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
