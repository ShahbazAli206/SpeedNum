"use client";

import { Bell, ChevronRight, LogOut, Menu, Search, Settings, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Menu as DropdownMenu } from "@/components/ui";
import { get, post } from "@/lib/api";
import { logout } from "@/lib/auth-client";
import { AUTH_CONFIGURED } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { getDeadlines } from "@/lib/demo";
import { useSession } from "@/lib/session";
import { DASHBOARD_NAV_FLAT } from "@/lib/site";
import type { Notification } from "@/lib/types";

const URGENCY_TONE = {
  overdue: "bg-danger",
  due_soon: "bg-warn",
  upcoming: "bg-success",
} as const;

export function Topbar({
  onOpenNav,
  onOpenSearch,
}: {
  onOpenNav: () => void;
  onOpenSearch: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useSession();
  const [bellOpen, setBellOpen] = useState(false);
  const [items, setItems] = useState<Notification[] | null>(null);
  const bellRef = useRef<HTMLDivElement>(null);

  // Demo fallback: portal deadlines stood in for notifications before this
  // surface had a real feed. Still used when no API is reachable.
  const deadlines = getDeadlines();
  const unread = session.isLive
    ? session.unread
    : deadlines.filter((item) => item.urgency !== "upcoming").length;

  /** Loaded on open rather than on every poll — the badge only needs a count. */
  const loadItems = useCallback(async () => {
    if (!session.isLive) return;
    try {
      setItems(await get<Notification[]>("/notifications?limit=10"));
    } catch {
      setItems([]);
    }
  }, [session.isLive]);

  const markAllRead = async () => {
    if (!session.isLive) return;
    try {
      await post("/notifications/read-all");
      setItems((current) => current?.map((item) => ({ ...item, is_read: true })) ?? null);
      session.setUnread(0);
    } catch {
      // A failed mark-read is not worth interrupting the user for; the next
      // poll will restore the true count either way.
    }
  };

  // Opening the bell is the client portal's equivalent of visiting the firm's
  // notifications page: the panel has no separate page to route to, so seeing it
  // is the read event. Fetch the list, then mark the feed read so the badge
  // stops blinking its old count the moment the panel opens — matching the
  // "looked at it, so it's read" behaviour the firm shell now has. The optimistic
  // zero inside markAllRead keeps the badge from lingering during the round-trip.
  const openBell = async () => {
    await loadItems();
    await markAllRead();
  };

  const signOut = async () => {
    if (AUTH_CONFIGURED) {
      try {
        await logout();
      } catch {
        // Redirecting is the right outcome regardless.
      }
    }
    router.replace("/login");
    router.refresh();
  };

  const current = DASHBOARD_NAV_FLAT.find((item) =>
    item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href),
  );

  useEffect(() => {
    if (!bellOpen) return;
    const onClick = (event: MouseEvent) => {
      if (!bellRef.current?.contains(event.target as Node)) setBellOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setBellOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [bellOpen]);

  // Close the notification panel on navigation, including back/forward.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setBellOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur-md sm:px-6">
      <button
        type="button"
        onClick={onOpenNav}
        className="grid size-9 shrink-0 place-items-center rounded-lg border border-line text-ink-soft transition hover:bg-surface-2 lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="size-5" />
      </button>

      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex items-center gap-1.5 text-[13.5px]">
          <li>
            <Link href="/" className="text-muted transition hover:text-ink">
              Home
            </Link>
          </li>
          <ChevronRight className="size-3.5 shrink-0 text-muted/60" aria-hidden />
          <li>
            {current && current.href !== "/dashboard" ? (
              <Link href="/dashboard" className="text-muted transition hover:text-ink">
                Dashboard
              </Link>
            ) : (
              <span className="font-medium text-ink" aria-current="page">
                Dashboard
              </span>
            )}
          </li>
          {current && current.href !== "/dashboard" ? (
            <>
              <ChevronRight className="size-3.5 shrink-0 text-muted/60" aria-hidden />
              <li className="truncate font-medium text-ink" aria-current="page">
                {current.label}
              </li>
            </>
          ) : null}
        </ol>
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenSearch}
          className="hidden items-center gap-2 rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-[13px] text-muted transition hover:bg-surface-2 hover:text-ink sm:flex"
        >
          <Search className="size-3.5" />
          <span className="w-28 text-left lg:w-40">Search pages…</span>
          <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 text-[10.5px] font-medium">
            Ctrl K
          </kbd>
        </button>

        <button
          type="button"
          onClick={onOpenSearch}
          className="grid size-9 place-items-center rounded-lg border border-line text-ink-soft transition hover:bg-surface-2 sm:hidden"
          aria-label="Search pages"
        >
          <Search className="size-4" />
        </button>

        <ThemeToggle className="hidden md:inline-flex" />

        <div ref={bellRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setBellOpen((open) => !open);
              if (!bellOpen) void openBell();
            }}
            aria-expanded={bellOpen}
            aria-label={
              unread ? `Notifications, ${unread} unread` : "Notifications, none unread"
            }
            className="relative grid size-9 place-items-center rounded-lg border border-line text-ink-soft transition hover:bg-surface-2"
          >
            {/* Matches the firm shell's AlertBell: a pulsing ring plus a
                blinking badge, so an unread alert is visible peripherally. */}
            {unread > 0 ? (
              <span
                aria-hidden
                className="animate-ring absolute inset-0 rounded-lg bg-danger/25"
              />
            ) : null}
            <Bell className={cn("relative size-4", unread > 0 && "animate-blink text-danger")} />
            {unread > 0 ? (
              <span className="animate-blink absolute -top-1 -right-1 grid size-4.5 place-items-center rounded-full bg-danger px-1 text-[9.5px] font-bold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </button>

          {bellOpen ? (
            <div className="animate-in absolute right-0 mt-2 w-80 overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-float)]">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <p className="text-[14px] font-semibold text-ink">Notifications</p>
                {unread > 0 ? (
                  <button
                    type="button"
                    onClick={() => void markAllRead()}
                    className="text-[12px] font-semibold text-brand transition hover:underline"
                  >
                    Mark all read
                  </button>
                ) : (
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
                    All caught up
                  </span>
                )}
              </div>

              {session.isLive ? (
                <ul className="scroll-thin max-h-80 overflow-y-auto">
                  {items === null ? (
                    <li className="px-4 py-6 text-center text-[12.5px] text-muted">Loading…</li>
                  ) : items.length === 0 ? (
                    <li className="px-4 py-6 text-center text-[12.5px] text-muted">
                      Nothing yet — we&apos;ll let you know.
                    </li>
                  ) : (
                    items.map((item) => (
                      <li key={item.id} className="border-b border-line last:border-b-0">
                        <Link
                          href={item.link || "/dashboard"}
                          className="flex items-start gap-3 px-4 py-3 transition hover:bg-surface-2"
                        >
                          <span
                            className={cn(
                              "mt-1.5 size-2 shrink-0 rounded-full",
                              item.is_read ? "bg-line-strong" : "bg-brand",
                            )}
                          />
                          <span className="min-w-0 flex-1">
                            <span
                              className={cn(
                                "block text-[13px]",
                                item.is_read ? "text-ink-soft" : "font-medium text-ink",
                              )}
                            >
                              {item.title}
                            </span>
                            {item.body ? (
                              <span className="block truncate text-[12px] text-muted">
                                {item.body}
                              </span>
                            ) : null}
                          </span>
                        </Link>
                      </li>
                    ))
                  )}
                </ul>
              ) : (
              <ul className="scroll-thin max-h-80 overflow-y-auto">
                {deadlines.map((item) => (
                  <li key={item.id} className="border-b border-line last:border-b-0">
                    <Link
                      href="/dashboard/taxes"
                      className="flex items-start gap-3 px-4 py-3 transition hover:bg-surface-2"
                    >
                      <span
                        className={cn(
                          "mt-1.5 size-2 shrink-0 rounded-full",
                          URGENCY_TONE[item.urgency],
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium text-ink">
                          {item.title}
                        </span>
                        <span className="block truncate text-[12px] text-muted">
                          {item.detail}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-[11px] font-semibold",
                          item.urgency === "overdue"
                            ? "text-danger"
                            : item.urgency === "due_soon"
                              ? "text-warn"
                              : "text-muted",
                        )}
                      >
                        {item.daysRemaining < 0
                          ? `${Math.abs(item.daysRemaining)}d late`
                          : `${item.daysRemaining}d`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              )}

              <Link
                href="/dashboard/taxes"
                className="block border-t border-line bg-surface-2/50 px-4 py-2.5 text-center text-[12.5px] font-semibold text-brand transition hover:bg-surface-2"
              >
                View all deadlines
              </Link>
            </div>
          ) : null}
        </div>

        {/* Real identity and a real sign-out. This used to render DEMO_ACCOUNT's
            initials for every signed-in client, and the only way out was a
            <Link href="/login"> that never ended the session — so the proxy
            bounced you straight back into the app. */}
        <DropdownMenu
          label="Account menu"
          minWidth={220}
          className="grid size-9 place-items-center rounded-full bg-brand-soft text-[12px] font-bold text-brand transition hover:brightness-95"
          trigger={<span aria-hidden>{session.isLoading ? "" : session.initials}</span>}
          items={[
            {
              label: session.isLoading ? "" : session.displayName,
              description: session.isLoading ? "" : session.email || undefined,
              icon: <UserRound className="size-3.5" />,
              disabled: true,
            },
            {
              label: "Account settings",
              icon: <Settings className="size-3.5" />,
              separated: true,
              onSelect: () => router.push("/dashboard/settings"),
            },
            {
              label: "Sign out",
              icon: <LogOut className="size-3.5" />,
              danger: true,
              separated: true,
              onSelect: () => void signOut(),
            },
          ]}
        />
      </div>
    </header>
  );
}
