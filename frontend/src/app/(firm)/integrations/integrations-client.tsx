"use client";

import {
  Calendar,
  HardDrive,
  Mail,
  Save,
  Send,
  TriangleAlert,
  Unplug,
} from "lucide-react";
import { useEffect, useState } from "react";

import { useToast } from "@/components/toast";
import { Badge, Button, Field, Input, Select } from "@/components/ui";
import type { RecentEmail } from "@/lib/firm-demo";
import { formatDate } from "@/lib/format";

const EMAIL_KEY = "speednum-email-integration";

interface EmailSettings {
  fromName: string;
  fromEmail: string;
  digestRecipient: string;
}

const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  fromName: "Harrison CPA",
  fromEmail: "notifications@harrisoncpa.ca",
  digestRecipient: "sarah@harrisoncpa.ca",
};

function loadEmailSettings(): EmailSettings {
  try {
    const raw = localStorage.getItem(EMAIL_KEY);
    if (!raw) return DEFAULT_EMAIL_SETTINGS;
    return { ...DEFAULT_EMAIL_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_EMAIL_SETTINGS;
  }
}

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

export function IntegrationsClient({ recentEmails }: { recentEmails: RecentEmail[] }) {
  const toast = useToast();
  const [settings, setSettings] = useState<EmailSettings>(DEFAULT_EMAIL_SETTINGS);

  useEffect(() => {
    // One-shot read of an external store the server cannot see.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(loadEmailSettings());
  }, []);

  const saveChanges = () => {
    try {
      localStorage.setItem(EMAIL_KEY, JSON.stringify(settings));
    } catch {
      // Private-mode quota failure — the in-memory value still applies this session.
    }
    toast.success("Email settings saved");
  };

  const sendTestEmail = () => {
    toast.info(
      "Test email not sent",
      "This demo shell isn't wired to a mail server yet — Save changes still records your settings.",
    );
  };

  const disconnect = () => {
    toast.info(
      "Not disconnected",
      "There's nothing live to disconnect in this demo — Gmail sending needs a real backend.",
    );
  };

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
          <Badge tone="success">Connected</Badge>
        </div>

        <div className="p-5">
          <Field label="Transport">
            <Select value="gmail" disabled>
              <option value="gmail">Gmail (live email via app password)</option>
            </Select>
          </Field>
          <p className="mt-1.5 text-[12px] text-muted">
            Gmail uses the GMAIL_USER / GMAIL_APP_PASSWORD set on the server. Mail is sent from
            that address.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="From name">
              <Input
                value={settings.fromName}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, fromName: event.target.value }))
                }
              />
            </Field>
            <Field label="From email">
              <Input
                type="email"
                value={settings.fromEmail}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, fromEmail: event.target.value }))
                }
              />
            </Field>
            <Field label="Digest recipient" className="sm:col-span-2">
              <Input
                type="email"
                value={settings.digestRecipient}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, digestRecipient: event.target.value }))
                }
              />
            </Field>
          </div>

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" icon={<Unplug className="size-4" />} onClick={disconnect}>
              Disconnect
            </Button>
            <Button variant="secondary" icon={<Send className="size-4" />} onClick={sendTestEmail}>
              Send test email
            </Button>
            <Button icon={<Save className="size-4" />} onClick={saveChanges}>
              Save changes
            </Button>
          </div>
        </div>

        <div className="border-t border-line px-5 py-4">
          <p className="mb-2 text-[11px] font-semibold tracking-wide text-muted uppercase">
            Recent emails
          </p>
          {recentEmails.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted">No emails sent yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {recentEmails.slice(0, 12).map((email) => (
                <li key={email.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium text-ink">{email.subject}</p>
                    <p className="truncate text-[12px] text-muted">
                      {email.recipient} · {formatDate(email.when)}
                    </p>
                  </div>
                  <Badge tone={email.status === "sent" ? "success" : "danger"} className="shrink-0">
                    {email.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
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
