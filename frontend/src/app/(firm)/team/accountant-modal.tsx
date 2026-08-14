"use client";

import { Pencil, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";

import { Alert, Button, Checkbox, Field, Input, Modal, Select, toOptions } from "@/components/ui";
import type { TeamStatus } from "@/lib/firm-demo";
import type { UserRole } from "@/lib/types";

const ROLE_TITLES = [
  "Partner",
  "Senior CPA",
  "CPA",
  "Staff Accountant",
  "Bookkeeper",
  "Payroll Specialist",
];

const STATUS_OPTIONS: { value: TeamStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "away", label: "Away" },
  { value: "inactive", label: "Inactive" },
];

/**
 * Access level, separate from the job title above it. The title is a label; this
 * is what the API enforces — "owner" and "admin" are the only roles that can
 * create accounts, change firm settings or see the whole reminder board.
 */
const ROLE_OPTIONS: { value: UserRole; label: string; hint: string }[] = [
  { value: "member", label: "Member", hint: "Works their own clients and tasks" },
  { value: "admin", label: "Administrator", hint: "Also manages users, services and settings" },
  { value: "owner", label: "Owner", hint: "Full control, including billing" },
  { value: "viewer", label: "Viewer", hint: "Read-only across the practice" },
];

export interface AccountantFormValues {
  fullName: string;
  title: string;
  status: TeamStatus;
  email: string;
  phone: string;
  role: UserRole;
  /** Create the login and email the credentials, rather than only adding a row. */
  sendCredentials: boolean;
}

/** Add/edit modal for the internal team roster — shared by the list and detail pages. */
export function AccountantModal({
  open,
  onClose,
  initial,
  onSubmit,
  pending = false,
  isLive = false,
}: {
  open: boolean;
  onClose: () => void;
  /** Omit (or null) to add a new member; pass current values to edit in place. */
  initial?: AccountantFormValues | null;
  onSubmit: (values: AccountantFormValues) => void;
  pending?: boolean;
  /** When false the form only edits local state — no account is provisioned. */
  isLive?: boolean;
}) {
  const isEdit = Boolean(initial);

  const [fullName, setFullName] = useState(initial?.fullName ?? "");
  const [title, setTitle] = useState(initial?.title ?? ROLE_TITLES[2]);
  const [status, setStatus] = useState<TeamStatus>(initial?.status ?? "active");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [role, setRole] = useState<UserRole>(initial?.role ?? "member");
  const [sendCredentials, setSendCredentials] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Re-seed whenever the modal opens (covers both "add" resets and switching
  // which row is being edited), rather than keying the component remount.
  useEffect(() => {
    if (!open) return;
    // Re-seeding the form from `initial` when the modal opens, not on every
    // keystroke, is the point — the fields below are deliberately uncontrolled
    // by this effect once the user starts typing.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFullName(initial?.fullName ?? "");
    setTitle(initial?.title ?? ROLE_TITLES[2]);
    setStatus(initial?.status ?? "active");
    setEmail(initial?.email ?? "");
    setPhone(initial?.phone ?? "");
    setRole(initial?.role ?? "member");
    setSendCredentials(true);
    setError(null);
  }, [
    open,
    initial?.fullName,
    initial?.title,
    initial?.status,
    initial?.email,
    initial?.phone,
    initial?.role,
  ]);

  const titleOptions = ROLE_TITLES.includes(title) ? ROLE_TITLES : [title, ...ROLE_TITLES];
  const selectedRole = ROLE_OPTIONS.find((option) => option.value === role);

  const submit = () => {
    const trimmed = fullName.trim();
    if (!trimmed) {
      setError("Full name is required.");
      return;
    }
    // Creating a real account needs somewhere to send the credentials; editing
    // an existing row does not, since the address is already on file.
    if (!isEdit && isLive && !email.trim().includes("@")) {
      setError("A valid work email is required — that is where the login details go.");
      return;
    }
    onSubmit({
      fullName: trimmed,
      title,
      status,
      email: email.trim(),
      phone: phone.trim(),
      role,
      sendCredentials,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit accountant" : "Add accountant"}
      description={
        isEdit
          ? "Update this team member's details and access level."
          : isLive
            ? "Creates their login and emails them a temporary password."
            : "Add a new member to your internal team."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            icon={isEdit ? <Pencil className="size-4" /> : <UserPlus className="size-4" />}
            onClick={submit}
            loading={pending}
          >
            {isEdit ? "Save changes" : "Create account"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Full name" required error={error}>
          <Input
            value={fullName}
            onChange={(event) => {
              setFullName(event.target.value);
              setError(null);
            }}
            placeholder="Jane Doe"
            autoFocus
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role / title" hint="Shown on the roster and in letters.">
            <Select value={title} onValueChange={setTitle} options={toOptions(titleOptions)} />
          </Field>
          <Field label="Access level" hint={selectedRole?.hint}>
            <Select
              value={role}
              onValueChange={(next) => setRole(next as UserRole)}
              options={ROLE_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
                description: option.hint,
              }))}
            />
          </Field>
          <Field
            label="Work email"
            required={!isEdit && isLive}
            hint={isEdit ? undefined : "Their sign-in address."}
          >
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="jane@harrisoncpa.ca"
              disabled={isEdit && isLive}
            />
          </Field>
          <Field label="Phone">
            <Input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+1 (416) 555-0142"
            />
          </Field>
          {isEdit ? (
            <Field label="Status">
              <Select
                value={status}
                onValueChange={(next) => setStatus(next as TeamStatus)}
                options={STATUS_OPTIONS}
              />
            </Field>
          ) : null}
        </div>

        {!isEdit && isLive ? (
          <>
            <Checkbox
              label="Email them their sign-in details"
              checked={sendCredentials}
              onChange={(event) => setSendCredentials(event.target.checked)}
            />
            <Alert tone="info" title="What happens next">
              A Supabase login is created with a temporary password and they are asked to replace it
              on first sign-in. You will see the password once after saving, in case you need to pass
              it on another way.
            </Alert>
          </>
        ) : null}

        {isEdit && isLive ? (
          <p className="text-[12.5px] leading-relaxed text-muted">
            The email address is fixed once the login exists — it is the account identity. To move
            someone to a new address, create a new account and deactivate this one.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
