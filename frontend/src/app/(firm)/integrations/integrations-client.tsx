"use client";

/**
 * Integrations — email delivery status/config and Google Workspace.
 *
 * This used to be a demo shell: "From email" / "digest recipient" lived only
 * in localStorage, "Save changes" never called the API, "Send test email" and
 * "Disconnect" were both no-op toasts, and "Recent emails" rendered a fixture
 * list from lib/firm-demo. None of that reflected anything the backend
 * actually does.
 *
 * The real surface here is narrower than the old UI implied:
 *   GET  /settings/email        — live transport status (provider, sender, warnings)
 *   POST /settings/email/test   — sends a real message through that transport
 *   PATCH /settings/tenant      — the only per-tenant email field is `email_from_name`;
 *                                  the sender address and transport are server env config,
 *                                  not something a tenant can change here.
 * There is no backend concept of "digest recipient" (see Settings → Email alerts
 * for the real per-person opt-in) or of "disconnecting" email — it's an env-configured
 * transport, not a per-tenant OAuth connection — so those controls are gone rather
 * than faked. Same for "recent emails": nothing persists a send log, so nothing is shown.
 */

import {
  Calendar,
  HardDrive,
  Mail,
  Save,
  Send,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";

import { useToast } from "@/components/toast";
import { Badge, Button, Field, Input, Select } from "@/components/ui";
import { patch, post } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useSession } from "@/lib/session";

interface EmailStatus {
  provider: "resend" | "smtp" | "none";
  configured: boolean;
  sender: string;
  sender_domain: string;
  reply_to: string | null;
  warnings: string[];
}

const PROVIDER_LABEL: Record<EmailStatus["provider"], string> = {
  resend: "Resend (transactional email API)",
  smtp: "SMTP",
  none: "Not configured",
};

const GOOGLE_APPS = [
  {
    key: "calendar",
    icon: Calendar,
    label: "Calendar",
    description: "Push task & service deadlines as events",
  },
  {
    key: "drive",
    icon: HardDrive,
    label: "Drive",
    description: "Store client documents & signed letters",
  },
  {
    key: "gmail",
    icon: Mail,
    label: "Gmail",
    description: "Send the firm's emails from its own account",
  },
];

function reason(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function IntegrationsClient() {
  const toast = useToast();
  const status = useApi<EmailStatus>("/settings/email");
  const { me, refresh } = useSession();

  const [fromName, setFromName] = useState("");
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFromName(me?.tenant?.email_from_name ?? "");
  }, [me]);

  const saveChanges = async () => {
    setSaving(true);
    try {
      await patch("/settings/tenant", { email_from_name: fromName || null });
      refresh();
      toast.success("Email settings saved", "New messages will show this From name.");
    } catch (error) {
      toast.error("Couldn't save that", reason(error, "Please try again."));
    } finally {
      setSaving(false);
    }
  };

  const sendTestEmail = async () => {
    setSendingTest(true);
    try {
      const result = await post<{ ok: boolean; message: string; error: string | null }>(
        "/settings/email/test",
        {},
      );
      if (result.ok) {
        toast.success("Test email sent", result.message);
      } else {
        toast.error("Delivery failed", result.error || result.message);
      }
    } catch (error) {
      toast.error("Couldn't send test email", reason(error, "Try again."));
    } finally {
      setSendingTest(false);
    }
  };

  const badgeTone = status.data?.configured ? "success" : status.isLoading ? "neutral" : "warn";
  const badgeLabel = status.isLoading
    ? "Checking…"
    : status.data?.configured
      ? "Connected"
      : "Not configured";

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-[1.6rem] font-bold tracking-tight text-ink">
          Integrations
        </h1>
        <p className="mt-1 text-[14px] text-muted">
          Connect the tools your firm uses — email, Google Calendar, Drive and Gmail.
        </p>
      </div>

      <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
              <Mail className="size-4.5" />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Email</h2>
              <p className="mt-0.5 text-[13px] text-muted">
                Sends reminder digests and (later) engagement letters.
              </p>
            </div>
          </div>
          <Badge tone={badgeTone}>{badgeLabel}</Badge>
        </div>

        <div className="p-5">
          <Field label="Transport">
            <Select
              value={status.data?.provider ?? "none"}
              onValueChange={() => {}}
              disabled
              options={[
                {
                  value: status.data?.provider ?? "none",
                  label: PROVIDER_LABEL[status.data?.provider ?? "none"],
                },
              ]}
            />
          </Field>
          <p className="mt-1.5 text-[12px] text-muted">
            {status.data
              ? `Mail goes out as ${status.data.sender}. Set on the server via RESEND_API_KEY / SMTP_* — not editable per firm.`
              : "Mail transport is configured on the server via RESEND_API_KEY or SMTP_*. Without one, messages are logged instead of sent."}
          </p>
          {status.data && status.data.warnings.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {status.data.warnings.map((warning) => (
                <li key={warning} className="flex items-start gap-1.5 text-[12px] text-warn">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  <span>{warning}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              label="From name"
              hint="Shown as the sender's display name on every email this firm sends."
            >
              <Input value={fromName} onChange={(event) => setFromName(event.target.value)} />
            </Field>
          </div>

          <p className="mt-4 text-[12px] text-muted">
            Who receives the daily deadline &amp; task digest is set per person under{" "}
            <span className="font-medium text-ink-soft">Settings → Email alerts</span>, not here.
          </p>

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              icon={<Send className="size-4" />}
              loading={sendingTest}
              onClick={() => void sendTestEmail()}
            >
              Send test email
            </Button>
            <Button icon={<Save className="size-4" />} loading={saving} onClick={() => void saveChanges()}>
              Save changes
            </Button>
          </div>
        </div>
      </section>

      <section className="mt-5 rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-[#4285F4]/10 text-[15px] font-bold text-[#4285F4]">
              G
            </span>
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Google Workspace</h2>
              <p className="mt-0.5 text-[13px] text-muted">
                Connect this firm&apos;s Google account for Calendar, Drive &amp; Gmail.
              </p>
            </div>
          </div>
          <Badge tone="warn">Setup required</Badge>
        </div>

        <ul className="divide-y divide-line">
          {GOOGLE_APPS.map((app) => (
            <li key={app.key} className="flex items-center gap-3 px-5 py-3.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-soft">
                <app.icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium text-ink">{app.label}</p>
                <p className="text-[12px] text-muted">{app.description}</p>
              </div>
              <span className="text-[13px] text-muted">—</span>
            </li>
          ))}
        </ul>

        <div className="flex items-start gap-2.5 border-t border-line bg-warn-soft/50 px-5 py-3.5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <p className="text-[13px] leading-relaxed text-ink-soft">
            Google credentials aren&apos;t set on the server yet. An operator must add the Google
            Cloud OAuth client —{" "}
            <span className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11.5px]">
              docs/google-integration.md
            </span>
            . Once connected, status will show live here and syncing events, files and sending via
            Gmail will follow.
          </p>
        </div>
      </section>
    </>
  );
}
