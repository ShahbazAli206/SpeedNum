"use client";

import { CircleCheck, Eye, EyeOff, KeyRound, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { Alert, Button, Field, Input } from "@/components/ui";
import { post } from "@/lib/api";
import { AUTH_CONFIGURED, validatePassword } from "@/lib/auth";

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [reveal, setReveal] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <div>
        <span className="grid size-11 place-items-center rounded-full bg-danger-soft text-danger">
          <TriangleAlert className="size-5" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-ink">This link is missing its token</h1>
        <p className="mt-1.5 text-[14px] text-muted">
          Request a new password reset link and open the one in that email.
        </p>
        <Link href="/forgot-password" className="mt-6 inline-block font-semibold text-brand hover:underline">
          Request a new link
        </Link>
      </div>
    );
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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

    setPending(true);
    try {
      if (AUTH_CONFIGURED) {
        await post("/auth/reset-password", { token, password });
      }
      setDone(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not reset your password.");
    } finally {
      setPending(false);
    }
  };

  if (done) {
    return (
      <div>
        <span className="grid size-11 place-items-center rounded-full bg-brand-soft text-brand">
          <CircleCheck className="size-5" />
        </span>
        <h1 className="mt-4 text-[1.75rem] font-extrabold tracking-tight text-ink">Password updated</h1>
        <p className="mt-1.5 text-[14.5px] text-muted">Sign in with your new password.</p>
        <Link
          href="/login"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-brand px-5 py-2.5 text-[14px] font-semibold text-white hover:opacity-90"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
          <KeyRound className="size-4.5" />
        </span>
      </div>

      <h1 className="mt-6 text-[1.75rem] font-extrabold tracking-tight text-ink">Choose a new password</h1>
      <p className="mt-1.5 text-[14.5px] text-muted">This link can only be used once.</p>

      {!AUTH_CONFIGURED ? (
        <div className="mt-5">
          <Alert tone="info" title="Demo mode">
            No backend is configured — this form won&apos;t reset a real password.
          </Alert>
        </div>
      ) : null}

      {error ? (
        <div className="mt-5">
          <Alert tone="danger" title="Couldn't reset your password" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        </div>
      ) : null}

      <form onSubmit={submit} noValidate className="mt-7">
        <Field label="New password">
          <div className="relative">
            <Input
              type={reveal ? "text" : "password"}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              className="pr-10"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              type="button"
              onClick={() => setReveal((value) => !value)}
              aria-label={reveal ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted transition hover:text-ink"
            >
              {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>

        <div className="mt-4">
          <Field label="Confirm new password">
            <Input
              type={reveal ? "text" : "password"}
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </Field>
        </div>

        <Button type="submit" size="lg" loading={pending} className="mt-6 w-full">
          Reset password
        </Button>
      </form>
    </div>
  );
}
