"use client";

import { LogOut, PanelLeftClose, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/icon";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/cn";
import { DEMO_ACCOUNT } from "@/lib/demo";
import { DASHBOARD_NAV } from "@/lib/site";

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
          <Logo href="/dashboard" size={30} className="[&>span:last-child]:hidden" />
        ) : (
          <Logo href="/dashboard" size={30} sublabel="CLIENT" />
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
                return (
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
                      <Icon name={item.icon} className="size-4.5 shrink-0" />
                      {!collapsed ? <span className="truncate">{item.label}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-line p-3">
        {!collapsed ? (
          <div className="flex items-center gap-2.5 rounded-xl bg-surface-2 p-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-[12px] font-bold text-brand">
              {DEMO_ACCOUNT.firstName[0]}
              {DEMO_ACCOUNT.lastName[0]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold text-ink">
                {DEMO_ACCOUNT.fullName}
              </span>
              <span className="block truncate text-[11.5px] text-muted">
                {DEMO_ACCOUNT.email}
              </span>
            </span>
            <Link
              href="/login"
              className="shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-surface hover:text-danger"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="size-4" />
            </Link>
          </div>
        ) : (
          <Link
            href="/login"
            className="mx-auto grid size-9 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-danger"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="size-4" />
          </Link>
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
