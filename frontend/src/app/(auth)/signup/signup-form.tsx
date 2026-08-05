"use client";

import { ArrowRight, Eye, EyeOff, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, Button, Checkbox, Field, Input } from "@/components/ui";
import {
  SUPABASE_CONFIGURED,
  passwordStrength,
  validateEmail,
  validatePassword,
} from "@/lib/auth";
import { cn } from "@/lib/cn";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PRICING } from "@/lib/site";

interface Errors {
  firstName?: string;
  lastName?: string;
  business?: string;
  email?: string;
  password?: string;
  terms?: string;
}

const STRENGTH_BAR = [
  "bg-danger",
  "bg-danger",
  "bg-warn",
  "bg-info",
  "bg-success",
];

export function SignupForm() {
  const router = useRouter();
  const [values, setValues] = useState({
    firstName: "",
    lastName: "",
    business: "",
    email: "",
    password: "",
  });
  const [agreed, setAgreed] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});

  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  const strength = passwordStrength(values.password);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const next: Errors = {
      firstName: values.firstName.trim() ? undefined : "Enter your first name.",
      lastName: values.lastName.trim() ? undefined : "Enter your last name.",
      business: values.business.trim() ? undefined : "Enter your business name.",
      email: validateEmail(values.email),
      password: validatePassword(values.password),
      terms: agreed ? undefined : "Please accept the terms to continue.",
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    setPending(true);

    if (!SUPABASE_CONFIGURED) {
      router.push("/dashboard");
      return;
    }

    try {
      const { error } = await supabaseBrowser().auth.signUp({
        email: values.email.trim(),
        password: values.password,
        options: {
          data: {
            full_name: `${values.firstName.trim()} ${values.lastName.trim()}`.trim(),
            business_name: values.business.trim(),
          },
        },
      });
      if (error) {
        setFormError(error.message);
        setPending(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not create the account.");
      setPending(false);
    }
  };

  return (
    <div>
      <h1 className="text-[1.75rem] font-extrabold tracking-tight text-ink">
        Create your account
      </h1>
      <p className="mt-1.5 text-[14.5px] text-muted">
        Start your {PRICING.trialDays}-day free trial — no credit card required.
      </p>

      {!SUPABASE_CONFIGURED ? (
        <div className="mt-5">
          <Alert tone="info" title="Demo mode">
            Supabase isn&apos;t configured, so this creates no real account — it opens the portal
            with sample data.
          </Alert>
        </div>
      ) : null}

      {formError ? (
        <div className="mt-5">
          <Alert tone="danger" title="Couldn't sign up" onDismiss={() => setFormError(null)}>
            {formError}
          </Alert>
        </div>
      ) : null}

      <form onSubmit={submit} noValidate className="mt-7">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" error={errors.firstName}>
            <Input
              autoComplete="given-name"
              placeholder="Emily"
              value={values.firstName}
              onChange={set("firstName")}
            />
          </Field>
          <Field label="Last name" error={errors.lastName}>
            <Input
              autoComplete="family-name"
              placeholder="Carter"
              value={values.lastName}
              onChange={set("lastName")}
            />
          </Field>
        </div>

        <Field label="Business name" error={errors.business} className="mt-4">
          <Input
            autoComplete="organization"
            placeholder="Maple Retail Co."
            value={values.business}
            onChange={set("business")}
          />
        </Field>

        <Field label="Work email" error={errors.email} className="mt-4">
          <Input
            type="email"
            autoComplete="email"
            placeholder="you@company.ca"
            value={values.email}
            onChange={set("email")}
          />
        </Field>

        <div className="mt-4">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Password</span>
          <div className="relative">
            <Input
              type={reveal ? "text" : "password"}
              autoComplete="new-password"
              placeholder="At least 6 characters"
              className="pr-10"
              value={values.password}
              onChange={set("password")}
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

          {values.password ? (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex flex-1 gap-1" aria-hidden>
                {[0, 1, 2, 3].map((index) => (
                  <span
                    key={index}
                    className={cn(
                      "h-1 flex-1 rounded-full transition-colors",
                      index < strength.score ? STRENGTH_BAR[strength.score] : "bg-surface-3",
                    )}
                  />
                ))}
              </div>
              <span className="text-[11.5px] text-muted">{strength.label}</span>
            </div>
          ) : null}

          {errors.password ? (
            <p className="mt-1 flex items-center gap-1 text-[12px] text-danger">
              <TriangleAlert className="size-3" />
              {errors.password}
            </p>
          ) : null}
        </div>

        <div className="mt-5">
          <Checkbox
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
            label={
              <>
                I agree to the{" "}
                <Link href="/terms" className="font-medium text-brand hover:underline">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="font-medium text-brand hover:underline">
                  Privacy Policy
                </Link>
                .
              </>
            }
          />
          {errors.terms ? (
            <p className="mt-1 flex items-center gap-1 text-[12px] text-danger">
              <TriangleAlert className="size-3" />
              {errors.terms}
            </p>
          ) : null}
        </div>

        <Button
          type="submit"
          size="lg"
          loading={pending}
          className="mt-6 w-full"
          trailingIcon={<ArrowRight className="size-4" />}
        >
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-[14px] text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
