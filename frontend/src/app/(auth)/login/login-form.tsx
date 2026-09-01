"use client";

import { ArrowRight, TriangleAlert, User } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { GoogleSignInButton } from "@/components/auth/google-signin-button";
import { Alert, Button, Checkbox, Field, Input, PasswordInput } from "@/components/ui";
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
    // A platform superadmin with no tenant (created directly, not through
    // firm signup — see DEPLOYMENT.md's "first superadmin" step) has nothing
    // for the firm dashboard to show: GET /dashboard 409s with "No firm is
    // linked to this account." /admin is the one firm-route-list page that
    // doesn't need a tenant. A superadmin who *also* owns a firm still lands
    // on it as normal — this only fires when there's no firm to land on.
    if (me.profile.is_superadmin && !me.profile.tenant_id) return "/admin";
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
          Sign in
        </span>
      </div>

      <h1 className="mt-6 text-[1.75rem] font-extrabold tracking-tight text-ink">Welcome back</h1>
      {/* This one form signs in both firm staff and client-portal accounts —
          resolveHome() below sorts out where each lands only after auth
          succeeds — so this copy must not claim either audience specifically. */}
      <p className="mt-1.5 text-[14.5px] text-muted">Sign in to your SpidNums account.</p>

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
          <PasswordInput
            name="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
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

      {/* No "Sign up" link — a company account is only ever created by a
          platform superadmin (POST /admin/tenants), who sets its seat
          package deliberately. Self-serve firm creation is disabled server-side
          too (POST /auth/bootstrap always 403s now) — see PLATFORM_IMPLEMENTATION_LOG.md. */}

      <p className="mt-8 text-center text-[12.5px] text-muted lg:hidden">
        Bank-grade security · CRA-compliant
      </p>
    </div>
  );
}
