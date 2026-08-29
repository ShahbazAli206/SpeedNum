"use client";

import { ArrowRight, ShieldOff } from "lucide-react";

import { ButtonLink, EmptyState } from "@/components/ui";

/**
 * Used to be the "one more step" after a brand-new "Continue with Google"
 * signup — create a firm on the spot, same POST /auth/bootstrap the
 * password-signup path used. Self-serve firm creation is disabled now (see
 * PLATFORM_IMPLEMENTATION_LOG.md): a company account is only ever created
 * by a platform superadmin, who sets its seat package deliberately.
 * google-callback-client.tsx no longer routes a new Google account here at
 * all; this stays only so a stale bookmark or link lands on an explanation
 * instead of a broken form.
 */
export function SetupFirmForm() {
  return (
    <EmptyState
      icon={<ShieldOff className="size-6" />}
      title="Accounts are provisioned by your provider"
      description="There's no open sign-up — your platform provider creates your company account and its first login."
      action={
        <ButtonLink href="/login" trailingIcon={<ArrowRight className="size-4" />}>
          Go to sign in
        </ButtonLink>
      }
    />
  );
}
