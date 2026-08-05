"use client";

import { CalendarClock, CheckCheck, Kanban, Signature, Users, Zap } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { DashboardHeader } from "@/components/dashboard/page-shell";
import { useToast } from "@/components/toast";
import { Button, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Notification } from "@/lib/firm-demo";

const TYPE_META = {
  deadline: { icon: CalendarClock, tone: "bg-danger-soft text-danger", label: "Deadline" },
  letter: { icon: Signature, tone: "bg-brand-soft text-brand", label: "Letter" },
  task: { icon: Kanban, tone: "bg-warn-soft text-warn", label: "Task" },
  client: { icon: Users, tone: "bg-info-soft text-info", label: "Client" },
  system: { icon: Zap, tone: "bg-surface-2 text-muted", label: "System" },
} as const;

const FILTERS = ["All", "Unread", "Deadline", "Letter", "Task", "Client", "System"] as const;

export function NotificationsClient({ notifications }: { notifications: Notification[] }) {
  const toast = useToast();
  // Read state is local until the notifications API is wired.
  const [read, setRead] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");

  const isRead = (item: Notification) => read[item.id] ?? item.is_read;
  const unread = notifications.filter((item) => !isRead(item)).length;

  const visible = notifications.filter((item) => {
    if (filter === "All") return true;
    if (filter === "Unread") return !isRead(item);
    return TYPE_META[item.type].label === filter;
  });

  const markAll = () => {
    setRead(Object.fromEntries(notifications.map((item) => [item.id, true])));
    toast.success("All caught up", `${unread} notification${unread === 1 ? "" : "s"} marked read.`);
  };

  return (
    <>
      <DashboardHeader
        title="Notifications"
        subtitle="Everything that changed, in the app rather than in another inbox"
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
        {FILTERS.map((option) => {
          const count =
            option === "All"
              ? notifications.length
              : option === "Unread"
                ? unread
                : notifications.filter((item) => TYPE_META[item.type].label === option).length;
          return (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              aria-pressed={filter === option}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition",
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
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
        {visible.length === 0 ? (
          <EmptyState
            title="Nothing here"
            description={
              filter === "Unread"
                ? "Every notification has been read."
                : `No ${filter.toLowerCase()} notifications.`
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((item) => {
              const meta = TYPE_META[item.type];
              const Icon = meta.icon;
              const unreadItem = !isRead(item);

              return (
                <li key={item.id} className={cn(unreadItem && "bg-brand-soft/25")}>
                  <Link
                    href={item.link}
                    onClick={() => setRead((current) => ({ ...current, [item.id]: true }))}
                    className="flex items-start gap-3.5 px-5 py-4 transition hover:bg-surface-2"
                  >
                    <span
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-lg",
                        meta.tone,
                      )}
                    >
                      <Icon className="size-4" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "text-[14px] text-ink",
                            unreadItem ? "font-semibold" : "font-medium",
                          )}
                        >
                          {item.title}
                        </span>
                        {unreadItem ? (
                          <span className="size-1.5 shrink-0 rounded-full bg-brand" aria-label="Unread" />
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-[12.5px] text-muted">{item.body}</span>
                    </span>

                    <span className="shrink-0 text-[11.5px] whitespace-nowrap text-muted">
                      {item.when}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="mt-5 rounded-xl border border-line bg-surface-2/50 p-5 text-[13px] leading-relaxed text-muted">
        Email is reserved for the daily digest — one message summarising what is red and what is
        due, rather than one message per event. Digest preferences live in firm settings.
      </p>
    </>
  );
}
