"use client";

import { ImagePlus, Mail, Palette, Save } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useToast } from "@/components/toast";
import { Button, Checkbox, Field, Input, Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import { post } from "@/lib/api";

import {
  FALLBACK_BRANDING,
  FONT_OPTIONS,
  useBranding,
  type FirmBranding,
} from "@/components/firm/branding";

const ALERTS_KEY = "speednum-email-alerts";

interface AlertPrefs {
  recipient: string;
  tasks: boolean;
  remindersAndServices: boolean;
}

const DEFAULT_ALERTS: AlertPrefs = {
  recipient: "hello@harrisoncpa.ca",
  tasks: true,
  remindersAndServices: true,
};

function loadAlerts(): AlertPrefs {
  try {
    const raw = localStorage.getItem(ALERTS_KEY);
    if (!raw) return DEFAULT_ALERTS;
    return { ...DEFAULT_ALERTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_ALERTS;
  }
}

export function SettingsClient() {
  const toast = useToast();
  const { branding, saveBranding } = useBranding();

  const [form, setForm] = useState<FirmBranding>(branding);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [alerts, setAlerts] = useState<AlertPrefs>(DEFAULT_ALERTS);

  // Sync once the provider has hydrated from the tenant record (it starts
  // from FALLBACK_BRANDING on first render, then applies the real value once
  // /auth/me resolves) — without this the form would keep showing stale defaults.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(branding);
  }, [branding]);

  useEffect(() => {
    // One-shot read of an external store the server cannot see.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAlerts(loadAlerts());
  }, []);

  const update = <K extends keyof FirmBranding>(key: K, value: FirmBranding[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSaveBranding = async () => {
    if (!form.name.trim()) {
      toast.error("Firm name is required");
      return;
    }
    setSaving(true);
    try {
      await saveBranding(form);
      toast.success("Branding saved", "Applied across your portal, emails and engagement letters.");
    } catch (error) {
      toast.error(
        "Couldn't save branding",
        error instanceof Error ? error.message : "Something went wrong. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const saveAlerts = () => {
    try {
      localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
    } catch {
      // Private-mode quota failure — the in-memory value still applies this session.
    }
    toast.success("Alert preferences saved");
  };

  const sendNow = async () => {
    if (!alerts.recipient.trim()) {
      toast.error("Enter an alert recipient email first");
      return;
    }
    setSendingTest(true);
    try {
      const result = await post<{ ok: boolean; message: string; error: string | null }>(
        "/settings/email/test",
        { to: alerts.recipient },
      );
      if (result.ok) {
        toast.success("Test email sent", result.message);
      } else {
        toast.error("Delivery failed", result.error || result.message);
      }
    } catch (error) {
      toast.error("Couldn't send test email", error instanceof Error ? error.message : "Try again.");
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-[1.6rem] font-bold tracking-tight text-ink">Settings</h1>
        <p className="mt-1 text-[14px] text-muted">Your firm&apos;s branding and alert preferences.</p>
      </div>

      <Section
        icon={<Palette className="size-4.5" />}
        title="Branding"
        description="Your logo, colours and font — applied across your portal, emails and engagement letters."
      >
        <div
          className="flex items-center gap-3.5 rounded-xl p-5 text-white shadow-[var(--shadow-card)] transition-[background]"
          style={{ background: `linear-gradient(135deg, ${form.primary} 0%, ${form.primaryDark} 100%)` }}
        >
          {form.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={form.logoUrl}
              alt=""
              className="size-11 shrink-0 rounded-lg bg-white/90 object-contain p-1"
            />
          ) : (
            <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-white text-lg font-bold text-ink">
              {form.name.slice(0, 1).toUpperCase() || "F"}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-[16px] font-bold">{form.name || "Your firm"}</p>
            <p className="truncate text-[12.5px] text-white/85">{form.tagline}</p>
          </div>
        </div>

        <div className="mt-5">
          <p className="mb-1.5 text-[13px] font-medium text-ink-soft">Logo</p>
          <LogoDropzone value={form.logoUrl || null} onChange={(value) => update("logoUrl", value ?? "")} />
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Firm name" required>
            <Input value={form.name} onChange={(event) => update("name", event.target.value)} />
          </Field>
          <Field label="Tagline">
            <Input value={form.tagline} onChange={(event) => update("tagline", event.target.value)} />
          </Field>
          <ColorField
            label="Primary colour"
            value={form.primary}
            onChange={(value) => update("primary", value)}
            placeholder={FALLBACK_BRANDING.primary}
          />
          <ColorField
            label="Primary (dark)"
            value={form.primaryDark}
            onChange={(value) => update("primaryDark", value)}
            placeholder={FALLBACK_BRANDING.primaryDark}
          />
          <Field label="Font family">
            <Select
              value={form.font}
              onValueChange={(next) => update("font", next)}
              options={FONT_OPTIONS}
            />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(event) => update("phone", event.target.value)} />
          </Field>
          <Field
            label="Contact / reply-to email"
            hint="Used as the reply-to address on engagement letters and every other firm email."
          >
            <Input
              type="email"
              value={form.email}
              onChange={(event) => update("email", event.target.value)}
            />
          </Field>
          <Field label="Address">
            <Input value={form.address} onChange={(event) => update("address", event.target.value)} />
          </Field>
        </div>

        <div className="mt-5">
          <Button icon={<Save className="size-4" />} loading={saving} onClick={handleSaveBranding}>
            Save branding
          </Button>
        </div>
      </Section>

      <Section
        icon={<Mail className="size-4.5" />}
        title="Email alerts"
        description="Get an email when tasks or reminders are due or overdue. Delivered via your Email integration and sent automatically each morning."
        className="mt-5"
      >
        <Field label="Alert recipient email" hint="Where deadline alert emails are sent.">
          <Input
            type="email"
            value={alerts.recipient}
            onChange={(event) => setAlerts((current) => ({ ...current, recipient: event.target.value }))}
          />
        </Field>

        <div className="mt-3 space-y-1">
          <Checkbox
            label="Alert me about due/overdue tasks"
            checked={alerts.tasks}
            onChange={(event) => setAlerts((current) => ({ ...current, tasks: event.target.checked }))}
          />
          <Checkbox
            label="Alert me about due/overdue reminders & services"
            checked={alerts.remindersAndServices}
            onChange={(event) =>
              setAlerts((current) => ({ ...current, remindersAndServices: event.target.checked }))
            }
          />
        </div>

        <div className="mt-4 flex gap-2">
          <Button icon={<Save className="size-4" />} onClick={saveAlerts}>
            Save
          </Button>
          <Button
            variant="secondary"
            icon={<Mail className="size-4" />}
            loading={sendingTest}
            onClick={sendNow}
          >
            Send test email
          </Button>
        </div>
      </Section>
    </>
  );
}

function Section({
  icon,
  title,
  description,
  children,
  className,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <div className="flex items-start gap-3 border-b border-line px-5 py-4">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-soft">
          {icon}
        </span>
        <div>
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          <p className="mt-0.5 text-[13px] text-muted">{description}</p>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function ColorField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  placeholder: string;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : FALLBACK_BRANDING.primary}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
          className="size-9.5 shrink-0 cursor-pointer rounded-lg border border-line-strong bg-transparent p-0.5"
        />
        <Input
          value={value}
          onChange={(event) => {
            const next = event.target.value;
            if (/^#[0-9a-fA-F]{0,6}$/.test(next)) onChange(next);
          }}
          placeholder={placeholder}
        />
      </div>
    </Field>
  );
}

function LogoDropzone({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const readFile = (file: File | null | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|svg\+xml)$/.test(file.type)) {
      toast.error("Unsupported file", "Upload a PNG, SVG or JPG.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("File too large", "Logos must be 2 MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        readFile(event.dataTransfer.files[0]);
      }}
      onPaste={(event) => {
        const item = [...event.clipboardData.items].find((entry) => entry.type.startsWith("image/"));
        readFile(item?.getAsFile());
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition",
        dragging ? "border-brand bg-brand-soft/40" : "border-line",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml"
        className="hidden"
        onChange={(event) => readFile(event.target.files?.[0])}
      />
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="Firm logo preview" className="max-h-16 max-w-40 object-contain" />
      ) : (
        <span className="grid size-11 place-items-center rounded-full bg-surface-2 text-muted">
          <ImagePlus className="size-5" />
        </span>
      )}
      <p className="text-[13.5px] font-medium text-ink">Drag &amp; drop, paste, or click to upload</p>
      <p className="text-[12px] text-muted">PNG, SVG or JPG · max 2 MB</p>
    </div>
  );
}
