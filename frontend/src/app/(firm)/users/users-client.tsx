"use client";

import {
  Clock,
  LogIn,
  Pencil,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  UserPlus,
  UserRound,
  Users,
} from "lucide-react";
import { useState } from "react";

import { KpiTile } from "@/components/charts";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { DashboardHeader } from "@/components/dashboard/page-shell";
import { useToast } from "@/components/toast";
import { Button, Checkbox, Field, Input, Modal, Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import { TODAY, type PlatformRole, type PlatformUser } from "@/lib/firm-demo";
import { formatDate, initials } from "@/lib/format";

const ROLE_OPTIONS: { value: PlatformRole; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" },
  { value: "client", label: "Client" },
];

const ROLE_TONE: Record<PlatformRole, string> = {
  owner: "bg-brand-soft text-brand-ink",
  admin: "bg-info-soft text-info",
  member: "bg-surface-2 text-ink-soft",
  viewer: "bg-surface-2 text-muted",
  client: "bg-surface-2 text-ink-soft",
};

interface FormValues {
  fullName: string;
  email: string;
  role: PlatformRole;
  phone: string;
  clientId: string;
  requirePasswordChange: boolean;
}

const BLANK_FORM: FormValues = {
  fullName: "",
  email: "",
  role: "member",
  phone: "",
  clientId: "",
  requirePasswordChange: true,
};

let localSeq = 0;
function nextLocalId() {
  localSeq += 1;
  return `local-user-${localSeq}`;
}

export function UsersClient({
  initialUsers,
  clients,
}: {
  initialUsers: PlatformUser[];
  clients: { id: string; business_name: string }[];
}) {
  const toast = useToast();

  const [users, setUsers] = useState(initialUsers);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformUser | null>(null);
  const [form, setForm] = useState<FormValues>(BLANK_FORM);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<PlatformUser | null>(null);

  const onboarded = (user: PlatformUser) => user.last_sign_in !== null && !user.must_change_password;
  const admins = users.filter((user) => user.role === "owner" || user.role === "admin");
  const clientUsers = users.filter((user) => user.role === "client");
  const signedIn = users.filter(onboarded);
  const neverSignedIn = users.filter((user) => !onboarded(user));

  const openAdd = () => {
    setEditing(null);
    setForm(BLANK_FORM);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (user: PlatformUser) => {
    setEditing(user);
    setForm({
      fullName: user.full_name,
      email: user.email,
      role: user.role,
      phone: "",
      clientId: user.source === "client" ? user.source_id : "",
      requirePasswordChange: user.must_change_password,
    });
    setError(null);
    setModalOpen(true);
  };

  const submit = () => {
    const fullName = form.fullName.trim();
    const email = form.email.trim();
    if (!fullName) {
      setError("Full name is required.");
      return;
    }
    if (!email || !email.includes("@")) {
      setError("A valid email is required.");
      return;
    }

    if (editing) {
      setUsers((current) =>
        current.map((user) =>
          user.id === editing.id
            ? {
                ...user,
                full_name: fullName,
                email,
                role: form.role,
                must_change_password: form.requirePasswordChange,
              }
            : user,
        ),
      );
      toast.success(`${fullName} updated`, "Changes saved to their account.");
    } else {
      const created: PlatformUser = {
        id: nextLocalId(),
        full_name: fullName,
        email,
        role: form.role,
        created_at: TODAY,
        last_sign_in: null,
        must_change_password: form.requirePasswordChange,
        source: form.role === "client" ? "client" : "team",
        source_id: form.role === "client" ? form.clientId : "",
      };
      setUsers((current) => [...current, created]);
      toast.success(
        `${fullName} added`,
        form.requirePasswordChange
          ? "Invited — they'll be asked to set a password on first sign-in."
          : "Account created.",
      );
    }
    setModalOpen(false);
  };

  const confirmDelete = () => {
    if (!deleting) return;
    setUsers((current) => current.filter((user) => user.id !== deleting.id));
    toast.success(`${deleting.full_name} removed`, "Their account and access have been revoked.");
    setDeleting(null);
  };

  const columns: Column<PlatformUser>[] = [
    {
      key: "user",
      header: "User",
      cell: (row) => (
        <span className="flex items-center gap-2.5">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-[11px] font-bold text-brand">
            {initials(row.full_name)}
          </span>
          <span className="min-w-0">
            <span className="block max-w-56 truncate font-medium text-ink">{row.full_name}</span>
            <span className="block text-[11.5px] text-muted">{row.email}</span>
          </span>
        </span>
      ),
      sortValue: (row) => row.full_name,
    },
    {
      key: "role",
      header: "Role",
      cell: (row) => (
        <span
          className={cn(
            "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
            ROLE_TONE[row.role],
          )}
        >
          {row.role}
        </span>
      ),
      sortValue: (row) => row.role,
    },
    {
      key: "created",
      header: "Created",
      cell: (row) => formatDate(row.created_at),
      sortValue: (row) => row.created_at,
    },
    {
      key: "lastSignIn",
      header: "Last sign-in",
      cell: (row) =>
        row.last_sign_in ? (
          <span>
            {formatDate(row.last_sign_in)}
            {row.must_change_password ? (
              <span className="ml-1.5 text-[11px] font-medium text-warn">(temp password)</span>
            ) : null}
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
      sortValue: (row) => row.last_sign_in ?? "0000-00-00",
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (row) => (
        <span className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => openEdit(row)}
            className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink"
            aria-label={`Edit ${row.full_name}`}
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setDeleting(row)}
            className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-danger-soft hover:text-danger"
            aria-label={`Delete ${row.full_name}`}
          >
            <Trash2 className="size-4" />
          </button>
        </span>
      ),
    },
  ];

  return (
    <>
      <DashboardHeader
        title="Users"
        subtitle="Create and manage SpeedNum platform accounts."
        actions={
          <Button icon={<UserPlus className="size-4" />} onClick={openAdd}>
            Add user
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiTile
          tone="blue"
          value={String(users.length)}
          label="Total users"
          icon={<Users className="size-5" />}
        />
        <KpiTile
          tone="violet"
          value={String(admins.length)}
          label="Admins"
          icon={<ShieldCheck className="size-5" />}
        />
        <KpiTile
          tone="green"
          value={String(clientUsers.length)}
          label="Clients"
          icon={<UserRound className="size-5" />}
        />
        <KpiTile
          tone="amber"
          value={String(signedIn.length)}
          label="Signed in"
          hint="Logged in and changed their password"
          icon={<LogIn className="size-5" />}
        />
        <KpiTile
          tone="rose"
          value={String(neverSignedIn.length)}
          label="Never signed in"
          hint="Or still on a temporary password"
          icon={<Clock className="size-5" />}
        />
      </div>

      <section className="mt-6 rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">All users</h2>
          <p className="mt-0.5 text-[13px] text-muted">{users.length} accounts</p>
        </div>

        <DataTable
          rows={users}
          columns={columns}
          searchKeys={(row) => `${row.full_name} ${row.email} ${row.role}`}
          filters={[
            {
              label: "Roles",
              options: ROLE_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
              predicate: (row, value) => row.role === value,
            },
          ]}
          emptyTitle="No users match"
          emptyDescription="Try clearing the search or the role filter above."
          exportName="speednum-users"
        />
      </section>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit user" : "Add user"}
        description={
          editing
            ? "Update this account's details and access."
            : "Create a new SpeedNum platform account."
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button icon={<UserPlus className="size-4" />} onClick={submit}>
              {editing ? "Save changes" : "Add user"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Full name" required error={error && !form.fullName.trim() ? error : null}>
            <Input
              value={form.fullName}
              onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
              placeholder="Jane Doe"
              autoFocus
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Email"
              required
              error={error && form.fullName.trim() && !form.email.includes("@") ? error : null}
            >
              <Input
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="jane@harrisoncpa.ca"
              />
            </Field>
            <Field label="Role">
              <Select
                value={form.role}
                onChange={(event) =>
                  setForm((current) => ({ ...current, role: event.target.value as PlatformRole }))
                }
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Phone">
              <Input
                value={form.phone}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                placeholder="+1 (416) 555-0142"
              />
            </Field>
            {form.role === "client" ? (
              <Field label="Linked client" hint="Which client record this login belongs to.">
                <Select
                  value={form.clientId}
                  onChange={(event) => setForm((current) => ({ ...current, clientId: event.target.value }))}
                >
                  <option value="">Select a client…</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.business_name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>
          <Checkbox
            label="Require password change on next sign-in"
            checked={form.requirePasswordChange}
            onChange={(event) =>
              setForm((current) => ({ ...current, requirePasswordChange: event.target.checked }))
            }
          />
        </div>
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete user"
        description="This permanently revokes their access — it can't be undone."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={confirmDelete}>
              Delete user
            </Button>
          </>
        }
      >
        {deleting ? (
          <div className="flex items-start gap-3 rounded-lg bg-danger-soft/60 p-3.5">
            <TriangleAlert className="mt-0.5 size-4.5 shrink-0 text-danger" />
            <p className="text-[13.5px] leading-relaxed text-ink-soft">
              You&apos;re about to delete{" "}
              <strong className="font-semibold text-ink">{deleting.full_name}</strong>{" "}
              ({deleting.email}). All sensitive data tied to this login — sessions, saved preferences and
              portal access — will be removed along with the account.
            </p>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
