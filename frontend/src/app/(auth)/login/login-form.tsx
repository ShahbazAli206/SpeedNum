"use client";

import { ArrowRight, Eye, EyeOff, TriangleAlert, User } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Alert, Button, Checkbox, Field, Input } from "@/components/ui";
import { SUPABASE_CONFIGURED, validateEmail, validatePassword } from "@/lib/auth";
import { supabaseBrowser } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";

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

    // Demo mode: no Supabase project configured, so go straight to the portal.
    if (!SUPABASE_CONFIGURED) {
      router.push(next);
      return;
    }

    try {
      const { error } = await supabaseBrowser().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setFormError(error.message);
        setPending(false);
        return;
      }
      router.push(next);
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

      {!SUPABASE_CONFIGURED ? (
        <div className="mt-5">
          <Alert tone="info" title="Demo mode">
            Supabase isn&apos;t configured, so any valid-looking email and a 6-character password
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
            <Link href="/login" className="text-[12.5px] font-medium text-brand hover:underline">
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
