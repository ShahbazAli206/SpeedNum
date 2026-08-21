"use client";

import {
  ArrowRight,
  Ban,
  Building2,
  ChartLine,
  CheckCircle2,
  CreditCard,
  Mail,
  Send,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Alert, Badge, Button, Card, EmptyState, LoadingBlock } from "@/components/ui";
import {
  sendPlatformTestEmail,
  type EmailTestResult,
  type PlatformEmailStatus,
} from "@/lib/admin";
import { ApiError } from "@/lib/api";
import { useApi } from "@/lib/hooks";

const PROVIDER_LABEL: Record<PlatformEmailStatus["provider"], string> = {
  resend: "Resend (transactional email API)",
  smtp: "SMTP",
  none: "Not configured",
};

const QUICK_LINKS = [
  { label: "Manage tenants", href: "/admin", icon: Building2, hint: "Every firm on the platform" },
  { label: "Reach & analytics", href: "/admin/reach", icon: ChartLine, hint: "Traffic, footprint, scale" },
  { label: "Audit log", href: "/admin", icon: ScrollText, hint: "On the Admin console" },
];

export function PlatformSettingsClient() {
  const email = useApi<PlatformEmailStatus>("/admin/email");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<EmailTestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  if (email.error?.status === 403) {
    return (
      <EmptyState
        icon={<Ban className="size-6" />}
        title="Superadmin access required"
        description="Platform settings are restricted to the platform superadmin role."
      />
    );
  }

  const sendTest = async () => {
    setTestError(null);
    setTestResult(null);
    setTesting(true);
    try {
      setTestResult(await sendPlatformTestEmail());
    } catch (err) {
      setTestError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setTesting(false);
    }
  };

  const status = email.data;

  return (
    <div className="space-y-5">
      {/* Super admin */}
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
            <ShieldCheck className="size-4.5" />
          </span>
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Super admin</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              You&apos;re signed in as the platform owner. This area is restricted to the platform
              superadmin role and enforced on every request.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {QUICK_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="group flex items-center justify-between gap-2 rounded-lg border border-line bg-surface px-4 py-3 transition hover:border-brand hover:bg-surface-2"
            >
              <span className="flex items-center gap-2.5">
                <link.icon className="size-4 text-brand" />
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-medium text-ink">{link.label}</span>
                  <span className="block text-[11.5px] text-muted">{link.hint}</span>
                </span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted transition group-hover:text-brand" />
            </Link>
          ))}
        </div>
      </Card>

      {/* Platform email */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
              <Mail className="size-4.5" />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Platform email</h2>
              <p className="mt-0.5 text-[13px] text-muted">
                The default sender used by every firm without its own email config. Firms can
                override the from-name per tenant.
              </p>
            </div>
          </div>
          {status ? (
            <Badge tone={status.configured ? "success" : "warn"}>
              {status.configured ? (
                <>
                  <CheckCircle2 className="size-3.5" /> Connected
                </>
              ) : (
                "Not configured"
              )}
            </Badge>
          ) : null}
        </div>

        {email.isLoading || !status ? (
          <LoadingBlock label="Loading email status…" />
        ) : (
          <>
            {status.warnings.length > 0 ? (
              <Alert tone="warn" className="mt-4">
                <ul className="list-disc space-y-1 pl-4">
                  {status.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Alert>
            ) : null}

            <dl className="mt-4 grid gap-x-6 gap-y-3 rounded-lg border border-line p-4 sm:grid-cols-2">
              <Row label="Transport" value={PROVIDER_LABEL[status.provider]} />
              <Row label="From" value={status.sender} />
              <Row label="Reply-to" value={status.reply_to ?? "—"} />
              <Row label="Sender domain" value={status.sender_domain} mono />
              {status.smtp ? (
                <>
                  <Row label="SMTP host" value={`${status.smtp.host}:${status.smtp.port}`} mono />
                  <Row
                    label="SMTP security"
                    value={`${status.smtp.security}${status.smtp.authenticated ? " · authenticated" : ""}`}
                  />
                </>
              ) : null}
            </dl>

            {testResult ? (
              <Alert tone={testResult.ok ? "success" : "danger"} className="mt-4" onDismiss={() => setTestResult(null)}>
                {testResult.message}
              </Alert>
            ) : null}
            {testError ? (
              <Alert tone="danger" className="mt-4" onDismiss={() => setTestError(null)}>
                {testError}
              </Alert>
            ) : null}

            <div className="mt-4 flex items-center gap-2">
              <Button
                variant="secondary"
                icon={<Send className="size-4" />}
                onClick={sendTest}
                loading={testing}
                disabled={!status.configured}
              >
                Send test email
              </Button>
              <span className="text-[12px] text-muted">Sends a contentless test to your address.</span>
            </div>

            <Alert tone="info" className="mt-4">
              Transport, sender and API key are configured with environment variables on the API
              (<code className="font-mono text-[11px]">RESEND_API_KEY</code> /{" "}
              <code className="font-mono text-[11px]">SMTP_*</code> /{" "}
              <code className="font-mono text-[11px]">EMAIL_FROM</code>) and are deliberately not
              editable here — a long-lived credential is kept out of the database. Change them on the
              API service and redeploy.
            </Alert>
          </>
        )}
      </Card>

      {/* Plans & billing */}
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
            <CreditCard className="size-4.5" />
          </span>
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Plans &amp; billing</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              Plan and limits (max clients / users) are set per tenant in each firm&apos;s{" "}
              <Link href="/admin" className="text-brand hover:underline">
                edit form
              </Link>
              . Billing-processor integration (Stripe) isn&apos;t wired yet.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[12px] font-medium text-muted uppercase">{label}</dt>
      <dd className={mono ? "font-mono text-[12.5px] text-ink" : "text-[13.5px] text-ink"}>{value}</dd>
    </div>
  );
}
