"use client";

import { Check, Copy, Mail, MailWarning } from "lucide-react";
import { useState } from "react";

import { useToast } from "@/components/toast";
import { Alert, Button, Modal } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { CredentialResult } from "@/lib/types";

/**
 * Shows a freshly issued temporary password exactly once.
 *
 * Only the password hash is stored, so this is genuinely the only moment the value
 * exists anywhere outside the email — reopening the row later can offer a reset
 * but never a re-read. That is why it gets its own modal with a copy button
 * rather than a toast: a toast that auto-dismisses would lose the password for
 * good whenever mail delivery is not configured.
 */
export function CredentialsModal({
  result,
  onClose,
  kind = "account",
}: {
  result: CredentialResult | null;
  onClose: () => void;
  /** Wording only — "accountant", "client portal", … */
  kind?: string;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState<"password" | "both" | null>(null);

  const copy = async (text: string, which: "password" | "both") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Could not copy", "Select the text and copy it manually.");
    }
  };

  return (
    <Modal
      open={result !== null}
      onClose={onClose}
      title={`${result?.full_name || "Account"} is ready`}
      description={`Their ${kind} login has been created.`}
      footer={
        <Button className="w-full" onClick={onClose}>
          Done
        </Button>
      }
    >
      {result ? (
        <div className="space-y-4">
          <Alert
            tone={result.email_sent ? "success" : "warn"}
            title={result.email_sent ? "Credentials emailed" : "Email not sent"}
          >
            <span className="flex items-start gap-2">
              {result.email_sent ? (
                <Mail className="mt-0.5 size-4 shrink-0" />
              ) : (
                <MailWarning className="mt-0.5 size-4 shrink-0" />
              )}
              <span>{result.message}</span>
            </span>
          </Alert>

          <div className="rounded-xl border border-line bg-surface-2/60 p-4">
            <p className="mb-2 text-[11px] font-bold tracking-[0.06em] text-muted uppercase">
              Sign-in details
            </p>
            <dl className="space-y-2 text-[13.5px]">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">Email</dt>
                <dd className="min-w-0 truncate font-medium text-ink">{result.email}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">Temporary password</dt>
                <dd>
                  <button
                    type="button"
                    onClick={() => void copy(result.temp_password, "password")}
                    className="group inline-flex items-center gap-1.5 rounded bg-surface px-2 py-1 font-mono text-[12.5px] font-semibold text-ink transition hover:bg-brand-soft"
                    title="Copy password"
                  >
                    {result.temp_password}
                    {copied === "password" ? (
                      <Check className="size-3.5 text-success" />
                    ) : (
                      <Copy className="size-3.5 text-muted group-hover:text-brand" />
                    )}
                  </button>
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">Sign in at</dt>
                <dd className="min-w-0 truncate text-[12.5px] text-ink-soft">{result.login_url}</dd>
              </div>
            </dl>
          </div>

          <Button
            variant="secondary"
            className="w-full"
            icon={
              copied === "both" ? <Check className="size-4" /> : <Copy className="size-4" />
            }
            onClick={() =>
              void copy(
                `Email: ${result.email}\nTemporary password: ${result.temp_password}\nSign in at: ${result.login_url}`,
                "both",
              )
            }
          >
            {copied === "both" ? "Copied" : "Copy all sign-in details"}
          </Button>

          <p
            className={cn(
              "text-[12.5px] leading-relaxed",
              result.email_sent ? "text-muted" : "text-warn",
            )}
          >
            This password is shown only now — it is never stored in SpidNums. If it is lost, use
            &ldquo;Resend credentials&rdquo; to issue a new one.
          </p>
        </div>
      ) : null}
    </Modal>
  );
}
