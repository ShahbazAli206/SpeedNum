"use client";

/**
 * "My account" — every firm-linked login (owner/admin/member/viewer, and a
 * superadmin, who shares this same shell) editing their own name and
 * password. Distinct from /settings, which edits the *firm's* branding, and
 * from /team/[id], which lets an admin edit *other* staff — this is the one
 * page reachable by every role for their own identity, backed by the two
 * self-service endpoints that already exist either way:
 * PATCH /auth/me and POST /auth/change-password.
 */

import { KeyRound, Save, UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { useToast } from "@/components/toast";
import { Button, Field, Input, PasswordInput } from "@/components/ui";
import { patch, post } from "@/lib/api";
import { AUTH_CONFIGURED, validatePassword } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session";

export function AccountClient() {
  const toast = useToast();
  const { me, isLoading, refresh } = useSession();

  const [profile, setProfile] = useState({ fullName: "", title: "", phone: "" });
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (!me) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfile({
      fullName: me.profile.full_name ?? "",
      title: me.profile.title ?? "",
      phone: me.profile.phone ?? "",
    });
  }, [me]);

  const [passwords, setPasswords] = useState({ current: "", next: "" });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile.fullName.trim()) {
      toast.error("Name is required");
      return;
    }
    setSavingProfile(true);
    try {
      if (AUTH_CONFIGURED) {
        await patch("/auth/me", {
          full_name: profile.fullName.trim(),
          title: profile.title.trim() || null,
          phone: profile.phone.trim() || null,
        });
        refresh();
      }
      toast.success("Profile updated", "Your name is shown across the portal and on documents you sign.");
    } catch (error) {
      toast.error("Could not update your profile", error instanceof Error ? error.message : "Try again.");
    } finally {
      setSavingProfile(false);
    }
  };

  const updatePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!passwords.current) {
      setPasswordError("Enter your current password.");
      return;
    }
    const nextError = validatePassword(passwords.next, 8);
    if (nextError) {
      setPasswordError(nextError);
      return;
    }
    setPasswordError(null);
    setChangingPassword(true);
    try {
      if (AUTH_CONFIGURED) {
        await post("/auth/change-password", {
          current_password: passwords.current,
          new_password: passwords.next,
        });
      }
      setPasswords({ current: "", next: "" });
      toast.success("Password updated", "You'll stay signed in on this device.");
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : "Could not update your password.");
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-[1.6rem] font-bold tracking-tight text-ink">My account</h1>
        <p className="mt-1 text-[14px] text-muted">Update your name and password.</p>
      </div>

      <Section
        icon={<UserRound className="size-4.5" />}
        title="Profile"
        description="Shown across the portal and on documents you sign."
      >
        <form onSubmit={saveProfile}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required>
              <Input
                value={profile.fullName}
                onChange={(event) => setProfile((current) => ({ ...current, fullName: event.target.value }))}
                disabled={isLoading}
                autoComplete="name"
              />
            </Field>
            <Field label="Title" hint="e.g. Senior Accountant">
              <Input
                value={profile.title}
                onChange={(event) => setProfile((current) => ({ ...current, title: event.target.value }))}
                disabled={isLoading}
              />
            </Field>
            <Field label="Phone">
              <Input
                value={profile.phone}
                onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value }))}
                disabled={isLoading}
                autoComplete="tel"
              />
            </Field>
            <Field label="Email" hint="Email cannot be changed here.">
              <Input value={me?.profile.email ?? ""} disabled />
            </Field>
          </div>
          <Button type="submit" className="mt-5" icon={<Save className="size-4" />} loading={savingProfile}>
            Save changes
          </Button>
        </form>
      </Section>

      <Section
        className="mt-5"
        icon={<KeyRound className="size-4.5" />}
        title="Security"
        description="Update your sign-in password."
      >
        <form onSubmit={updatePassword}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Current password" error={passwordError}>
              <PasswordInput
                autoComplete="current-password"
                value={passwords.current}
                onChange={(event) => setPasswords((current) => ({ ...current, current: event.target.value }))}
              />
            </Field>
            <Field label="New password" hint="At least 8 characters">
              <PasswordInput
                autoComplete="new-password"
                value={passwords.next}
                onChange={(event) => setPasswords((current) => ({ ...current, next: event.target.value }))}
              />
            </Field>
          </div>
          <Button type="submit" className="mt-5" loading={changingPassword}>
            Update password
          </Button>
        </form>
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
    <section className={cn("rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]", className)}>
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
