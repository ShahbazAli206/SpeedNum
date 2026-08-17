"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, Button, Field, Input } from "@/components/ui";
import { post } from "@/lib/api";

/**
 * Lands here right after a brand-new "Continue with Google" signup —
 * Google supplies a name and a verified email, but never a firm name, so
 * this is the one field self-registration's SignupForm collects up front
 * that Google sign-in still needs to ask for afterward. Same
 * POST /auth/bootstrap the password-signup path uses.
 */
export function SetupFirmForm() {
  const router = useRouter();
  const [firmName, setFirmName] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    if (!firmName.trim()) {
      setFieldError("Enter your firm's name.");
      return;
    }
    setFieldError(undefined);
    setPending(true);
    try {
      await post("/auth/bootstrap", { firm_name: firmName.trim() });
      router.push("/overview");
      router.refresh();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Could not set up your firm.");
      setPending(false);
    }
  };

  return (
    <div>
      <h1 className="text-[1.75rem] font-extrabold tracking-tight text-ink">
        Almost there — name your firm
      </h1>
      <p className="mt-1.5 text-[14.5px] text-muted">
        You&apos;re signed in with Google. One more step to set up your practice workspace.
      </p>

      {formError ? (
        <div className="mt-5">
          <Alert tone="danger" title="Couldn't finish setup" onDismiss={() => setFormError(null)}>
            {formError}
          </Alert>
        </div>
      ) : null}

      <form onSubmit={submit} noValidate className="mt-7">
        <Field label="Firm name" error={fieldError}>
          <Input
            name="firm_name"
            autoComplete="organization"
            placeholder="Your Firm Name LLP"
            value={firmName}
            onChange={(event) => setFirmName(event.target.value)}
          />
        </Field>

        <Button
          type="submit"
          size="lg"
          loading={pending}
          className="mt-6 w-full"
          trailingIcon={<ArrowRight className="size-4" />}
        >
          Create workspace
        </Button>
      </form>
    </div>
  );
}
