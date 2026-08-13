"use client";

import { Pencil, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";

import { Button, Field, Input, Modal, Select } from "@/components/ui";
import type { TeamStatus } from "@/lib/firm-demo";

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

export interface AccountantFormValues {
  fullName: string;
  title: string;
  status: TeamStatus;
  email: string;
  phone: string;
}

/** Add/edit modal for the internal team roster — shared by the list and detail pages. */
export function AccountantModal({
  open,
  onClose,
  initial,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  /** Omit (or null) to add a new member; pass current values to edit in place. */
  initial?: AccountantFormValues | null;
  onSubmit: (values: AccountantFormValues) => void;
}) {
  const isEdit = Boolean(initial);

  const [fullName, setFullName] = useState(initial?.fullName ?? "");
  const [title, setTitle] = useState(initial?.title ?? ROLE_TITLES[2]);
  const [status, setStatus] = useState<TeamStatus>(initial?.status ?? "active");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
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
    setError(null);
  }, [open, initial?.fullName, initial?.title, initial?.status, initial?.email, initial?.phone]);

  const titleOptions = ROLE_TITLES.includes(title) ? ROLE_TITLES : [title, ...ROLE_TITLES];

  const submit = () => {
    const trimmed = fullName.trim();
    if (!trimmed) {
      setError("Full name is required.");
      return;
    }
    onSubmit({ fullName: trimmed, title, status, email: email.trim(), phone: phone.trim() });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit accountant" : "Add accountant"}
      description={
        isEdit
          ? "Update this team member's details."
          : "Add a new member to your internal team."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            icon={isEdit ? <Pencil className="size-4" /> : <UserPlus className="size-4" />}
            onClick={submit}
          >
            {isEdit ? "Save changes" : "Add member"}
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
          <Field label="Role / title">
            <Select value={title} onChange={(event) => setTitle(event.target.value)}>
              {titleOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value as TeamStatus)}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="jane@spidnums.ca"
            />
          </Field>
          <Field label="Phone">
            <Input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+1 (416) 555-0142"
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
