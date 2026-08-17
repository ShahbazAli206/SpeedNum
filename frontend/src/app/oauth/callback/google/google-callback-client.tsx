"use client";

import { CircleCheck, LoaderCircle, TriangleAlert } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui";
import { oauthCallback } from "@/lib/auth-client";

type Status = "working" | "success" | "error";

const FIRM_HOME = "/overview";
const PORTAL_HOME = "/dashboard";

/** Google's own cancellation code, not ours — shown as a plain "you
 * cancelled" message rather than the generic failure below. */
function messageFor(errorParam: string | null): string | null {
  if (!errorParam) return null;
  if (errorParam === "access_denied") return "Sign-in with Google was cancelled.";
  return "Google could not complete sign-in.";
}

export function GoogleCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const providerError = messageFor(searchParams.get("error"));

  const [status, setStatus] = useState<Status>(providerError || !code || !state ? "error" : "working");
  const [errorMessage, setErrorMessage] = useState(
    providerError ?? (!code || !state ? "This sign-in link is missing its code. Please try again." : ""),
  );

  useEffect(() => {
    if (!code || !state || providerError) return;

    let cancelled = false;
    oauthCallback("google", code, state)
      .then((result) => {
        if (cancelled) return;
        setStatus("success");
        const destination = result.is_new_account
          ? "/oauth/setup-firm"
          : (result.next_path ?? (result.profile.client_id ? PORTAL_HOME : FIRM_HOME));
        router.replace(destination);
        router.refresh();
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus("error");
        setErrorMessage(error instanceof Error ? error.message : "Google sign-in failed.");
      });

    return () => {
      cancelled = true;
    };
    // Runs once on mount — the code is single-use, so retrying on a
    // dependency change would just fail against an already-consumed code.
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
            {status === "success" ? "You're signed in" : "Finishing sign-in with Google…"}
          </h1>
          <p className="mt-1.5 text-[14px] text-muted">One moment…</p>
        </>
      )}
    </div>
  );
}
