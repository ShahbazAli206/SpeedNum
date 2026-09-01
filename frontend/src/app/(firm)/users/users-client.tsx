"use client";

import {
  Clock,
  KeyRound,
  LogIn,
  MoreHorizontal,
  Pencil,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Upload,
  UserPlus,
  UserRound,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { KpiTile } from "@/components/charts";
import { CredentialsModal } from "@/components/dashboard/credentials-modal";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { DashboardHeader } from "@/components/dashboard/page-shell";
import { useToast } from "@/components/toast";
import { Button, ButtonLink, Checkbox, EmptyState, Field, Input, Menu, Modal, Select } from "@/components/ui";
import { del, patch, post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { TODAY, type PlatformRole, type PlatformUser } from "@/lib/firm-demo";
import { formatDate, initials } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { CredentialResult } from "@/lib/types";

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

/** Pull a human-readable reason out of an ApiError without leaking `[object]`. */
function message(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function UsersClient({
  initialUsers,
  clients,
  isLive,
}: {
  initialUsers: PlatformUser[];
  clients: { id: string; business_name: string }[];
  /** False when `/users` was unreachable and these rows are sample data. */
  isLive: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const session = useSession();

  const [users, setUsers] = useState(initialUsers);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformUser | null>(null);
  const [form, setForm] = useState<FormValues>(BLANK_FORM);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<PlatformUser | null>(null);
  const [pending, setPending] = useState(false);
  const [credentials, setCredentials] = useState<CredentialResult | null>(null);

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

  const submit = async () => {
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
    if (isLive && !editing && form.role === "client" && !form.clientId) {
      setError("Pick which client this portal login belongs to.");
      return;
    }

    if (isLive) {
      setPending(true);
      try {
        if (editing) {
          await patch(`/users/${editing.id}`, {
            full_name: fullName,
            phone: form.phone || null,
            // A portal login is always "member" server-side; sending "client"
            // (a UI-only label) would be rejected by the role guard.
            role: editing.source === "client" ? undefined : form.role,
            must_change_password: form.requirePasswordChange,
          });
          toast.success(`${fullName} updated`, "Changes saved to their account.");
          setModalOpen(false);
        } else {
          const result = await post<CredentialResult>("/users", {
            email,
            full_name: fullName,
            role: form.role === "client" ? "member" : form.role,
            phone: form.phone || null,
            client_id: form.role === "client" ? form.clientId : null,
            send_email: true,
          });
          setModalOpen(false);
          // The password exists in plaintext exactly once — show it before
          // anything can navigate away.
          setCredentials(result);
        }
        router.refresh();
      } catch (caught) {
        const detail = message(caught, "Please try again.");
        setError(detail);
        toast.error(editing ? "Could not save changes" : "Could not create the account", detail);
      } finally {
        setPending(false);
      }
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
        is_superadmin: false,
      };
      setUsers((current) => [...current, created]);
      toast.info(
        `${fullName} added (demo)`,
        "No API is connected, so this account only exists in your browser.",
      );
    }
    setModalOpen(false);
  };

  const resendCredentials = async (user: PlatformUser) => {
    if (!isLive) {
      toast.info("Demo mode", "Connect the API to issue and email a new password.");
      return;
    }
    try {
      setCredentials(await post<CredentialResult>(`/users/${user.id}/resend-credentials`));
    } catch (caught) {
      toast.error("Could not reset their password", message(caught, "Please try again."));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const user = deleting;
    setDeleting(null);

    if (isLive) {
      try {
        const result = await del<{ message: string }>(`/users/${user.id}`);
        toast.success(`${user.full_name} removed`, result.message);
        router.refresh();
      } catch (caught) {
        toast.error("Could not remove them", message(caught, "Please try again."));
      }
      return;
    }

    setUsers((current) => current.filter((row) => row.id !== user.id));
    toast.info(`${user.full_name} removed (demo)`, "Nothing was changed on the server.");
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
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
              ROLE_TONE[row.role],
            )}
          >
            {row.role}
          </span>
          {/* `role` is just this login's firm-internal role and stays
              "owner"/"admin" either way — a platform superadmin needs its
              own badge or it's indistinguishable from an ordinary admin. */}
          {row.is_superadmin ? (
            <span className="inline-flex rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-white">
              Super Admin
            </span>
          ) : null}
        </span>
      ),
      sortValue: (row) => row.role,
      exportValue: (row) => (row.is_superadmin ? `${row.role} (Super Admin)` : row.role),
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
        <Menu
          label={`Actions for ${row.full_name}`}
          className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink"
          trigger={<MoreHorizontal className="size-4" />}
          items={[
            {
              label: "Edit details",
              icon: <Pencil className="size-3.5" />,
              onSelect: () => openEdit(row),
            },
            {
              label: "Resend credentials",
              description: "Issues a new temporary password",
              icon: <KeyRound className="size-3.5" />,
              onSelect: () => void resendCredentials(row),
            },
            {
              label: "Remove access",
              icon: <Trash2 className="size-3.5" />,
              danger: true,
              separated: true,
              onSelect: () => setDeleting(row),
            },
          ]}
        />
      ),
    },
  ];

  // Mirrors the backend: /users is superadmin-only now (see backend/app/
  // routers/users.py), so a firm's own owner/admin never sees this list of
  // every platform account — including other admins and superadmins. This
  // guards a direct visit; the nav link itself is already hidden for them
  // (lib/site.ts's `superadminOnly`).
  if (!session.isLoading && session.portalRoleLabel !== "Super Admin") {
    return (
      <EmptyState
        icon={<ShieldCheck className="size-6" />}
        title="Superadmin access required"
        description="The platform accounts list is restricted to the platform superadmin role."
      />
    );
  }

  // /users is still tenant-scoped — it lists one firm's accounts, not every
  // firm's. A superadmin who hasn't impersonated a firm yet has no tenant, so
  // the API 409s and (per apiServer's fallback) this would otherwise silently
  // render demo rows whose "Remove access" button looks real but does
  // nothing. Send them to pick a firm first instead.
  if (!session.isLoading && session.portalRoleLabel === "Super Admin" && !session.me?.tenant) {
    return (
      <EmptyState
        icon={<ShieldCheck className="size-6" />}
        title="Pick a firm to manage its users"
        description="Users belongs to one firm's account list. Impersonate a firm from the Admin console, then come back here."
        action={<ButtonLink href="/admin">Go to Admin console</ButtonLink>}
      />
    );
  }

  return (
    <>
      <DashboardHeader
        title="Users"
        subtitle="Create and manage SpidNums platform accounts."
        actions={
          <>
            <ButtonLink href="/import?mode=users" variant="secondary" icon={<Upload className="size-4" />}>
              Import
            </ButtonLink>
            <Button icon={<UserPlus className="size-4" />} onClick={openAdd}>
              Add user
            </Button>
          </>
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
          exportName="spidnums-users"
        />
      </section>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit user" : "Add user"}
        description={
          editing
            ? "Update this account's details and access."
            : "Create a new SpidNums platform account."
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              icon={<UserPlus className="size-4" />}
              onClick={() => void submit()}
              loading={pending}
            >
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
                onValueChange={(next) =>
                  setForm((current) => ({ ...current, role: next as PlatformRole }))
                }
                // A portal login's role is fixed server-side; offering to change
                // it here would only produce a 422.
                disabled={editing?.source === "client"}
                options={ROLE_OPTIONS}
              />
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
                  onValueChange={(clientId) => setForm((current) => ({ ...current, clientId }))}
                  placeholder="Select a client…"
                  searchPlaceholder="Search clients…"
                  options={clients.map((client) => ({
                    value: client.id,
                    label: client.business_name,
                  }))}
                />
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
        title="Remove access"
        description="They will no longer be able to sign in."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon={<Trash2 className="size-4" />}
              onClick={() => void confirmDelete()}
            >
              Remove access
            </Button>
          </>
        }
      >
        {deleting ? (
          <div className="flex items-start gap-3 rounded-lg bg-danger-soft/60 p-3.5">
            <TriangleAlert className="mt-0.5 size-4.5 shrink-0 text-danger" />
            {/* Wording matches what the server actually does (users.py:234):
                staff are deactivated because clients and tasks reference them
                as owner/assignee; only portal logins are deleted outright. */}
            <p className="text-[13.5px] leading-relaxed text-ink-soft">
              You&apos;re about to revoke access for{" "}
              <strong className="font-semibold text-ink">{deleting.full_name}</strong>{" "}
              ({deleting.email}).{" "}
              {deleting.source === "client"
                ? "Their portal login is deleted and the client record loses portal access. The client record itself is kept."
                : "Their staff account is deactivated rather than deleted, so the clients and tasks they own keep their assignment. Their sign-in is revoked immediately."}
            </p>
          </div>
        ) : null}
      </Modal>

      <CredentialsModal
        result={credentials}
        onClose={() => setCredentials(null)}
        kind={credentials?.role === "member" ? "account" : "platform"}
      />
    </>
  );
}
