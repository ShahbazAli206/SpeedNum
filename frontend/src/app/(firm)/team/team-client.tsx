"use client";

import {
  Clock,
  Eye,
  Pencil,
  TriangleAlert,
  UserPlus,
  Users,
  Wallet,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { KpiTile } from "@/components/charts";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { DashboardHeader } from "@/components/dashboard/page-shell";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { TODAY, type TeamRow, type TeamStatus } from "@/lib/firm-demo";
import { initials } from "@/lib/format";

import { AccountantModal, type AccountantFormValues } from "./accountant-modal";

const STATUS_TONE: Record<TeamStatus, string> = {
  active: "bg-success-soft text-success",
  away: "bg-warn-soft text-warn",
  inactive: "bg-surface-2 text-muted",
};

let localSeq = 0;
function nextLocalId() {
  localSeq += 1;
  return `local-${localSeq}`;
}

export function TeamClient({ initialTeam }: { initialTeam: TeamRow[] }) {
  const toast = useToast();
  const router = useRouter();

  const [team, setTeam] = useState(initialTeam);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TeamRow | null>(null);

  const active = team.filter((member) => member.status === "active");
  const away = team.filter((member) => member.status === "away");
  const clientsHandled = team.reduce((total, member) => total + member.clients, 0);
  const openTasks = team.reduce((total, member) => total + member.open_tasks, 0);

  const openAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (member: TeamRow) => {
    setEditing(member);
    setModalOpen(true);
  };

  const viewMember = (member: TeamRow) => {
    if (member.id.startsWith("local-")) {
      toast.info(
        "Not available in this demo",
        "Detail pages exist only for the seeded roster — not for members added here.",
      );
      return;
    }
    router.push(`/team/${member.id}`);
  };

  const removeMember = (member: TeamRow) => {
    setTeam((current) => current.filter((row) => row.id !== member.id));
    toast.success(`${member.full_name} removed`, "They no longer appear on the roster.");
  };

  const submit = (values: AccountantFormValues) => {
    if (editing) {
      setTeam((current) =>
        current.map((row) =>
          row.id === editing.id
            ? {
                ...row,
                full_name: values.fullName,
                title: values.title,
                status: values.status,
                is_active: values.status !== "inactive",
                email: values.email || row.email,
                phone: values.phone || null,
              }
            : row,
        ),
      );
      toast.success(`${values.fullName} updated`, "Changes saved to their roster entry.");
    } else {
      const created: TeamRow = {
        id: nextLocalId(),
        full_name: values.fullName,
        email: values.email || "—",
        phone: values.phone || null,
        title: values.title,
        role: "member",
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
      toast.success(`${values.fullName} added`, "New team member is on the roster.");
    }
    setModalOpen(false);
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
            <span className="block text-[11.5px] text-muted">{row.title}</span>
          </span>
        </button>
      ),
      sortValue: (row) => row.full_name,
    },
    {
      key: "email",
      header: "Email",
      cell: (row) => row.email,
      sortValue: (row) => row.email,
    },
    {
      key: "phone",
      header: "Phone",
      cell: (row) => row.phone ?? "—",
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
          >
            <Eye className="size-4" />
          </button>
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
            onClick={() => removeMember(row)}
            className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-danger-soft hover:text-danger"
            aria-label={`Remove ${row.full_name}`}
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
        title="Accountants"
        subtitle="Your internal team of CPAs serving your clients."
        actions={
          <Button icon={<UserPlus className="size-4" />} onClick={openAdd}>
            Add accountant
          </Button>
        }
      />

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
          exportName="speednum-team"
        />
      </section>

      <AccountantModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initial={
          editing
            ? {
                fullName: editing.full_name,
                title: editing.title,
                status: editing.status,
                email: editing.email,
                phone: editing.phone ?? "",
              }
            : null
        }
        onSubmit={submit}
      />
    </>
  );
}
