"use client";

import { ArrowRight, Eye, EyeOff, TriangleAlert, User } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { GoogleSignInButton } from "@/components/auth/google-signin-button";
import { Alert, Button, Checkbox, Field, Input } from "@/components/ui";
import { get } from "@/lib/api";
import { login } from "@/lib/auth-client";
import { AUTH_CONFIGURED, validateEmail, validatePassword } from "@/lib/auth";
import type { Me } from "@/lib/types";

/** Where each kind of account lands. Mirrors src/proxy.ts. */
const FIRM_HOME = "/overview";
const PORTAL_HOME = "/dashboard";

/**
 * Resolve the signed-in account's home from the authoritative source.
 *
 * `profiles.client_id` decides which app someone belongs to, and only the API
 * knows it — the JWT carries a routing hint but an account created before that
 * hint existed has none. So ask, and fall back to
 * the firm app: a member of staff sent to the portal sees another client's
 * chrome and nothing of their own, whereas a portal user who briefly reaches a
 * firm route is bounced straight back by the proxy. The safer wrong guess wins.
 */
async function resolveHome(): Promise<string> {
  try {
    const me = await get<Me>("/auth/me");
    return me.profile.client_id ? PORTAL_HOME : FIRM_HOME;
  } catch {
    return FIRM_HOME;
  }
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // A deep link captured by the proxy's redirect wins over the role default.
  const requested = searchParams.get("next");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const nextErrors = {
      email: validateEmail(email),
      password: validatePassword(password),
    };
    setErrors(nextErrors);
    if (nextErrors.email || nextErrors.password) return;

    setPending(true);

    // Demo mode: no backend configured, so there is no role to read. The
    // firm app is the fuller surface, so that is where a demo lands.
    if (!AUTH_CONFIGURED) {
      router.push(requested ?? FIRM_HOME);
      return;
    }

    try {
      await login(email.trim(), password);
      router.push(requested ?? (await resolveHome()));
      router.refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not sign in.");
      setPending(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
          <User className="size-4.5" />
        </span>
        <span className="rounded-full bg-brand-soft px-3 py-1 text-[11px] font-bold tracking-[0.12em] text-brand uppercase">
          Client portal
        </span>
      </div>

      <h1 className="mt-6 text-[1.75rem] font-extrabold tracking-tight text-ink">Welcome back</h1>
      <p className="mt-1.5 text-[14.5px] text-muted">Sign in to your SpeedNum client portal.</p>

      {!AUTH_CONFIGURED ? (
        <div className="mt-5">
          <Alert tone="info" title="Demo mode">
            No backend is configured, so any valid-looking email and a 6-character password
            will open the portal with sample data.
          </Alert>
        </div>
      ) : null}

      {formError ? (
        <div className="mt-5">
          <Alert tone="danger" title="Couldn't sign in" onDismiss={() => setFormError(null)}>
            {formError}
          </Alert>
        </div>
      ) : null}

      <form onSubmit={submit} noValidate className="mt-7">
        <Field label="Work email" error={errors.email}>
          <Input
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@company.ca"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[13px] font-medium text-ink-soft">Password</span>
            <Link href="/forgot-password" className="text-[12.5px] font-medium text-brand hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              type={reveal ? "text" : "password"}
              name="password"
              autoComplete="current-password"
              placeholder="••••••••"
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
          {errors.password ? (
            <p className="mt-1 flex items-center gap-1 text-[12px] text-danger">
              <TriangleAlert className="size-3" />
              {errors.password}
            </p>
          ) : null}
        </div>

        <Checkbox
          label="Keep me signed in"
          name="remember"
          defaultChecked
          className="mt-4"
        />

        <Button
          type="submit"
          size="lg"
          loading={pending}
          className="mt-6 w-full"
          trailingIcon={<ArrowRight className="size-4" />}
        >
          Sign in
        </Button>
      </form>

      {AUTH_CONFIGURED ? <GoogleSignInButton next={requested} /> : null}

      <p className="mt-6 text-center text-[14px] text-muted">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-semibold text-brand hover:underline">
          Sign up
        </Link>
      </p>

      <p className="mt-8 text-center text-[12.5px] text-muted lg:hidden">
        Bank-grade security · CRA-compliant
      </p>
    </div>
  );
}
