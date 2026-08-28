"use client";

import {
  Clock,
  Eye,
  KeyRound,
  Pencil,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Upload,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { KpiTile } from "@/components/charts";
import { CredentialsModal } from "@/components/dashboard/credentials-modal";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { DashboardHeader } from "@/components/dashboard/page-shell";
import { useToast } from "@/components/toast";
import { Alert, Button, ButtonLink, EmptyState, Modal } from "@/components/ui";
import { ApiError, del, get, patch, post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { TODAY, type TeamRow, type TeamStatus } from "@/lib/firm-demo";
import { initials } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { CredentialResult, RoleRow, SeatUsage, TeamMember } from "@/lib/types";

import { AccountantModal, type AccountantFormValues } from "./accountant-modal";

const STATUS_TONE: Record<TeamStatus, string> = {
  active: "bg-success-soft text-success",
  away: "bg-warn-soft text-warn",
  inactive: "bg-surface-2 text-muted",
};

const ROLE_TONE: Record<string, string> = {
  owner: "bg-brand-soft text-brand",
  admin: "bg-info-soft text-info",
  member: "bg-surface-2 text-ink-soft",
  viewer: "bg-surface-2 text-muted",
};

let localSeq = 0;
function nextLocalId() {
  localSeq += 1;
  return `local-${localSeq}`;
}

export function TeamClient({
  initialTeam,
  isLive,
}: {
  initialTeam: TeamRow[];
  isLive: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const session = useSession();

  const [team, setTeam] = useState(initialTeam);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TeamRow | null>(null);
  const [pending, setPending] = useState(false);
  const [credentials, setCredentials] = useState<CredentialResult | null>(null);
  const [removing, setRemoving] = useState<TeamRow | null>(null);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [seats, setSeats] = useState<SeatUsage | null>(null);

  // Owner/superadmin-gated on the API (OwnerOrSuperadminDep, same as this
  // page's own write actions) — a member/viewer's 403 here is expected and
  // just means the custom-role picker in the modal doesn't render for them.
  useEffect(() => {
    if (!isLive) return;
    get<RoleRow[]>("/roles")
      .then(setRoles)
      .catch(() => setRoles([]));
  }, [isLive]);

  // Any firm staff can reach GET /settings/seats (see backend/app/seats.py) —
  // shown here rather than gated further, since a seat-limit 402 can happen
  // to any staff member trying to invite/create, not only the owner.
  useEffect(() => {
    if (!isLive) return;
    get<SeatUsage>("/settings/seats")
      .then(setSeats)
      .catch(() => setSeats(null));
  }, [isLive]);

  const active = team.filter((member) => member.status === "active");
  const away = team.filter((member) => member.status === "away");
  const clientsHandled = team.reduce((total, member) => total + member.clients, 0);
  const openTasks = team.reduce((total, member) => total + member.open_tasks, 0);
  const pendingInvites = team.filter((member) => member.must_change_password).length;

  const openAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (member: TeamRow) => {
    setEditing(member);
    setModalOpen(true);
  };

  const viewMember = (member: TeamRow) => {
    if (!isLive && member.id.startsWith("local-")) {
      toast.info(
        "Not available in this demo",
        "Detail pages exist only for the seeded roster — not for members added here.",
      );
      return;
    }
    router.push(`/team/${member.id}`);
  };

  const message = (error: unknown, fallback: string) =>
    error instanceof ApiError ? error.message : fallback;

  const submit = async (values: AccountantFormValues) => {
    if (editing) {
      await saveEdit(editing, values);
      return;
    }
    await createMember(values);
  };

  const saveEdit = async (member: TeamRow, values: AccountantFormValues) => {
    const nextRow: TeamRow = {
      ...member,
      full_name: values.fullName,
      title: values.title,
      status: values.status,
      is_active: values.status !== "inactive",
      email: values.email || member.email,
      phone: values.phone || null,
      role: values.role,
      role_id: values.roleId,
    };

    if (isLive) {
      setPending(true);
      try {
        await patch<TeamMember>(`/team/${member.id}`, {
          full_name: values.fullName,
          title: values.title,
          phone: values.phone || null,
          role: values.role,
          role_id: values.roleId,
          is_active: values.status !== "inactive",
        });
      } catch (error) {
        toast.error("Could not save", message(error, "Please try again."));
        setPending(false);
        return;
      } finally {
        setPending(false);
      }
    }

    setTeam((current) => current.map((row) => (row.id === member.id ? nextRow : row)));
    toast.success(`${values.fullName} updated`, "Changes saved to their roster entry.");
    setModalOpen(false);
  };

  const createMember = async (values: AccountantFormValues) => {
    if (!isLive) {
      // Demo mode has no auth server to provision against, so the row is added
      // locally and clearly labelled as such rather than pretending to email.
      const created: TeamRow = {
        id: nextLocalId(),
        full_name: values.fullName,
        email: values.email || "—",
        phone: values.phone || null,
        title: values.title,
        role: values.role,
        weekly_capacity: 37.5,
        is_active: values.status !== "inactive",
        status: values.status,
        joined: TODAY,
        clients: 0,
        open_tasks: 0,
        overdue: 0,
        estimated_hours: 0,
      };
      setTeam((current) => [...current, created]);
      toast.success(
        `${values.fullName} added`,
        "Demo mode — connect the API to create a real login and email their password.",
      );
      setModalOpen(false);
      return;
    }

    setPending(true);
    try {
      const result = await post<CredentialResult>("/team", {
        email: values.email,
        full_name: values.fullName,
        role: values.role,
        role_id: values.roleId,
        title: values.title,
        phone: values.phone || null,
        send_email: values.sendCredentials,
      });
      setModalOpen(false);
      setCredentials(result);
      // The server computes the roster aggregates, so re-fetch rather than
      // guessing at clients/open_tasks for a member who has none yet.
      router.refresh();
    } catch (error) {
      toast.error("Could not create the account", message(error, "Please try again."));
    } finally {
      setPending(false);
    }
  };

  const resendCredentials = async (member: TeamRow) => {
    if (!isLive) {
      toast.info("Demo mode", "Connect the API to issue and email a new password.");
      return;
    }
    try {
      const result = await post<CredentialResult>(`/team/${member.id}/resend-credentials`);
      setCredentials(result);
    } catch (error) {
      toast.error("Could not reset their password", message(error, "Please try again."));
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    const member = removing;
    setRemoving(null);

    if (isLive) {
      try {
        const result = await del<{ message: string }>(`/team/${member.id}`);
        toast.success(`${member.full_name} removed`, result.message);
        router.refresh();
        return;
      } catch (error) {
        toast.error("Could not remove them", message(error, "Please try again."));
        return;
      }
    }

    setTeam((current) => current.filter((row) => row.id !== member.id));
    toast.success(`${member.full_name} removed`, "They no longer appear on the roster.");
  };

  const columns: Column<TeamRow>[] = [
    {
      key: "name",
      header: "Name",
      cell: (row) => (
        <button
          type="button"
          onClick={() => viewMember(row)}
          className="flex items-center gap-2.5 text-left transition hover:text-brand"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-[11px] font-bold text-brand">
            {initials(row.full_name)}
          </span>
          <span className="min-w-0">
            <span className="block max-w-48 truncate font-medium text-ink">{row.full_name}</span>
            <span className="block text-[11.5px] text-muted">{row.title || "—"}</span>
          </span>
        </button>
      ),
      sortValue: (row) => row.full_name,
      exportValue: (row) => row.full_name,
    },
    {
      key: "email",
      header: "Email",
      cell: (row) => (
        <span className="flex items-center gap-1.5">
          {row.email}
          {row.must_change_password ? (
            <span
              className="rounded-full bg-warn-soft px-1.5 py-0.5 text-[10px] font-bold text-warn"
              title="Still on the temporary password from their welcome email"
            >
              PENDING
            </span>
          ) : null}
        </span>
      ),
      sortValue: (row) => row.email,
      exportValue: (row) => row.email,
    },
    {
      key: "role",
      header: "Access",
      cell: (row) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
              ROLE_TONE[row.role] ?? ROLE_TONE.member,
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
      key: "phone",
      header: "Phone",
      cell: (row) => row.phone ?? "—",
      exportValue: (row) => row.phone ?? "",
    },
    {
      key: "clients",
      header: "Clients",
      align: "right",
      cell: (row) => row.clients,
      sortValue: (row) => row.clients,
    },
    {
      key: "openTasks",
      header: "Open tasks",
      align: "right",
      cell: (row) => row.open_tasks,
      sortValue: (row) => row.open_tasks,
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <span
          className={cn(
            "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
            STATUS_TONE[row.status],
          )}
        >
          {row.status}
        </span>
      ),
      sortValue: (row) => row.status,
      exportValue: (row) => row.status,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (row) => (
        <span className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => viewMember(row)}
            className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink"
            aria-label={`View ${row.full_name}`}
            title="View"
          >
            <Eye className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => openEdit(row)}
            className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink"
            aria-label={`Edit ${row.full_name}`}
            title="Edit"
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => void resendCredentials(row)}
            className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-brand-soft hover:text-brand"
            aria-label={`Resend credentials to ${row.full_name}`}
            title="Issue a new temporary password and email it"
          >
            <KeyRound className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setRemoving(row)}
            className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-danger-soft hover:text-danger"
            aria-label={`Remove ${row.full_name}`}
            title="Remove"
          >
            <Trash2 className="size-4" />
          </button>
        </span>
      ),
    },
  ];

  // Mirrors the backend: /team is hidden from a plain 'admin' now (see
  // backend/app/deps.py's require_team_visible) — the firm's Owner and the
  // platform superadmin still see the roster, but an admin only sees their
  // own assigned clients, not their colleagues' roster entries. This guards
  // a direct visit; the nav link itself is already hidden for them
  // (lib/site.ts's `hiddenFromAdmin`).
  const isPlainAdmin = session.portalRoleLabel !== "Super Admin" && session.me?.profile.role === "admin";
  if (!session.isLoading && isPlainAdmin) {
    return (
      <EmptyState
        icon={<ShieldCheck className="size-6" />}
        title="Owner access required"
        description="The accountant roster is restricted to the firm's owner and the platform superadmin."
      />
    );
  }

  return (
    <>
      <DashboardHeader
        title="Accountants"
        subtitle="Your internal team of CPAs serving your clients."
        actions={
          <>
            <ButtonLink href="/import?mode=users" variant="secondary" icon={<Upload className="size-4" />}>
              Import
            </ButtonLink>
            <Button icon={<UserPlus className="size-4" />} onClick={openAdd}>
              Add accountant
            </Button>
          </>
        }
      />

      {!isLive ? (
        <div className="mb-5">
          <Alert tone="info" title="Sample roster">
            Showing demo data. Once the API is reachable this page lists your real team, and adding
            someone creates their login and emails them a temporary password.
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiTile
          tone="blue"
          value={String(team.length)}
          label="Total team"
          icon={<Users className="size-5" />}
        />
        <KpiTile
          tone="green"
          value={String(active.length)}
          label="Active"
          hint={pendingInvites > 0 ? `${pendingInvites} yet to set a password` : undefined}
          icon={<Users className="size-5" />}
        />
        <KpiTile
          tone="amber"
          value={String(away.length)}
          label="Away"
          icon={<Clock className="size-5" />}
        />
        <KpiTile
          tone="violet"
          value={String(clientsHandled)}
          label="Clients handled"
          icon={<Wallet className="size-5" />}
        />
        <KpiTile
          tone="rose"
          value={String(openTasks)}
          label="Open tasks"
          icon={<TriangleAlert className="size-5" />}
        />
      </div>

      {seats && (seats.staff_seats !== null || seats.client_seats !== null) ? (
        <div className="mt-4 flex flex-wrap gap-3 text-[13px]">
          {seats.staff_seats !== null ? (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium",
                seats.staff_used >= seats.staff_seats
                  ? "border-danger/30 bg-danger-soft text-danger"
                  : "border-line bg-surface-2 text-ink-soft",
              )}
            >
              {seats.staff_used}/{seats.staff_seats} staff seats used
            </span>
          ) : null}
          {seats.client_seats !== null ? (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium",
                seats.client_used >= seats.client_seats
                  ? "border-danger/30 bg-danger-soft text-danger"
                  : "border-line bg-surface-2 text-ink-soft",
              )}
            >
              {seats.client_used}/{seats.client_seats} client seats used
            </span>
          ) : null}
        </div>
      ) : null}

      <section className="mt-6 rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">Team</h2>
          <p className="mt-0.5 text-[13px] text-muted">{team.length} members</p>
        </div>

        <DataTable
          rows={team}
          columns={columns}
          searchKeys={(row) => `${row.full_name} ${row.email} ${row.title} ${row.role}`}
          filters={[
            {
              label: "Statuses",
              options: [
                { value: "active", label: "Active" },
                { value: "away", label: "Away" },
                { value: "inactive", label: "Inactive" },
              ],
              predicate: (row, value) => row.status === value,
            },
            {
              label: "Roles",
              options: [
                { value: "owner", label: "Owner" },
                { value: "admin", label: "Admin" },
                { value: "member", label: "Member" },
                { value: "viewer", label: "Viewer" },
              ],
              predicate: (row, value) => row.role === value,
            },
          ]}
          emptyTitle="No team members match"
          emptyDescription="Try clearing the search or the filters above."
          exportName="speednum-accountants"
        />
      </section>

      <AccountantModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        pending={pending}
        isLive={isLive}
        roles={roles}
        initial={
          editing
            ? {
                fullName: editing.full_name,
                title: editing.title,
                status: editing.status,
                email: editing.email,
                phone: editing.phone ?? "",
                role: editing.role,
                roleId: editing.role_id ?? null,
                sendCredentials: false,
              }
            : null
        }
        onSubmit={(values) => void submit(values)}
      />

      <CredentialsModal
        result={credentials}
        onClose={() => setCredentials(null)}
        kind="accountant"
      />

      <Modal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Remove accountant"
        description="They lose access immediately. Their work stays on record."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon={<Trash2 className="size-4" />}
              onClick={() => void confirmRemove()}
            >
              Remove
            </Button>
          </>
        }
      >
        {removing ? (
          <div className="flex items-start gap-3 rounded-lg bg-danger-soft/60 p-3.5">
            <TriangleAlert className="mt-0.5 size-4.5 shrink-0 text-danger" />
            <p className="text-[13.5px] leading-relaxed text-ink-soft">
              <strong className="font-semibold text-ink">{removing.full_name}</strong> ({removing.email})
              will be deactivated and their sign-in revoked. The{" "}
              {removing.clients} client{removing.clients === 1 ? "" : "s"} and {removing.open_tasks}{" "}
              open task{removing.open_tasks === 1 ? "" : "s"} assigned to them stay in place — reassign
              them afterwards so nothing is left unowned.
            </p>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
