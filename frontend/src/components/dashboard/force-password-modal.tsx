"use client";

import { ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useToast } from "@/components/toast";
import { Button, Field, Modal, PasswordInput } from "@/components/ui";
import { get, post } from "@/lib/api";
import { AUTH_CONFIGURED, validatePassword } from "@/lib/auth";
import type { Me } from "@/lib/types";

/**
 * Forces a client-portal user who just used a temporary password (via the
 * welcome email, one-click or manual login) to set a real one before doing
 * anything else. Two independent triggers, either is enough to show it:
 *
 * - `?first_login=1` — set by the portal-login page right after a magic-link
 *   sign-in, and works even without a reachable backend (demo mode).
 * - `profile.must_change_password` from GET /auth/me — the authoritative
 *   source, also catches a manual login with the temporary password, or
 *   returning without having finished the prompt last time.
 */
export function ForcePasswordModal() {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  // ?first_login=1 is known at mount time — fold it into the initial state
  // instead of a synchronous setState inside the effect below, which only
  // needs to handle the async GET /auth/me round trip.
  const [open, setOpen] = useState(() => searchParams.get("first_login") === "1");
  // Set only by the server's answer. While true the API refuses every data
  // endpoint with 428, so letting the dialog be dismissed would strand the user
  // on a page of errors with no way to reopen it.
  const [forced, setForced] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!AUTH_CONFIGURED) return;

    let cancelled = false;
    get<Me>("/auth/me")
      .then((me) => {
        if (cancelled || !me.profile.must_change_password) return;
        setOpen(true);
        setForced(true);
      })
      .catch(() => {
        // Not signed in, or the API isn't reachable yet — nothing to force.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async () => {
    setError(null);
    const passwordError = validatePassword(password, 8);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setSaving(true);
    try {
      if (AUTH_CONFIGURED) {
        await post("/auth/change-password", { new_password: password });
      }
      toast.success("Password updated", "Use your new password the next time you sign in.");
      setOpen(false);
      setForced(false);
      setPassword("");
      setConfirm("");
      // Anything rendered while the account was still blocked came back 428.
      // Re-fetch now that the API will answer, rather than leaving the user on
      // a page of empty states until they navigate.
      if (forced) router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update your password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      dismissible={!forced}
      title="Set a new password"
      description={
        forced
          ? "Your account is using a temporary password. Replace it to continue — the rest of the app stays locked until you do."
          : "For your security, please replace the temporary password from your welcome email before continuing."
      }
      footer={
        <Button className="w-full" icon={<ShieldCheck className="size-4" />} loading={saving} onClick={submit}>
          Update password
        </Button>
      }
    >
      <Field label="New password">
        <PasswordInput
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>
      <div className="mt-4">
        <Field label="Confirm new password" error={error}>
          <PasswordInput
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
