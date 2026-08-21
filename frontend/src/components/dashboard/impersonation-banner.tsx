"use client";

import { LogOut, ShieldAlert } from "lucide-react";
import { useState } from "react";

import { exitImpersonation } from "@/lib/auth-client";
import { useSession } from "@/lib/session";

/**
 * Shown across the firm surface while a platform superadmin is impersonating a
 * firm (Me.is_impersonating). Makes the borrowed identity impossible to miss —
 * the whole point of impersonation is that the app otherwise looks exactly like
 * the firm's own — and offers the one-click way back to the platform console.
 */
export function ImpersonationBanner() {
  const session = useSession();
  const [leaving, setLeaving] = useState(false);

  if (!session.isImpersonating) return null;

  const firmName = session.me?.tenant?.name ?? "this firm";

  const exit = async () => {
    setLeaving(true);
    await exitImpersonation();
    // Full navigation so the proxy and shell re-read the superadmin session
    // rather than keep rendering the impersonated firm's tree.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/admin");
  };

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-violet-300/60 bg-violet-50 px-4 py-2.5 text-violet-900 sm:px-6 dark:border-violet-500/30 dark:bg-violet-950/40 dark:text-violet-200">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-violet-600 text-white">
        <ShieldAlert className="size-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold">
          Viewing <span className="font-bold">{firmName}</span> as super admin
        </p>
        <p className="text-[12px] text-violet-800/80 dark:text-violet-300/80">
          You&apos;re seeing this firm&apos;s data. Changes you make apply to this tenant.
        </p>
      </div>
      <button
        type="button"
        onClick={exit}
        disabled={leaving}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-60"
      >
        <LogOut className="size-3.5" />
        {leaving ? "Exiting…" : "Exit to platform"}
      </button>
    </div>
  );
}
