"use client";

import {
  BellRing,
  ChevronRight,
  LogOut,
  Menu as MenuIcon,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";

import { AlertBell, UnreadDot } from "@/components/dashboard/alert-bell";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { DesktopAppButton } from "@/components/dashboard/desktop-app-button";
import { ForcePasswordModal } from "@/components/dashboard/force-password-modal";
import { ImpersonationBanner } from "@/components/dashboard/impersonation-banner";
import { SignOutButton, useSignOut } from "@/components/dashboard/sign-out-button";
import { UrgentDeadlineBanner } from "@/components/dashboard/urgent-deadline-banner";
import { Icon } from "@/components/icon";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge, Menu, Skeleton, type Tone } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getFirmOverview } from "@/lib/firm-demo";
import { SessionProvider, useSession } from "@/lib/session";
import { FIRM_NAV, FIRM_NAV_FLAT } from "@/lib/site";

import { FirmBrandingProvider, useBranding } from "./branding";

const COLLAPSE_KEY = "speednum-firm-collapsed";

// Owner and admin both read as "Admin" here — the distinction that matters at
// a glance in the rail is platform superadmin vs. ordinary firm staff vs. a
// client login, not the firm-internal owner/admin split.
const ROLE_TONE: Record<string, Tone> = {
  "Super Admin": "brand",
  Admin: "info",
  Accountant: "neutral",
  Client: "success",
};

/**
 * Chrome for the staff-facing app.
 *
 * Separate from the client portal's shell (`components/dashboard/shell.tsx`):
 * different navigation, different identity in the rail, and a firm badge rather
 * than a "CLIENT" sublabel. The command palette is shared but fed FIRM_NAV.
 */
export function FirmShell({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <FirmBrandingProvider>
        <FirmShellInner>{children}</FirmShellInner>
      </FirmBrandingProvider>
    </SessionProvider>
  );
}

function FirmShellInner({ children }: { children: ReactNode }) {
  const { branding } = useBranding();
  const session = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const signOut = useSignOut();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    try {
      // One-shot read of an external store the server cannot see.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // Storage unavailable; the expanded rail is a fine default.
    }
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close the mobile drawer on navigation, including back/forward.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileOpen(false);
  }, [pathname]);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // Ignore private-mode quota failures.
      }
      return next;
    });
  };

  // Demo fixtures stand in only for the badges the API hasn't been asked for
  // yet (overdue deadlines); notifications and reminders come from the session.
  const overview = useMemo(() => getFirmOverview(), []);
  const current = FIRM_NAV_FLAT.find((item) => pathname.startsWith(item.href));

  const badgeFor = (href: string): number => {
    switch (href) {
      case "/deadlines":
        return session.isLive ? session.reminders.overdue : overview.deadlines.overdue;
      case "/reminders":
        return session.isLive ? session.reminders.unacknowledged : 0;
      case "/notifications":
        return session.isLive ? session.unread : overview.unread_notifications;
      default:
        return 0;
    }
  };

  const rail = (
    <>
      <div
        className={cn(
          "flex h-16 items-center border-b border-line",
          collapsed ? "justify-center px-3" : "justify-between px-4",
        )}
      >
        {collapsed ? (
          <Logo
            href="/overview"
            size={30}
            className="[&>span:last-child]:hidden"
            logoUrl={branding.logoUrl}
          />
        ) : (
          <Logo
            href="/overview"
            size={30}
            sublabel={branding.name.toUpperCase()}
            logoUrl={branding.logoUrl}
          />
        )}
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="rounded-lg p-1 text-muted transition hover:bg-surface-2 hover:text-ink lg:hidden"
          aria-label="Close navigation"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* Role chip: which portal this login belongs to. Owner and admin share
          the same shell as a platform superadmin and as accountant staff, and
          only one of those four can actually reach /admin — without this, the
          only way to find out was to click through and hit "Superadmin access
          required". */}
      {!session.isLoading ? (
        <div
          className={cn(
            "border-b border-line py-2",
            collapsed ? "flex justify-center" : "px-4",
          )}
        >
          <Badge tone={ROLE_TONE[session.portalRoleLabel] ?? "neutral"} className={collapsed ? "px-1.5" : undefined}>
            {collapsed ? session.portalRoleLabel[0] : session.portalRoleLabel}
          </Badge>
        </div>
      ) : null}

      <div className={cn("border-b border-line", collapsed ? "px-3 py-3" : "px-3 py-3")}>
        {collapsed ? (
          <Link
            href="/clients/new"
            className="brand-gradient mx-auto grid size-9 place-items-center rounded-lg text-white shadow-sm transition hover:brightness-110"
            aria-label="Add client"
            title="Add client"
          >
            <Plus className="size-4.5" />
          </Link>
        ) : (
          <Link
            href="/clients/new"
            className="brand-gradient flex items-center justify-center gap-2 rounded-lg py-2.5 text-[13.5px] font-semibold text-white shadow-sm transition hover:brightness-110"
          >
            <Plus className="size-4" />
            Add client
          </Link>
        )}
      </div>

      <nav className="scroll-thin flex-1 overflow-y-auto px-3 py-4" aria-label="Practice">
        {FIRM_NAV.map((group) => (
          <div key={group.group} className="mb-5 last:mb-0">
            {collapsed ? (
              <div className="mx-auto mb-2 h-px w-6 bg-line" aria-hidden />
            ) : (
              <p className="mb-1.5 px-2.5 text-[10.5px] font-bold tracking-[0.14em] text-muted uppercase">
                {group.group}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname.startsWith(item.href);
                const badge = badgeFor(item.href);
                // Alert counts blink; a plain "3 clients" style count would not.
                const alerting = badge > 0 && item.href !== "/clients";

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
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
                      <span className="relative">
                        <Icon name={item.icon} className="size-4.5 shrink-0" />
                        <UnreadDot show={collapsed && alerting} />
                      </span>
                      {!collapsed ? (
                        <>
                          <span className="flex-1 truncate">{item.label}</span>
                          {badge > 0 ? (
                            <span
                              className={cn(
                                "rounded-full px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums",
                                active ? "bg-white/20 text-white" : "bg-danger text-white",
                                alerting && !active && "animate-blink",
                              )}
                            >
                              {badge}
                            </span>
                          ) : null}
                        </>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-line p-3">
        <div className={cn("mb-2", collapsed && "flex justify-center")}>
          <DesktopAppButton collapsed={collapsed} />
        </div>

        {collapsed ? (
          <SignOutButton className="mx-auto grid size-9 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-danger" />
        ) : (
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
                  {session.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-ink">
                    {session.displayName}
                  </span>
                  <span className="block truncate text-[11.5px] text-muted">
                    {session.displayTitle}
                  </span>
                </span>
              </>
            )}
            <SignOutButton />
          </div>
        )}

        <button
          type="button"
          onClick={toggleCollapsed}
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
    <div className="flex min-h-screen flex-1 bg-canvas">
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 lg:flex",
          collapsed ? "w-[4.75rem]" : "w-64",
        )}
      >
        {rail}
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-70 lg:hidden">
          <div
            className="animate-fade absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="animate-in relative flex h-full w-72 flex-col border-r border-line bg-surface shadow-[var(--shadow-float)]">
            {rail}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur-md sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="grid size-9 shrink-0 place-items-center rounded-lg border border-line text-ink-soft transition hover:bg-surface-2 lg:hidden"
            aria-label="Open navigation"
          >
            <MenuIcon className="size-5" />
          </button>

          <nav aria-label="Breadcrumb" className="min-w-0">
            <ol className="flex items-center gap-1.5 text-[13.5px]">
              <li>
                <Link href="/overview" className="text-muted transition hover:text-ink">
                  {branding.name}
                </Link>
              </li>
              {current ? (
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
              onClick={() => setPaletteOpen(true)}
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
              onClick={() => setPaletteOpen(true)}
              className="grid size-9 place-items-center rounded-lg border border-line text-ink-soft transition hover:bg-surface-2 sm:hidden"
              aria-label="Search pages"
            >
              <Search className="size-4" />
            </button>

            <ThemeToggle className="hidden md:inline-flex" />

            <AlertBell />

            {/* Was a static chip with no menu — the only way to reach settings
                or sign out from the header was the rail at the far left. */}
            <Menu
              label="Account menu"
              minWidth={230}
              className="grid size-9 place-items-center rounded-full bg-brand-soft text-[12px] font-bold text-brand transition hover:brightness-95"
              trigger={<span aria-hidden>{session.isLoading ? "" : session.initials}</span>}
              items={[
                {
                  label: session.isLoading ? "" : session.displayName,
                  description: session.isLoading ? "" : session.email || session.displayTitle,
                  icon: <UserRound className="size-3.5" />,
                  disabled: true,
                },
                {
                  label: "My account",
                  icon: <UserRound className="size-3.5" />,
                  separated: true,
                  onSelect: () => router.push("/account"),
                },
                {
                  label: "Firm settings",
                  icon: <Settings className="size-3.5" />,
                  onSelect: () => router.push("/settings"),
                },
                {
                  label: "Notifications",
                  icon: <BellRing className="size-3.5" />,
                  onSelect: () => router.push("/notifications"),
                },
                {
                  label: "Sign out",
                  icon: <LogOut className="size-3.5" />,
                  danger: true,
                  separated: true,
                  onSelect: signOut,
                },
              ]}
            />
          </div>
        </header>

        <ImpersonationBanner />

        <UrgentDeadlineBanner />

        <main id="main" className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>

      {paletteOpen ? (
        <CommandPalette onClose={() => setPaletteOpen(false)} items={FIRM_NAV_FLAT} />
      ) : null}

      {/* Staff arrive here on a temporary password too — from the credentials
          email's one-click link, which lands on /overview. Previously this was
          mounted only in the client-portal shell, so an accountant was never
          asked to replace the password an admin had generated for them.
          Suspense because it reads useSearchParams. */}
      <Suspense fallback={null}>
        <ForcePasswordModal />
      </Suspense>
    </div>
  );
}
