"use client";

import { Bell } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session";

/**
 * The notification bell. Blinks whenever anything is unread — any count at all,
 * not just a large one.
 *
 * Two signals stacked on purpose: the count badge fades in and out, and a ring
 * pulses outward behind the icon. On a 27" monitor the sidebar sits in
 * peripheral vision, where a 4px static dot is invisible but movement is not.
 * Both stop under `prefers-reduced-motion` (see globals.css) — the red fill and
 * the number still carry the meaning, so nothing is lost.
 *
 * The count comes from `useSession`, which polls `GET /auth/me`, so this badge
 * and the sidebar badge can never drift apart.
 */
export function AlertBell({
  href = "/notifications",
  className,
}: {
  href?: string;
  className?: string;
}) {
  const { unread } = useSession();
  const hasUnread = unread > 0;

  return (
    <Link
      href={href}
      aria-label={
        hasUnread
          ? `Notifications, ${unread} unread`
          : "Notifications, nothing unread"
      }
      className={cn(
        "relative grid size-9 place-items-center rounded-lg border text-ink-soft transition",
        hasUnread
          ? "border-danger/40 bg-danger-soft/40 text-danger hover:bg-danger-soft"
          : "border-line hover:bg-surface-2",
        className,
      )}
    >
      {/* Sits behind the icon, sized to the button, so the ring reads as coming
          from the bell rather than from the badge in the corner. */}
      {hasUnread ? (
        <span
          aria-hidden
          className="animate-ring pointer-events-none absolute inset-0 rounded-lg bg-danger/40"
        />
      ) : null}

      <Bell className={cn("relative size-4", hasUnread && "animate-blink")} />

      {hasUnread ? (
        <span
          aria-hidden
          className="animate-blink absolute -top-1 -right-1 grid min-w-4.5 place-items-center rounded-full bg-danger px-1 text-[9.5px] font-bold text-white tabular-nums shadow-sm"
        >
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * The same unread signal as a small inline dot, for a sidebar row's icon when
 * the rail is collapsed and there is no room for a number.
 */
export function UnreadDot({ show, className }: { show: boolean; className?: string }) {
  if (!show) return null;
  return (
    <span
      aria-hidden
      className={cn(
        "animate-blink absolute -top-1 -right-1 size-2 rounded-full bg-danger",
        className,
      )}
    />
  );
}
