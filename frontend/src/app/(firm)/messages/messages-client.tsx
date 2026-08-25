"use client";

import { CheckCheck, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { DashboardHeader } from "@/components/dashboard/page-shell";
import { useToast } from "@/components/toast";
import { Button, EmptyState } from "@/components/ui";
import { post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { relativeTime } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { ClientMessage } from "@/lib/types";

/** Pull a human-readable reason out of an ApiError without leaking `[object]`. */
function message(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function MessagesClient({ messages, isLive }: { messages: ClientMessage[]; isLive: boolean }) {
  const toast = useToast();
  const session = useSession();
  const [read, setRead] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const isRead = (item: ClientMessage) => read[item.id] ?? item.is_read;
  const unread = messages.filter((item) => item.is_from_client && !isRead(item)).length;
  const visible = filter === "unread" ? messages.filter((item) => !isRead(item)) : messages;

  const markRead = (id: string) => {
    const previous = read;
    setRead((current) => ({ ...current, [id]: true }));
    if (!isLive) return;
    post(`/client-portal/messages/${id}/read`)
      .then(() => session.refresh())
      .catch((error) => {
        setRead(previous);
        toast.error("Could not mark that message read", message(error, "Please try again."));
      });
  };

  const markAll = () => {
    const previous = read;
    setRead(Object.fromEntries(messages.map((item) => [item.id, true])));
    if (!isLive) return;
    post("/client-portal/messages/read-all")
      .then(() => {
        session.refresh();
        toast.success("All caught up", `${unread} message${unread === 1 ? "" : "s"} marked read.`);
      })
      .catch((error) => {
        setRead(previous);
        toast.error("Could not mark them all read", message(error, "Please try again."));
      });
  };

  return (
    <>
      <DashboardHeader
        title="Messages"
        subtitle="Questions and complaints clients send from the portal"
        actions={
          <Button
            variant="secondary"
            icon={<CheckCheck className="size-4" />}
            onClick={markAll}
            disabled={unread === 0}
          >
            Mark all read
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(["all", "unread"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setFilter(option)}
            aria-pressed={filter === option}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium capitalize transition",
              filter === option
                ? "border-brand bg-brand text-white"
                : "border-line text-muted hover:bg-surface-2 hover:text-ink",
            )}
          >
            {option}
            <span
              className={cn(
                "rounded-full px-1.5 text-[11px] tabular-nums",
                filter === option ? "bg-white/20" : "bg-surface-2",
              )}
            >
              {option === "all" ? messages.length : unread}
            </span>
          </button>
        ))}
      </div>

      <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
        {visible.length === 0 ? (
          <EmptyState
            title="Nothing here"
            description={
              filter === "unread"
                ? "Every message has been read."
                : "No client has sent a message from the portal yet."
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((item) => {
              const unreadItem = item.is_from_client && !isRead(item);
              return (
                <li
                  key={item.id}
                  className={cn("flex items-start gap-3.5 px-5 py-4", unreadItem && "bg-brand-soft/25")}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-info-soft text-info">
                    <MessageSquare className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      {item.client_name ? (
                        <Link
                          href={`/clients/${item.client_id}`}
                          className="text-[13.5px] font-semibold text-ink transition hover:text-brand hover:underline"
                        >
                          {item.client_name}
                        </Link>
                      ) : (
                        <span className="text-[13.5px] font-semibold text-ink">Unknown client</span>
                      )}
                      {!item.is_from_client ? (
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-semibold text-muted">
                          Logged by staff
                        </span>
                      ) : null}
                      {unreadItem ? (
                        <span className="size-1.5 shrink-0 rounded-full bg-brand" aria-label="Unread" />
                      ) : null}
                    </span>
                    {item.subject ? (
                      <span className="mt-0.5 block text-[13px] font-medium text-ink-soft">{item.subject}</span>
                    ) : null}
                    <span className="mt-0.5 block whitespace-pre-wrap text-[13px] text-muted">{item.body}</span>
                    <span className="mt-1.5 block text-[11.5px] text-muted">{relativeTime(item.created_at)}</span>
                  </span>
                  {unreadItem ? (
                    <Button size="sm" variant="secondary" onClick={() => markRead(item.id)}>
                      Mark read
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
