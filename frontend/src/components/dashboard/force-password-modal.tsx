"use client";

import { ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useToast } from "@/components/toast";
import { Button, Field, Input, Modal } from "@/components/ui";
import { get, post } from "@/lib/api";
import { SUPABASE_CONFIGURED, validatePassword } from "@/lib/auth";
import { supabaseBrowser } from "@/lib/supabase/client";
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
  const searchParams = useSearchParams();
  // ?first_login=1 is known at mount time — fold it into the initial state
  // instead of a synchronous setState inside the effect below, which only
  // needs to handle the async GET /auth/me round trip.
  const [open, setOpen] = useState(() => searchParams.get("first_login") === "1");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!SUPABASE_CONFIGURED) return;

    let cancelled = false;
    get<Me>("/auth/me")
      .then((me) => {
        if (!cancelled && me.profile.must_change_password) setOpen(true);
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
      if (SUPABASE_CONFIGURED) {
        const { error: updateError } = await supabaseBrowser().auth.updateUser({ password });
        if (updateError) {
          setError(updateError.message);
          setSaving(false);
          return;
        }
        await post("/auth/complete-password-change");
      }
      toast.success("Password updated", "Use your new password the next time you sign in.");
      setOpen(false);
      setPassword("");
      setConfirm("");
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
      title="Set a new password"
      description="For your security, please replace the temporary password from your welcome email before continuing."
      footer={
        <Button className="w-full" icon={<ShieldCheck className="size-4" />} loading={saving} onClick={submit}>
          Update password
        </Button>
      }
    >
      <Field label="New password">
        <Input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>
      <div className="mt-4">
        <Field label="Confirm new password" error={error}>
          <Input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
