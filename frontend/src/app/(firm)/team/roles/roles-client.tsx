"use client";

import { Pencil, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { KpiTile } from "@/components/charts";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { DashboardHeader } from "@/components/dashboard/page-shell";
import { useToast } from "@/components/toast";
import { Alert, Button, EmptyState, Modal } from "@/components/ui";
import { ApiError, del, patch, post } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { PermissionInfo, RoleRow } from "@/lib/types";

import { RoleModal, type RoleFormValues } from "./role-modal";

const DEMO_CATALOG: PermissionInfo[] = [
  { key: "clients.view_all", label: "See every client", description: "Off restricts this role to only its assigned clients." },
  { key: "clients.manage", label: "Create and edit clients", description: "Off means this role cannot create or edit a client record." },
  { key: "clients.delete", label: "Delete clients", description: "Off means this role cannot permanently delete a client." },
  { key: "clients.assign", label: "Reassign clients to staff", description: "Off means this role cannot change who a client is assigned to." },
  { key: "services.manage", label: "Manage the service catalogue", description: "Off means this role cannot create/edit services or assign them to a client." },
  { key: "tasks.view_all", label: "See tasks for every client", description: "Off restricts visible client-linked tasks to assigned clients." },
  { key: "tasks.manage", label: "Create and edit tasks", description: "Off means this role cannot create, edit, or move tasks." },
];

const DEMO_ROLES: RoleRow[] = [
  {
    id: "demo-admin",
    tenant_id: "demo",
    name: "Admin",
    description: "Restricted to their own assigned clients.",
    permissions: {
      "clients.view_all": false,
      "clients.manage": true,
      "clients.delete": true,
      "clients.assign": true,
      "services.manage": true,
      "tasks.view_all": true,
      "tasks.manage": true,
    },
    member_count: 2,
    created_at: null,
  },
  {
    id: "demo-member",
    tenant_id: "demo",
    name: "Member",
    description: "Full access to the firm's book.",
    permissions: {
      "clients.view_all": true,
      "clients.manage": true,
      "clients.delete": false,
      "clients.assign": true,
      "services.manage": true,
      "tasks.view_all": true,
      "tasks.manage": true,
    },
    member_count: 4,
    created_at: null,
  },
];

export function RolesClient({
  initialRoles,
  catalog,
  isLive,
}: {
  initialRoles: RoleRow[];
  catalog: PermissionInfo[];
  isLive: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const session = useSession();

  const [roles, setRoles] = useState(isLive ? initialRoles : DEMO_ROLES);
  const effectiveCatalog = catalog.length > 0 ? catalog : DEMO_CATALOG;
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [pending, setPending] = useState(false);
  const [removing, setRemoving] = useState<RoleRow | null>(null);

  const message = (error: unknown, fallback: string) =>
    error instanceof ApiError ? error.message : fallback;

  const openAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (role: RoleRow) => {
    setEditing(role);
    setModalOpen(true);
  };

  const submit = async (values: RoleFormValues) => {
    const permissions = Object.entries(values.permissions).map(([permission_key, allowed]) => ({
      permission_key,
      allowed,
    }));

    if (!isLive) {
      const row: RoleRow = {
        id: editing?.id ?? `demo-${Date.now()}`,
        tenant_id: "demo",
        name: values.name,
        description: values.description || null,
        permissions: values.permissions,
        member_count: editing?.member_count ?? 0,
        created_at: null,
      };
      setRoles((current) =>
        editing ? current.map((r) => (r.id === row.id ? row : r)) : [...current, row],
      );
      toast.success(`${values.name} saved`, "Demo mode — connect the API to persist this role.");
      setModalOpen(false);
      return;
    }

    setPending(true);
    try {
      if (editing) {
        await patch<RoleRow>(`/roles/${editing.id}`, {
          name: values.name,
          description: values.description || null,
          permissions,
        });
      } else {
        await post<RoleRow>("/roles", {
          name: values.name,
          description: values.description || null,
          permissions,
        });
      }
      setModalOpen(false);
      toast.success(`${values.name} saved`, "Staff granted this role pick up the new permissions immediately.");
      router.refresh();
    } catch (error) {
      toast.error("Could not save the role", message(error, "Please try again."));
    } finally {
      setPending(false);
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    const role = removing;
    setRemoving(null);

    if (!isLive) {
      setRoles((current) => current.filter((r) => r.id !== role.id));
      toast.success(`${role.name} deleted`, "Demo mode — no staff were actually affected.");
      return;
    }

    try {
      const result = await del<{ message: string }>(`/roles/${role.id}`);
      toast.success(`${role.name} deleted`, result.message);
      router.refresh();
    } catch (error) {
      toast.error("Could not delete this role", message(error, "Please try again."));
    }
  };

  const columns: Column<RoleRow>[] = [
    {
      key: "name",
      header: "Role",
      cell: (row) => (
        <span>
          <span className="block font-medium text-ink">{row.name}</span>
          {row.description ? (
            <span className="block max-w-72 truncate text-[12px] text-muted">{row.description}</span>
          ) : null}
        </span>
      ),
      sortValue: (row) => row.name,
      exportValue: (row) => row.name,
    },
    {
      key: "permissions",
      header: "Grants",
      cell: (row) => {
        const granted = effectiveCatalog.filter((p) => row.permissions[p.key]);
        return (
          <span className="inline-flex flex-wrap gap-1">
            {granted.length === 0 ? (
              <span className="text-[12px] text-muted">No permissions granted</span>
            ) : (
              granted.slice(0, 3).map((p) => (
                <span
                  key={p.key}
                  className="inline-flex rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand"
                >
                  {p.label}
                </span>
              ))
            )}
            {granted.length > 3 ? (
              <span className="inline-flex rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">
                +{granted.length - 3} more
              </span>
            ) : null}
          </span>
        );
      },
      exportValue: (row) => effectiveCatalog.filter((p) => row.permissions[p.key]).map((p) => p.label).join("; "),
    },
    {
      key: "members",
      header: "Staff",
      align: "right",
      cell: (row) => row.member_count,
      sortValue: (row) => row.member_count,
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
            aria-label={`Edit ${row.name}`}
            title="Edit"
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setRemoving(row)}
            className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-danger-soft hover:text-danger"
            aria-label={`Delete ${row.name}`}
            title="Delete"
          >
            <Trash2 className="size-4" />
          </button>
        </span>
      ),
    },
  ];

  // Same reasoning as team-client.tsx's isPlainAdmin gate, just a stricter
  // threshold: /roles is OwnerOrSuperadminDep server-side (deps.py), so even
  // Member/Viewer are blocked here, not only a plain admin. Skipped when
  // there is no real session at all (demo mode, no backend configured) so
  // the page stays browsable as a preview.
  const knownNonOwner =
    session.me !== null &&
    session.portalRoleLabel !== "Super Admin" &&
    session.me?.profile.role !== "owner";
  if (!session.isLoading && knownNonOwner) {
    return (
      <EmptyState
        icon={<ShieldCheck className="size-6" />}
        title="Owner access required"
        description="Only the firm's owner (or the platform superadmin) can define roles and their permissions."
      />
    );
  }

  return (
    <>
      <DashboardHeader
        title="Roles & Permissions"
        subtitle="Define staff role types and exactly what each one can see or do."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={openAdd}>
            New role
          </Button>
        }
      />

      {!isLive ? (
        <div className="mb-5">
          <Alert tone="info" title="Sample roles">
            Showing demo data. Once the API is reachable this page manages your firm&rsquo;s real roles, and
            staff granted a role pick up its permissions immediately.
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <KpiTile
          tone="blue"
          value={String(roles.length)}
          label="Roles defined"
          icon={<ShieldCheck className="size-5" />}
        />
        <KpiTile
          tone="violet"
          value={String(roles.reduce((total, r) => total + r.member_count, 0))}
          label="Staff assigned a custom role"
          icon={<Users className="size-5" />}
        />
      </div>

      <section className="mt-6 rounded-xl border border-line bg-surface shadow-card">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">Roles</h2>
          <p className="mt-0.5 text-[13px] text-muted">{roles.length} role(s)</p>
        </div>

        <DataTable
          rows={roles}
          columns={columns}
          searchKeys={(row) => `${row.name} ${row.description ?? ""}`}
          emptyTitle="No roles yet"
          emptyDescription="Create one to start granting staff a custom set of permissions."
          exportName="spidnums-roles"
        />
      </section>

      <RoleModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        pending={pending}
        initial={editing}
        catalog={effectiveCatalog}
        onSubmit={(values) => void submit(values)}
      />

      <Modal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Delete role"
        description="Staff currently on this role keep their account — reassign them first."
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
              Delete
            </Button>
          </>
        }
      >
        {removing ? (
          <p className="text-[13.5px] leading-relaxed text-ink-soft">
            <strong className="font-semibold text-ink">{removing.name}</strong> will be deleted.
            {removing.member_count > 0
              ? ` ${removing.member_count} staff member(s) are still on this role — the API will refuse the delete until they're reassigned.`
              : " No staff are currently on this role."}
          </p>
        ) : null}
      </Modal>
    </>
  );
}
