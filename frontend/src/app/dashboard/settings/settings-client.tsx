"use client";

import { Building2, Lock, Bell as BellIcon, Palette } from "lucide-react";
import { useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/components/toast";
import { Button, Field, Input, Switch } from "@/components/ui";
import { DEMO_ACCOUNT } from "@/lib/demo";

export function SettingsClient() {
  const toast = useToast();

  const [profile, setProfile] = useState({
    business: DEMO_ACCOUNT.business,
    legalName: DEMO_ACCOUNT.legalName,
    address: DEMO_ACCOUNT.address,
    phone: DEMO_ACCOUNT.phone,
    gstNumber: DEMO_ACCOUNT.gstNumber,
  });

  const [notifications, setNotifications] = useState({
    deadlines: true,
    payroll: true,
    weekly: false,
    invoices: true,
  });

  const [passwords, setPasswords] = useState({ current: "", next: "" });
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const set = (key: keyof typeof profile) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setProfile((current) => ({ ...current, [key]: event.target.value }));

  const saveProfile = (event: React.FormEvent) => {
    event.preventDefault();
    toast.success("Profile saved", "Changes apply to invoices and CRA filings.");
  };

  const updatePassword = (event: React.FormEvent) => {
    event.preventDefault();
    if (!passwords.current) {
      setPasswordError("Enter your current password.");
      return;
    }
    if (passwords.next.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    setPasswordError(null);
    setPasswords({ current: "", next: "" });
    toast.success("Password updated", "You'll stay signed in on this device.");
  };

  return (
    <div className="space-y-5">
      <Panel
        icon={<Building2 className="size-4.5" />}
        title="Business profile"
        description="Details used on invoices and CRA filings"
      >
        <form onSubmit={saveProfile}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name">
              <Input value={profile.business} onChange={set("business")} />
            </Field>
            <Field label="Legal name">
              <Input value={profile.legalName} onChange={set("legalName")} />
            </Field>
            <Field label="Address">
              <Input value={profile.address} onChange={set("address")} />
            </Field>
            <Field label="Phone">
              <Input value={profile.phone} onChange={set("phone")} />
            </Field>
            <Field label="GST/HST number">
              <Input value={profile.gstNumber} onChange={set("gstNumber")} />
            </Field>
            <Field label="Email" hint="Email cannot be changed here.">
              <Input value={DEMO_ACCOUNT.email} disabled />
            </Field>
          </div>
          <Button type="submit" className="mt-5">
            Save changes
          </Button>
        </form>
      </Panel>

      <Panel
        icon={<BellIcon className="size-4.5" />}
        title="Notifications"
        description="Choose what we email you about"
      >
        <div className="divide-y divide-line">
          <Switch
            checked={notifications.deadlines}
            onChange={(value) => setNotifications((c) => ({ ...c, deadlines: value }))}
            label="Email me about filing deadlines"
            description="Overdue and due-soon items, once a day"
          />
          <Switch
            checked={notifications.payroll}
            onChange={(value) => setNotifications((c) => ({ ...c, payroll: value }))}
            label="Email me about payroll runs"
            description="Before each run is processed"
          />
          <Switch
            checked={notifications.invoices}
            onChange={(value) => setNotifications((c) => ({ ...c, invoices: value }))}
            label="Email me when an invoice goes overdue"
          />
          <Switch
            checked={notifications.weekly}
            onChange={(value) => setNotifications((c) => ({ ...c, weekly: value }))}
            label="Email me a weekly summary"
            description="Monday morning, covering the week ahead"
          />
        </div>
      </Panel>

      <Panel
        icon={<Palette className="size-4.5" />}
        title="Appearance"
        description="How the portal looks on this device"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-ink-soft">Colour theme</p>
            <p className="mt-0.5 text-[12.5px] text-muted">
              System follows your operating system setting.
            </p>
          </div>
          <ThemeToggle />
        </div>
      </Panel>

      <Panel
        icon={<Lock className="size-4.5" />}
        title="Security"
        description="Update your account password"
      >
        <form onSubmit={updatePassword}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Current password" error={passwordError}>
              <Input
                type="password"
                autoComplete="current-password"
                value={passwords.current}
                onChange={(event) =>
                  setPasswords((current) => ({ ...current, current: event.target.value }))
                }
              />
            </Field>
            <Field label="New password" hint="At least 8 characters">
              <Input
                type="password"
                autoComplete="new-password"
                value={passwords.next}
                onChange={(event) =>
                  setPasswords((current) => ({ ...current, next: event.target.value }))
                }
              />
            </Field>
          </div>
          <Button type="submit" className="mt-5">
            Update password
          </Button>
        </form>

        <div className="mt-6 rounded-xl border border-line bg-surface-2/50 p-4">
          <p className="text-[13px] leading-relaxed text-muted">
            This portal is managed by{" "}
            <strong className="font-semibold text-ink">{DEMO_ACCOUNT.firm}</strong> —{" "}
            {DEMO_ACCOUNT.accountant} is your account manager. Client since{" "}
            {DEMO_ACCOUNT.memberSince} on the {DEMO_ACCOUNT.plan} plan.
          </p>
        </div>
      </Panel>
    </div>
  );
}

function Panel({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
      <div className="flex items-start gap-3 border-b border-line px-5 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
          {icon}
        </span>
        <div>
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          <p className="mt-0.5 text-[13px] text-muted">{description}</p>
        </div>
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}
