"use client";

import { MessageSquare } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { relativeTime } from "@/lib/format";
import type { SupportThreadSummary } from "@/lib/types";

export function SupportInboxClient({ threads }: { threads: SupportThreadSummary[] }) {
  if (threads.length === 0) {
    return (
      <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <EmptyState
          icon={<MessageSquare className="size-6" />}
          title="No messages yet"
          description="When a company owner messages the platform from their portal, their conversation shows up here."
        />
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
      <ul className="divide-y divide-line">
        {threads.map((thread) => {
          const unread = thread.unread > 0;
          return (
            <li key={thread.tenant_id}>
              <Link
                href={`/admin/support/${thread.tenant_id}`}
                className={cn(
                  "flex items-start gap-3.5 px-5 py-4 transition hover:bg-surface-2",
                  unread && "bg-brand-soft/25",
                )}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-info-soft text-info">
                  <MessageSquare className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[13.5px] font-semibold text-ink">{thread.tenant_name}</span>
                    {unread ? (
                      <span className="rounded-full bg-danger px-1.5 py-0.5 text-[10.5px] font-bold text-white tabular-nums">
                        {thread.unread}
                      </span>
                    ) : null}
                  </span>
                  {thread.last_message_preview ? (
                    <span className="mt-0.5 block truncate text-[13px] text-muted">
                      {thread.last_from_platform ? (
                        <span className="text-ink-soft">You: </span>
                      ) : null}
                      {thread.last_message_preview}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-[11.5px] text-muted">{relativeTime(thread.last_message_at)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
