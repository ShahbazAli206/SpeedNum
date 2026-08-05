"use client";

import { Bell, ChevronRight, Menu, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/cn";
import { DEMO_ACCOUNT, getDeadlines } from "@/lib/demo";
import { DASHBOARD_NAV_FLAT } from "@/lib/site";

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
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  const deadlines = getDeadlines();
  const unread = deadlines.filter((item) => item.urgency !== "upcoming").length;

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
            onClick={() => setBellOpen((open) => !open)}
            aria-expanded={bellOpen}
            aria-label={`Notifications${unread ? `, ${unread} needing attention` : ""}`}
            className="relative grid size-9 place-items-center rounded-lg border border-line text-ink-soft transition hover:bg-surface-2"
          >
            <Bell className="size-4" />
            {unread > 0 ? (
              <span className="absolute -top-1 -right-1 grid size-4.5 place-items-center rounded-full bg-danger text-[9.5px] font-bold text-white">
                {unread}
              </span>
            ) : null}
          </button>

          {bellOpen ? (
            <div className="animate-in absolute right-0 mt-2 w-80 overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-float)]">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <p className="text-[14px] font-semibold text-ink">Notifications</p>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
                  {deadlines.length}
                </span>
              </div>
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
              <Link
                href="/dashboard/taxes"
                className="block border-t border-line bg-surface-2/50 px-4 py-2.5 text-center text-[12.5px] font-semibold text-brand transition hover:bg-surface-2"
              >
                View all deadlines
              </Link>
            </div>
          ) : null}
        </div>

        <Link
          href="/dashboard/settings"
          className="grid size-9 place-items-center rounded-full bg-brand-soft text-[12px] font-bold text-brand transition hover:brightness-95"
          aria-label="Account settings"
          title={DEMO_ACCOUNT.fullName}
        >
          {DEMO_ACCOUNT.firstName[0]}
          {DEMO_ACCOUNT.lastName[0]}
        </Link>
      </div>
    </header>
  );
}
