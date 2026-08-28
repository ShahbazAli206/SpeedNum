"use client";

import {
  Banknote,
  Download,
  Eye,
  Pencil,
  Plus,
  Rows3,
  Settings,
  Trash2,
  TriangleAlert,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { KpiTile } from "@/components/charts";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { DashboardHeader, KpiRow } from "@/components/dashboard/page-shell";
import { downloadTemplate } from "@/components/dashboard/spreadsheet-drop";
import { useConfirm } from "@/components/confirm";
import { useToast } from "@/components/toast";
import { Button, ButtonLink, Modal, Select, toOptions } from "@/components/ui";
import { ApiError, del, post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { isPortalPending, type ClientRow } from "@/lib/firm-demo";
import { formatDate, formatMoney } from "@/lib/format";
import { CLIENT_COLUMNS, CLIENT_EXAMPLE } from "@/lib/import-templates";
import { useSession } from "@/lib/session";
import type { Client } from "@/lib/types";

interface BulkRow {
  id: string;
  business: string;
  legalName: string;
  email: string;
  phone: string;
  plan: string;
  status: string;
}

const BULK_PLAN_OPTIONS = ["Starter", "Professional", "Growth"];
const BULK_STATUS_OPTIONS = ["active", "prospect", "inactive"];

let bulkRowSeq = 0;
function blankBulkRow(): BulkRow {
  bulkRowSeq += 1;
  return {
    id: `bulk-${bulkRowSeq}`,
    business: "",
    legalName: "",
    email: "",
    phone: "",
    plan: "Starter",
    status: "active",
  };
}

const BULK_CELL =
  "h-8 w-full rounded-md border border-line bg-surface px-2 text-[12.5px] text-ink " +
  "placeholder:text-muted/70 transition focus:border-brand";

const STATUS_TONE: Record<string, string> = {
  active: "bg-success-soft text-success",
  prospect: "bg-warn-soft text-warn",
  inactive: "bg-surface-2 text-muted",
  archived: "bg-surface-2 text-muted",
  pending: "bg-warn-soft text-warn",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function ClientsClient({
  clients,
  owners,
  isLive,
}: {
  clients: ClientRow[];
  owners: string[];
  /** False when `/clients` was unreachable and these rows are sample data. */
  isLive: boolean;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const session = useSession();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>(() =>
    Array.from({ length: 5 }, blankBulkRow),
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const deleteClient = async (row: ClientRow) => {
    const ok = await confirm({
      title: "Delete client?",
      description: `Delete ${row.business_name}? This removes the client record and everything linked to it — deadlines, tasks, letters and files. This can't be undone.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setDeletingId(row.id);
    try {
      await del(`/clients/${row.id}`);
      toast.success("Client deleted", `${row.business_name} has been removed.`);
      router.refresh();
    } catch (error) {
      toast.error(
        "Could not delete this client",
        error instanceof ApiError ? error.message : "Please try again.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const active = clients.filter((client) => client.status === "active" && !isPortalPending(client));
  const recurring = clients.reduce((total, client) => total + client.annual_fee, 0);
  const withOverdue = clients.filter((client) => client.overdue_deadlines > 0).length;

  const columns: Column<ClientRow>[] = [
    {
      key: "name",
      header: "Business name",
      cell: (row) => (
        <Link
          href={`/clients/${row.id}`}
          className="flex items-center gap-2.5 transition hover:text-brand"
          onClick={(event) => event.stopPropagation()}
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-brand-soft text-[11px] font-bold text-brand">
            {row.business_name.slice(0, 2).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block max-w-56 truncate font-medium text-ink">
              {row.business_name}
            </span>
            <span className="block text-[11.5px] text-muted">{row.code}</span>
          </span>
        </Link>
      ),
      sortValue: (row) => row.business_name,
      // Without exportValue the export falls back to the sort key, which for
      // this column is fine but drops the client code — worth carrying.
      exportValue: (row) => `${row.business_name}${row.code ? ` (${row.code})` : ""}`,
    },
    {
      key: "plan",
      header: "Plan",
      cell: (row) => row.plan,
      sortValue: (row) => row.plan,
    },
    {
      key: "fee",
      header: "Monthly fee",
      align: "right",
      cell: (row) => (row.annual_fee > 0 ? formatMoney(row.monthly_fee) : "—"),
      sortValue: (row) => row.monthly_fee,
      // A bare number so the spreadsheet can sum the column.
      exportValue: (row) => row.monthly_fee,
    },
    {
      key: "owner",
      header: "Assigned to",
      cell: (row) => row.owner_name,
      sortValue: (row) => row.owner_name,
    },
    {
      key: "yearEnd",
      header: "Year-end",
      cell: (row) => `${MONTHS[row.year_end_month - 1]} ${row.year_end_day}`,
      sortValue: (row) => row.year_end_month * 100 + row.year_end_day,
      // The sort key is a packed integer (1231). Exporting that would put
      // "1231" in the spreadsheet instead of "Dec 31".
      exportValue: (row) => `${MONTHS[row.year_end_month - 1]} ${row.year_end_day}`,
    },
    {
      key: "work",
      header: "Open work",
      align: "right",
      cell: (row) => (
        <span className="inline-flex items-center gap-1.5">
          {row.overdue_deadlines > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-1.5 py-0.5 text-[10.5px] font-bold text-danger">
              {row.overdue_deadlines} late
            </span>
          ) : null}
          <span className="text-muted">
            {row.open_tasks} task{row.open_tasks === 1 ? "" : "s"}
          </span>
        </span>
      ),
      // Same problem: the sort key packs two numbers into one.
      sortValue: (row) => row.overdue_deadlines * 1000 + row.open_tasks,
      exportValue: (row) =>
        row.overdue_deadlines > 0
          ? `${row.open_tasks} open, ${row.overdue_deadlines} overdue`
          : `${row.open_tasks} open`,
    },
    {
      key: "next",
      header: "Next due",
      align: "right",
      cell: (row) => (row.next_due_date ? formatDate(row.next_due_date) : "—"),
      // "9999-99-99" is a sort sentinel, not a date anyone wants in a file.
      sortValue: (row) => row.next_due_date ?? "9999-99-99",
      exportValue: (row) => row.next_due_date ?? "",
    },
    {
      key: "status",
      header: "Status",
      align: "right",
      cell: (row) => {
        const pending = isPortalPending(row);
        return (
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
              pending ? STATUS_TONE.pending : STATUS_TONE[row.status],
            )}
            title={pending ? "Invited to the portal but hasn't signed in yet" : undefined}
          >
            {pending ? "Pending" : row.status}
          </span>
        );
      },
      sortValue: (row) => (isPortalPending(row) ? "pending" : row.status),
      exportValue: (row) => (isPortalPending(row) ? "pending (invited, not yet signed in)" : row.status),
    },
  ];

  if (isLive) {
    columns.push({
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <span className="inline-flex items-center justify-end gap-1">
          <Link
            href={`/clients/${row.id}`}
            onClick={(event) => event.stopPropagation()}
            aria-label={`View ${row.business_name}`}
            className="rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-ink"
          >
            <Eye className="size-4" />
          </Link>
          {/* Gated on the actual server-enforced permissions (clients.manage /
              clients.delete — see backend/app/permissions.py), not a raw
              owner/admin/superadmin role check: an Owner can grant or deny
              either independently per custom role now, so "isAdmin" alone no
              longer says who can edit or delete a client. */}
          {session.hasPermission("clients.manage") ? (
            <Link
              href={`/clients/${row.id}?edit=1`}
              onClick={(event) => event.stopPropagation()}
              aria-label={`Edit ${row.business_name}`}
              className="rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-ink"
            >
              <Pencil className="size-4" />
            </Link>
          ) : null}
          {session.hasPermission("clients.delete") ? (
            <button
              type="button"
              disabled={deletingId === row.id}
              onClick={(event) => {
                event.stopPropagation();
                void deleteClient(row);
              }}
              aria-label={`Delete ${row.business_name}`}
              className="rounded-lg p-1.5 text-muted transition hover:bg-danger-soft hover:text-danger disabled:opacity-50"
            >
              <Trash2 className="size-4" />
            </button>
          ) : null}
        </span>
      ),
    });
  }

  const readyCount = bulkRows.filter((row) => row.business.trim() !== "").length;

  const updateBulkRow = (id: string, patch: Partial<BulkRow>) => {
    setBulkRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const addBulkRows = (count: number) => {
    setBulkRows((current) => [...current, ...Array.from({ length: count }, blankBulkRow)]);
  };

  const removeBulkRow = (id: string) => {
    setBulkRows((current) => current.filter((row) => row.id !== id));
  };

  const clearBulkRows = () => {
    setBulkRows(Array.from({ length: 5 }, blankBulkRow));
  };

  const createBulkClients = async () => {
    if (readyCount === 0) return;
    const drafts = bulkRows.filter((row) => row.business.trim() !== "");

    if (!isLive) {
      toast.info(
        `${readyCount} client${readyCount === 1 ? "" : "s"} staged (demo)`,
        "No API is connected, so nothing was saved.",
      );
      setBulkOpen(false);
      clearBulkRows();
      return;
    }

    setBulkBusy(true);
    // One POST per row rather than a batch endpoint: /clients has no bulk
    // create, and a per-row loop lets a single duplicate fail on its own
    // instead of rejecting the whole grid. The spreadsheet importer is the
    // right tool past a handful of rows.
    const failures: string[] = [];
    let created = 0;
    for (const row of drafts) {
      try {
        await post<Client>("/clients", {
          legal_name: row.legalName.trim() || row.business.trim(),
          business_name: row.business.trim(),
          email: row.email.trim() || undefined,
          phone: row.phone.trim() || undefined,
          status: row.status,
          tags: row.plan ? [row.plan] : [],
        });
        created += 1;
      } catch (error) {
        failures.push(
          `${row.business.trim()}: ${error instanceof Error ? error.message : "failed"}`,
        );
      }
    }
    setBulkBusy(false);

    if (created > 0) {
      toast.success(
        `${created} client${created === 1 ? "" : "s"} created`,
        failures.length ? `${failures.length} row(s) failed.` : "Added to the client book.",
      );
      router.refresh();
    }
    if (failures.length > 0) {
      toast.error("Some rows did not save", failures.slice(0, 3).join(" · "));
      // Keep the failures on screen so they can be corrected and retried.
      setBulkRows(drafts.filter((row) => failures.some((f) => f.startsWith(row.business.trim()))));
      return;
    }
    setBulkOpen(false);
    clearBulkRows();
  };

  return (
    <>
      <DashboardHeader
        title="Clients"
        subtitle="Manage your clients and their subscriptions"
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Download className="size-4" />}
              onClick={() => {
                downloadTemplate(
                  "speednum-client-import",
                  CLIENT_COLUMNS.map((column) => column.column),
                  CLIENT_EXAMPLE,
                );
                toast.success("Template downloaded", "Fill it in, then upload it on the Import page.");
              }}
            >
              Template
            </Button>
            <ButtonLink href="/import" variant="secondary" icon={<UserPlus className="size-4" />}>
              Import
            </ButtonLink>
            <Button
              variant="secondary"
              icon={<Rows3 className="size-4" />}
              onClick={() => setBulkOpen(true)}
            >
              Bulk add
            </Button>
            <ButtonLink href="/clients/settings" variant="secondary" icon={<Settings className="size-4" />}>
              Client settings
            </ButtonLink>
            <ButtonLink href="/clients/new" icon={<Plus className="size-4" />}>
              Add client
            </ButtonLink>
          </>
        }
      />

      <KpiRow>
        <KpiTile
          tone="blue"
          value={String(clients.length)}
          label="Total clients"
          icon={<Users className="size-5" />}
        />
        <KpiTile
          tone="green"
          value={String(active.length)}
          label="Active clients"
          hint={`${clients.filter((c) => c.portal_enabled).length} with portal access`}
          icon={<Users className="size-5" />}
        />
        <KpiTile
          tone="amber"
          value={String(withOverdue)}
          label="With overdue work"
          icon={<TriangleAlert className="size-5" />}
        />
        <KpiTile
          tone="rose"
          value={formatMoney(recurring)}
          label="Recurring revenue"
          hint="Annual, under contract"
          icon={<Banknote className="size-5" />}
        />
      </KpiRow>

      <section className="mt-6 rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">The client book</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            Every client record — searchable while you work a file
          </p>
        </div>
        <DataTable
          rows={clients}
          columns={columns}
          searchKeys={(row) =>
            `${row.business_name} ${row.legal_name} ${row.code} ${row.owner_name} ${row.city} ${row.tags.join(" ")}`
          }
          filters={[
            {
              label: "Statuses",
              options: [
                { value: "active", label: "Active" },
                { value: "pending", label: "Pending (portal)" },
                { value: "prospect", label: "Prospect" },
                { value: "inactive", label: "Inactive" },
              ],
              predicate: (row, value) => (value === "pending" ? isPortalPending(row) : row.status === value),
            },
            {
              label: "Plans",
              options: ["Growth", "Professional", "Starter"].map((plan) => ({
                value: plan,
                label: plan,
              })),
              predicate: (row, value) => row.plan === value,
            },
            {
              label: "Accountants",
              options: owners.map((owner) => ({ value: owner, label: owner })),
              predicate: (row, value) => row.owner_name === value,
            },
          ]}
          emptyTitle="No clients match"
          emptyDescription="Try clearing the search or the filters above."
          exportName="speednum-clients"
        />
      </section>

      <Modal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Bulk add clients"
        description="Enter several clients at once. Only Business is required — blank rows are skipped."
        width="xl"
        footer={
          <>
            <span className="mr-auto text-[12.5px] text-muted">
              {readyCount} client{readyCount === 1 ? "" : "s"} ready
            </span>
            <Button variant="secondary" onClick={() => setBulkOpen(false)}>
              Cancel
            </Button>
            <Button
              icon={<Plus className="size-4" />}
              disabled={readyCount === 0}
              loading={bulkBusy}
              onClick={() => void createBulkClients()}
            >
              Create {readyCount || ""} client{readyCount === 1 ? "" : "s"}
            </Button>
          </>
        }
      >
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-[12.5px]">
            <thead>
              <tr className="text-[11px] font-semibold tracking-wide text-muted uppercase">
                <th className="w-8 py-1.5 text-left">#</th>
                <th className="py-1.5 pr-2 text-left">
                  Business<span className="ml-0.5 text-danger">*</span>
                </th>
                <th className="py-1.5 pr-2 text-left">Legal name</th>
                <th className="py-1.5 pr-2 text-left">Email</th>
                <th className="py-1.5 pr-2 text-left">Phone</th>
                <th className="py-1.5 pr-2 text-left">Plan</th>
                <th className="py-1.5 pr-2 text-left">Status</th>
                <th className="w-8 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {bulkRows.map((row, index) => (
                <tr key={row.id}>
                  <td className="py-1 pr-2 text-muted tabular-nums">{index + 1}</td>
                  <td className="py-1 pr-2">
                    <input
                      value={row.business}
                      onChange={(event) => updateBulkRow(row.id, { business: event.target.value })}
                      placeholder="Acme Inc."
                      aria-label={`Business name, row ${index + 1}`}
                      className={BULK_CELL}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      value={row.legalName}
                      onChange={(event) => updateBulkRow(row.id, { legalName: event.target.value })}
                      aria-label={`Legal name, row ${index + 1}`}
                      className={BULK_CELL}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      type="email"
                      value={row.email}
                      onChange={(event) => updateBulkRow(row.id, { email: event.target.value })}
                      aria-label={`Email, row ${index + 1}`}
                      className={BULK_CELL}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      value={row.phone}
                      onChange={(event) => updateBulkRow(row.id, { phone: event.target.value })}
                      aria-label={`Phone, row ${index + 1}`}
                      className={BULK_CELL}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <Select
                      value={row.plan}
                      onValueChange={(plan) => updateBulkRow(row.id, { plan })}
                      aria-label={`Plan, row ${index + 1}`}
                      options={toOptions(BULK_PLAN_OPTIONS)}
                      size="sm"
                      variant="pill"
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <Select
                      value={row.status}
                      onValueChange={(status) => updateBulkRow(row.id, { status })}
                      aria-label={`Status, row ${index + 1}`}
                      options={toOptions(BULK_STATUS_OPTIONS)}
                      size="sm"
                      variant="pill"
                      labelClassName="capitalize"
                    />
                  </td>
                  <td className="py-1">
                    <button
                      type="button"
                      onClick={() => removeBulkRow(row.id)}
                      aria-label={`Remove row ${index + 1}`}
                      className="grid size-8 place-items-center rounded-md text-muted transition hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-[12.5px]">
          <span className="text-muted">{bulkRows.length} rows</span>
          <button
            type="button"
            onClick={() => addBulkRows(1)}
            className="font-medium text-brand hover:underline"
          >
            + Add row
          </button>
          <button
            type="button"
            onClick={() => addBulkRows(5)}
            className="font-medium text-brand hover:underline"
          >
            + 5 rows
          </button>
          <button
            type="button"
            onClick={() => addBulkRows(10)}
            className="font-medium text-brand hover:underline"
          >
            + 10 rows
          </button>
          <button
            type="button"
            onClick={clearBulkRows}
            className="font-medium text-muted hover:text-ink hover:underline"
          >
            Clear
          </button>
        </div>
      </Modal>
    </>
  );
}
