"use client";

import { ArrowRight, CircleCheck, Mail } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Alert, Button, Field, Input } from "@/components/ui";
import { post } from "@/lib/api";
import { AUTH_CONFIGURED, validateEmail } from "@/lib/auth";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const emailError = validateEmail(email);
    setError(emailError);
    if (emailError) return;

    setPending(true);
    try {
      if (AUTH_CONFIGURED) {
        await post("/auth/forgot-password", { email: email.trim() });
      }
      // Same outcome whether or not a backend is configured, and regardless
      // of whether the address actually has an account — the API itself
      // returns this identical generic response either way, so a caller
      // can never use this form to check which emails are registered.
      setSent(true);
    } catch {
      // The backend's own generic response means this branch is really only
      // reachable on a network failure — still worth telling the user.
      setError("Could not reach the server. Try again in a moment.");
    } finally {
      setPending(false);
    }
  };

  if (sent) {
    return (
      <div>
        <span className="grid size-11 place-items-center rounded-full bg-brand-soft text-brand">
          <CircleCheck className="size-5" />
        </span>
        <h1 className="mt-4 text-[1.75rem] font-extrabold tracking-tight text-ink">Check your email</h1>
        <p className="mt-1.5 text-[14.5px] text-muted">
          If an account exists for <strong>{email.trim()}</strong>, a password reset link is on its
          way. The link expires in one hour.
        </p>
        <Link href="/login" className="mt-6 inline-block font-semibold text-brand hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
          <Mail className="size-4.5" />
        </span>
      </div>

      <h1 className="mt-6 text-[1.75rem] font-extrabold tracking-tight text-ink">Forgot your password?</h1>
      <p className="mt-1.5 text-[14.5px] text-muted">
        Enter your work email and we&apos;ll send you a link to reset it.
      </p>

      {!AUTH_CONFIGURED ? (
        <div className="mt-5">
          <Alert tone="info" title="Demo mode">
            No backend is configured — this form won&apos;t send a real email.
          </Alert>
        </div>
      ) : null}

      <form onSubmit={submit} noValidate className="mt-7">
        <Field label="Work email" error={error}>
          <Input
            type="email"
            autoComplete="email"
            placeholder="you@company.ca"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        <Button
          type="submit"
          size="lg"
          loading={pending}
          className="mt-6 w-full"
          trailingIcon={<ArrowRight className="size-4" />}
        >
          Send reset link
        </Button>
      </form>

      <p className="mt-6 text-center text-[14px] text-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
