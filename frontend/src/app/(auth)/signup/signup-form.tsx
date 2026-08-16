"use client";

import { ArrowRight, Eye, EyeOff, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Alert, Button, Checkbox, Field, Input } from "@/components/ui";
import { post } from "@/lib/api";
import { register } from "@/lib/auth-client";
import {
  AUTH_CONFIGURED,
  passwordStrength,
  validateEmail,
  validatePassword,
} from "@/lib/auth";
import { cn } from "@/lib/cn";
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
  const searchParams = useSearchParams();
  /**
   * Set when the visitor arrived from a "You have been invited" email
   * (`/signup?invite=<token>`). They are joining an existing firm, so the form
   * must NOT create a second one — see the two branches in `submit` below.
   */
  const inviteToken = searchParams.get("invite");
  const isInvited = Boolean(inviteToken);

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
      business:
        isInvited || values.business.trim() ? undefined : "Enter your firm's name.",
      email: validateEmail(values.email),
      password: validatePassword(values.password, 8),
      terms: agreed ? undefined : "Please accept the terms to continue.",
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    setPending(true);
    const fullName = `${values.firstName.trim()} ${values.lastName.trim()}`.trim();

    if (!AUTH_CONFIGURED) {
      router.push("/overview");
      return;
    }

    try {
      await register(values.email.trim(), values.password, fullName);

      if (isInvited) {
        // Attaches the brand-new profile to the inviting firm with the role the
        // invitation carried. Until this lands the account has no tenant, so
        // every firm page would refuse it.
        try {
          await post("/team/invitations/accept", { token: inviteToken, full_name: fullName });
        } catch (caught) {
          setFormError(
            caught instanceof Error
              ? `Your account was created, but the invitation could not be applied: ${caught.message}`
              : "Your account was created, but the invitation could not be applied.",
          );
          setPending(false);
          return;
        }
      } else {
        // Not joining an existing firm — create one and become its owner.
        // A signup with no tenant would have every firm page refuse it.
        try {
          await post("/auth/bootstrap", { firm_name: values.business.trim(), full_name: fullName });
        } catch (caught) {
          setFormError(
            caught instanceof Error
              ? `Your account was created, but your firm could not be set up: ${caught.message}`
              : "Your account was created, but your firm could not be set up.",
          );
          setPending(false);
          return;
        }
      }

      router.push("/overview");
      router.refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not create the account.");
      setPending(false);
    }
  };

  return (
    <div>
      <h1 className="text-[1.75rem] font-extrabold tracking-tight text-ink">
        {isInvited ? "Accept your invitation" : "Create your account"}
      </h1>
      <p className="mt-1.5 text-[14.5px] text-muted">
        {isInvited
          ? "Set a password and you'll join your firm's workspace with the role you were invited for."
          : `Start your ${PRICING.trialDays}-day free trial — no credit card required.`}
      </p>

      {!AUTH_CONFIGURED ? (
        <div className="mt-5">
          <Alert tone="info" title="Demo mode">
            No backend is configured, so this creates no real account — it opens the portal
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

        {isInvited ? null : (
          <Field
            label="Firm name"
            hint="Creates your practice workspace — you become its owner."
            error={errors.business}
            className="mt-4"
          >
            <Input
              autoComplete="organization"
              placeholder="Harrison CPA Professional Corporation"
              value={values.business}
              onChange={set("business")}
            />
          </Field>
        )}

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
              placeholder="At least 8 characters"
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
