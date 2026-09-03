"use client";

import { PanelLeftClose, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";

import { CallNavItem } from "@/components/calls/call-nav-item";
import { Icon } from "@/components/icon";
import { Logo } from "@/components/logo";
import { Badge, Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { DEMO_ACCOUNT } from "@/lib/demo";
import { useSession } from "@/lib/session";
import { DASHBOARD_NAV } from "@/lib/site";

import { SignOutButton } from "./sign-out-button";

export function Sidebar({
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const pathname = usePathname();
  const session = useSession();
  // The client portal has no branding provider of its own — the firm's logo
  // and name ride in on the same /auth/me call the identity chip already uses.
  const logoUrl = session.isLive ? session.me?.tenant?.logo_url : null;
  const firmName = session.isLive ? session.me?.tenant?.name : null;

  // Real identity when signed in; the demo account only stands in when no API
  // is reachable, so a live client never sees someone else's name in the rail.
  const name = session.isLive ? session.displayName : DEMO_ACCOUNT.fullName;
  const email = session.isLive ? (session.email ?? "") : DEMO_ACCOUNT.email;
  const initials = session.isLive
    ? session.initials
    : `${DEMO_ACCOUNT.firstName[0]}${DEMO_ACCOUNT.lastName[0]}`;

  // `/dashboard` must match exactly, or every child route would light it up too.
  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  const content = (
    <>
      <div
        className={cn(
          "flex h-16 items-center border-b border-line",
          collapsed ? "justify-center px-3" : "justify-between px-4",
        )}
      >
        {collapsed ? (
          <Logo
            href="/dashboard"
            size={30}
            className="[&>span:last-child]:hidden"
            logoUrl={logoUrl}
          />
        ) : (
          <Logo href="/dashboard" size={30} sublabel={firmName ?? "CLIENT PORTAL"} logoUrl={logoUrl} />
        )}
        <button
          type="button"
          onClick={onCloseMobile}
          className="rounded-lg p-1 text-muted transition hover:bg-surface-2 hover:text-ink lg:hidden"
          aria-label="Close navigation"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* Role chip: the client portal only ever serves a client login, but
          this stays data-driven off the session (rather than a hardcoded
          "CLIENT" string) so it can never disagree with the firm shell's
          equivalent chip if a profile is ever misrouted between the two. */}
      {!session.isLoading ? (
        <div className={cn("border-b border-line py-2", collapsed ? "flex justify-center" : "px-4")}>
          <Badge tone="success" className={collapsed ? "px-1.5" : undefined}>
            {collapsed ? session.portalRoleLabel[0] : session.portalRoleLabel}
          </Badge>
        </div>
      ) : null}

      <nav className="scroll-thin flex-1 overflow-y-auto px-3 py-4" aria-label="Portal">
        {DASHBOARD_NAV.map((group) => (
          <div key={group.group} className="mb-5 last:mb-0">
            {!collapsed ? (
              <p className="mb-1.5 px-2.5 text-[10.5px] font-bold tracking-[0.14em] text-muted uppercase">
                {group.group}
              </p>
            ) : (
              <div className="mx-auto mb-2 h-px w-6 bg-line" aria-hidden />
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.href);
                const row = (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onCloseMobile}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg text-[14.5px] font-medium transition",
                        collapsed ? "justify-center px-2 py-2.5" : "px-2.5 py-2.5",
                        active
                          ? "bg-brand text-white shadow-sm"
                          : "text-ink-soft hover:bg-surface-2 hover:text-ink",
                      )}
                    >
                      <Icon name={item.icon} className="size-6 text-[21px]" />
                      {!collapsed ? <span className="truncate">{item.label}</span> : null}
                    </Link>
                  </li>
                );
                // Video Call sits directly under Messages: its own sibling row
                // (a button that opens the contact picker, not a nav link).
                return item.href === "/dashboard/messages" ? (
                  <Fragment key={item.href}>
                    {row}
                    <CallNavItem collapsed={collapsed} />
                  </Fragment>
                ) : (
                  row
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-line p-3">
        {!collapsed ? (
          <div className="flex items-center gap-2.5 rounded-xl bg-surface-2 p-2.5">
            {session.isLoading ? (
              <>
                <Skeleton className="size-9 shrink-0 rounded-full" />
                <span className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3 w-16" />
                </span>
              </>
            ) : (
              <>
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-[12px] font-bold text-brand">
                  {initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-ink">
                    {name}
                  </span>
                  <span className="block truncate text-[11.5px] text-muted">{email}</span>
                </span>
              </>
            )}
            {/* SignOutButton, not <Link href="/login">: a link never ended the
                session, and the proxy bounces a signed-in user away from
                /login — so "Sign out" put you straight back in the app. */}
            <SignOutButton className="shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-surface hover:text-danger" />
          </div>
        ) : (
          <SignOutButton className="mx-auto grid size-9 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-danger" />
        )}

        <button
          type="button"
          onClick={onToggleCollapsed}
          className={cn(
            "mt-2 hidden w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] font-medium text-muted transition hover:bg-surface-2 hover:text-ink lg:flex",
            collapsed && "justify-center px-0",
          )}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        >
          <PanelLeftClose
            className={cn("size-4 transition-transform", collapsed && "rotate-180")}
          />
          {!collapsed ? "Collapse" : null}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 lg:flex",
          collapsed ? "w-[4.75rem]" : "w-64",
        )}
      >
        {content}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-70 lg:hidden">
          <div
            className="animate-fade absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
            onClick={onCloseMobile}
            aria-hidden
          />
          <aside className="animate-in relative flex h-full w-72 flex-col border-r border-line bg-surface shadow-[var(--shadow-float)]">
            {content}
          </aside>
        </div>
      ) : null}
    </>
  );
}
