"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";

import { CallProvider } from "@/components/calls/call-provider";
import { SessionProvider } from "@/lib/session";

import { CommandPalette } from "./command-palette";
import { ForcePasswordModal } from "./force-password-modal";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

const COLLAPSE_KEY = "speednum-sidebar-collapsed";

/**
 * Portal chrome: collapsible sidebar, sticky topbar, and the Ctrl/⌘-K palette.
 *
 * State lives here rather than in the layout so the layout itself can stay a
 * server component.
 *
 * Wrapped in SessionProvider for the same reason the firm shell is: the bell
 * badge, the sidebar identity and the account menu all need the signed-in
 * profile, and one polled `/auth/me` keeps them from disagreeing. Before this,
 * the portal rendered DEMO_ACCOUNT's name to every real client.
 */
export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <CallProvider>
        <DashboardShellInner>{children}</DashboardShellInner>
      </CallProvider>
    </SessionProvider>
  );
}

function DashboardShellInner({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Restore the rail width after mount — reading storage during render would
  // desync the server and client markup.
  useEffect(() => {
    try {
      // Reading an external store (localStorage) after mount — a one-shot sync
      // that the server render cannot perform. It cannot cascade.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // Storage unavailable; the default expanded rail is fine.
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // Ignore quota/private-mode failures.
      }
      return next;
    });
  };

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

  return (
    <div className="flex min-h-screen flex-1 bg-canvas">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onOpenNav={() => setMobileOpen(true)}
          onOpenSearch={() => setPaletteOpen(true)}
        />
        <main id="main" className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>

      {/* Mounted only while open, so its query state resets for free. */}
      {paletteOpen ? <CommandPalette onClose={() => setPaletteOpen(false)} /> : null}

      {/* useSearchParams needs a Suspense boundary so the shell can still prerender. */}
      <Suspense fallback={null}>
        <ForcePasswordModal />
      </Suspense>
    </div>
  );
}
