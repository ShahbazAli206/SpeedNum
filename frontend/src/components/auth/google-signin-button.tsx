"use client";

import { useEffect, useState } from "react";

import { ButtonLink } from "@/components/ui";
import { googleSignInUrl } from "@/lib/auth-client";
import { publicGet } from "@/lib/api";

function GoogleIcon() {
  // Google's standard four-colour "G" mark — no lucide equivalent exists
  // for brand logos, so this is the usual inline-SVG approach.
  return (
    <svg viewBox="0 0 18 18" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.61Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.19l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.69A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.16.28-1.69V4.98H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.02l2.99-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.98l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58Z"
      />
    </svg>
  );
}

/**
 * Renders nothing until the backend confirms Google credentials are
 * actually configured (GET /auth/oauth/providers) — never a NEXT_PUBLIC_*
 * env var, which would need a rebuild to reflect a config change and could
 * drift from what the backend actually has. `next` carries a deep-link
 * through the whole redirect chain the same way the plain login form does.
 */
export function GoogleSignInButton({ next }: { next?: string | null }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    publicGet<{ google: boolean }>("/auth/oauth/providers")
      .then((providers) => {
        if (!cancelled) setEnabled(Boolean(providers.google));
      })
      .catch(() => {
        // No backend, or the check failed — just don't offer the button.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!enabled) return null;

  return (
    <>
      <div className="my-5 flex items-center gap-3 text-[12px] text-muted">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      <ButtonLink
        href={googleSignInUrl(next)}
        variant="secondary"
        size="lg"
        icon={<GoogleIcon />}
        className="w-full"
      >
        Continue with Google
      </ButtonLink>
    </>
  );
}
