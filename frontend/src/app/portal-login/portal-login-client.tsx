"use client";

import { CircleCheck, LoaderCircle, TriangleAlert } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui";
import { SUPABASE_CONFIGURED } from "@/lib/auth";
import { supabaseBrowser } from "@/lib/supabase/client";

type Status = "working" | "success" | "error";

/**
 * The link behind "Sign in to your dashboard" in the portal welcome email.
 * No login form is ever shown here — it exchanges the token embedded in the
 * URL for a real session (supabase.auth.verifyOtp), then hands off to
 * /dashboard. `first_login=1` tells the dashboard shell to show the "set a
 * new password" prompt without waiting on a round trip to the API.
 */
const MISSING_TOKEN_MESSAGE =
  "This sign-in link is missing its token. Ask your accountant to resend the welcome email.";

export function PortalLoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenHash = searchParams.get("token_hash");

  // Demo mode (no Supabase configured) or a missing token are both known at
  // mount time — fold them into the initial state instead of a synchronous
  // setState inside the effect below, which only needs to handle the async
  // verifyOtp round trip.
  const [status, setStatus] = useState<Status>(
    !SUPABASE_CONFIGURED ? "success" : !tokenHash ? "error" : "working",
  );
  const [errorMessage, setErrorMessage] = useState(!SUPABASE_CONFIGURED || tokenHash ? "" : MISSING_TOKEN_MESSAGE);

  useEffect(() => {
    // Demo mode: no Supabase project configured, so there is no real session
    // to establish — go straight to the dashboard, same as the login form.
    if (!SUPABASE_CONFIGURED) {
      const timeout = setTimeout(() => router.replace("/dashboard?first_login=1"), 500);
      return () => clearTimeout(timeout);
    }
    if (!tokenHash) return;

    let cancelled = false;
    supabaseBrowser()
      .auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" })
      .then(({ error }) => {
        if (cancelled) return;
        if (error) {
          setStatus("error");
          setErrorMessage(error.message || "This sign-in link is no longer valid.");
          return;
        }
        setStatus("success");
        router.replace("/dashboard?first_login=1");
        router.refresh();
      });

    return () => {
      cancelled = true;
    };
    // Runs once on mount — re-verifying on every searchParams identity change
    // would just retry a token that already has an effect in flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="w-full max-w-sm text-center">
      <div className="mb-6 flex justify-center">
        <Logo href={null} size={32} />
      </div>

      {status === "error" ? (
        <>
          <span className="mx-auto grid size-11 place-items-center rounded-full bg-danger-soft text-danger">
            <TriangleAlert className="size-5" />
          </span>
          <h1 className="mt-4 text-lg font-semibold text-ink">Couldn&apos;t sign you in</h1>
          <p className="mt-1.5 text-[14px] text-muted">{errorMessage}</p>
          <ButtonLink href="/login" variant="secondary" className="mt-6">
            Go to the sign-in page
          </ButtonLink>
        </>
      ) : (
        <>
          <span className="mx-auto grid size-11 place-items-center rounded-full bg-brand-soft text-brand">
            {status === "success" ? (
              <CircleCheck className="size-5" />
            ) : (
              <LoaderCircle className="size-5 animate-spin" />
            )}
          </span>
          <h1 className="mt-4 text-lg font-semibold text-ink">
            {status === "success" ? "You're signed in" : "Signing you in…"}
          </h1>
          <p className="mt-1.5 text-[14px] text-muted">Taking you to your dashboard…</p>
        </>
      )}
    </div>
  );
}
