"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { cn } from "@/lib/cn";
import { AUTH_CONFIGURED } from "@/lib/auth";
import { logout } from "@/lib/auth-client";

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

  return useCallback(async () => {
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
  }, [router]);
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
