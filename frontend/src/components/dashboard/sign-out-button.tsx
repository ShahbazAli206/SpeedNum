"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { useConfirm } from "@/components/confirm";
import { useTimer } from "@/components/tasks/timer-provider";
import { cn } from "@/lib/cn";
import { post } from "@/lib/api";
import { AUTH_CONFIGURED } from "@/lib/auth";
import { logout } from "@/lib/auth-client";
import { useSession } from "@/lib/session";

/**
 * Signs the user out for real.
 *
 * Both shells previously rendered a plain `<Link href="/login">` here, which did
 * not end the session — and because `src/proxy.ts` bounces a *signed-in* user
 * away from /login, clicking "Sign out" actually landed them back in the app.
 * Revoking the session first is what makes the redirect stick.
 */
/**
 * The sign-out action on its own, for callers that render their own control —
 * the account menus in both shells put it in a dropdown rather than a button.
 */
export function useSignOut() {
  const router = useRouter();
  // A no-op outside the firm shell (client-portal logins never mount
  // TimerProvider — see components/tasks/timer-provider.tsx's fallback), so
  // this is safe to call from either shell without checking which one first.
  const { stopIfRunning } = useTimer();
  const confirm = useConfirm();
  const session = useSession();

  return useCallback(async () => {
    // Timesheet attendance is a non-owner-staff concept only (Profile.client_id
    // null AND not the company Owner/a superadmin) — a client-portal login
    // (isFirmStaff false) or the Owner (isOwner true) skips straight to
    // signing out, same as before this feature existed. Mirrors the backend's
    // own exclusion in services/attendance._tracks_attendance.
    if (session.isFirmStaff && !session.isOwner && session.isLive) {
      const confirmedEndOfDay = await confirm({
        title: "End your work day?",
        description: "Is this your job end time? Confirming marks it as today's sign-off on your Timesheet.",
        confirmLabel: "Yes, that's my end time",
        cancelLabel: "No, just sign out",
      });
      if (confirmedEndOfDay) {
        try {
          await post("/timesheet/attendance/logout-confirm");
        } catch {
          // Signing out should never hang on this — worst case today's row
          // stays unconfirmed, exactly like declining the prompt.
        }
      }
    }

    await stopIfRunning();
    try {
      if (AUTH_CONFIGURED) {
        await logout();
      }
    } catch {
      // Already signed out, or the API is unreachable — the redirect below is
      // still the right outcome.
    }
    // refresh() re-runs the proxy so the server forgets the session cookie too.
    router.replace("/login");
    router.refresh();
  }, [confirm, router, session.isFirmStaff, session.isOwner, session.isLive, stopIfRunning]);
}

export function SignOutButton({ className }: { className?: string }) {
  const [pending, setPending] = useState(false);
  const signOutNow = useSignOut();

  const signOut = async () => {
    setPending(true);
    await signOutNow();
  };

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      disabled={pending}
      aria-label="Sign out"
      title="Sign out"
      className={cn(
        "shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-surface hover:text-danger disabled:opacity-50",
        className,
      )}
    >
      <LogOut className="size-4" />
    </button>
  );
}
