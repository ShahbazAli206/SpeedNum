"use client";

import { Download, Laptop } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/cn";
import { useApi } from "@/lib/hooks";
import type { DesktopRelease } from "@/lib/types";

import { useToast } from "../toast";
import { Button, Modal } from "../ui";

const DEEP_LINK = "spidnums://check-update";
// How long to wait for the browser to hand off to the OS/protocol handler
// before concluding nobody answered. There is no reliable, standards-based
// way for a web page to ask "is a given custom protocol registered?" — every
// browser deliberately hides that from pages, since it would otherwise let
// any site fingerprint which desktop apps a visitor has installed. This
// blur/visibility timing is the same best-effort heuristic every "open in
// app" web feature uses; it is not a certainty, only a reasonable guess.
const HANDOFF_TIMEOUT_MS = 1500;

/**
 * Bottom-of-sidebar entry point for the SpidNums Desktop disaster-recovery
 * app (see DESKTOP.md). Clicking it tries the spidnums:// deep link; if the
 * page is still in the foreground after a short timeout, nothing answered
 * the link, so we assume the app isn't installed and offer the real
 * installer download instead. The desktop app itself remains the sole
 * authority on its own version/update state (see desktop/src/main.js's
 * handleDeepLink + the existing electron-updater wiring) — this button never
 * claims to know or control that, only to launch or point at the installer.
 */
export function DesktopAppButton({ collapsed }: { collapsed?: boolean }) {
  const toast = useToast();
  const release = useApi<DesktopRelease>("/desktop/latest");
  const [notInstalledOpen, setNotInstalledOpen] = useState(false);

  const handleClick = () => {
    let settled = false;
    const markHandledByApp = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", markHandledByApp);
      window.removeEventListener("blur", markHandledByApp);
      toast.info("Opening SpidNums Desktop…");
    };

    document.addEventListener("visibilitychange", markHandledByApp);
    window.addEventListener("blur", markHandledByApp);

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      document.removeEventListener("visibilitychange", markHandledByApp);
      window.removeEventListener("blur", markHandledByApp);
      setNotInstalledOpen(true);
    }, HANDOFF_TIMEOUT_MS);

    // A same-page navigation attempt, not a link click — this is the
    // conventional way to invoke a custom protocol without opening a new
    // tab/window for a scheme the browser can't itself render.
    window.location.href = DEEP_LINK;
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        title={collapsed ? "SpidNums Desktop — Download App" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-lg border border-line bg-surface-2/60 px-2.5 py-2.5 text-left transition hover:bg-surface-2",
          collapsed && "justify-center px-0",
        )}
      >
        <span className="relative grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
          <Laptop className="size-4" />
          {/* Gentle, occasional pulse — reuses the same ring animation the
              alert bell uses elsewhere, which already disables itself under
              prefers-reduced-motion (globals.css). Deliberately not the
              faster "blink" variant used for urgent counts: this is a
              feature nudge, not an alert. */}
          <span className="animate-ring absolute inset-0 rounded-lg bg-brand/50" aria-hidden />
        </span>
        {!collapsed ? (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-ink">SpidNums Desktop</span>
            <span className="flex items-center gap-1 truncate text-[11.5px] text-muted">
              <Download className="size-3" />
              Download App
            </span>
          </span>
        ) : null}
      </button>

      <Modal
        open={notInstalledOpen}
        onClose={() => setNotInstalledOpen(false)}
        title="SpidNums Desktop isn't installed"
        description="It looks like SpidNums Desktop isn't set up on this computer yet."
        width="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setNotInstalledOpen(false)}>
              Cancel
            </Button>
            <Button
              icon={<Download className="size-4" />}
              disabled={!release.data}
              onClick={() => {
                if (release.data) window.location.href = release.data.installer;
                setNotInstalledOpen(false);
              }}
            >
              Download SpidNums Desktop
            </Button>
          </>
        }
      >
        <p className="text-[13.5px] text-ink-soft">
          This downloads the official Windows installer{release.data ? ` (v${release.data.version})` : ""}.
          Windows will ask you to run it after the download finishes — SpidNums Desktop does not
          install itself automatically.
        </p>
      </Modal>
    </>
  );
}
