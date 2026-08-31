"use client";

import {
  Ban,
  Building2,
  Check,
  Copy,
  Eye,
  Globe,
  LogIn,
  Pause,
  Pencil,
  Play,
  Plus,
  Send,
  Signature,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { KpiTile } from "@/components/charts";
import { ExportMenu } from "@/components/dashboard/export-menu";
import { KpiRow } from "@/components/dashboard/page-shell";
import { useToast } from "@/components/toast";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Checkbox,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  NativeSelect,
} from "@/components/ui";
import {
  createTenant,
  deleteTenant,
  remindTenant,
  suspendTenant,
  updateTenant,
  type CredentialResult,
  type TenantEditInput,
  type TenantSummary,
} from "@/lib/admin";
import { startImpersonation } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime } from "@/lib/format";
import { ApiError } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import type { ExpiryTarget } from "@/lib/types";
import { useSpreadsheetExport } from "@/lib/spreadsheet-export";

interface PlatformStats {
  tenants: number;
  active_tenants: number;
  suspended_tenants: number;
  trialing_tenants: number;
  users: number;
  clients: number;
  deadlines: number;
  letters_signed: number;
}

interface PlatformAuditEntry {
  id: number;
  actor_email: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  summary: string | null;
  created_at: string;
  tenant_name: string | null;
}

const PLAN_OPTIONS = ["trial", "starter", "growth", "pro", "enterprise"];
const cap = (n: number | null | undefined) => (n === null || n === undefined ? "∞" : String(n));

/** ISO datetime -> the YYYY-MM-DD an <input type="date"> wants ("" if none). */
function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "";
}

/** YYYY-MM-DD -> an end-of-day UTC ISO datetime for the API (null if blank), so
 * "expires on the 15th" stays valid through that whole day. */
function toExpiryIso(value: string): string | null {
  return value ? `${value}T23:59:59Z` : null;
}

/** Add whole months to the later of today / the current date, as YYYY-MM-DD —
 * the "+3mo" quick buttons extend from a future expiry, or from today if it's
 * already past/empty. */
function addMonths(value: string, months: number): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const current = value ? new Date(`${value}T00:00:00`) : today;
  const base = current > today ? current : today;
  const next = new Date(base.getFullYear(), base.getMonth() + months, base.getDate());
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, "0");
  const d = String(next.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * The platform superadmin's tenants console — every firm on the platform, with
 * the full lifecycle: provision, impersonate, view, edit, suspend and delete.
 * Every call hits a superadmin-only backend endpoint (backend/app/routers/admin.py);
 * a non-superadmin gets a real 403, which is the actual enforcement boundary,
 * and this page just reflects it.
 */
export function AdminClient() {
  const stats = useApi<PlatformStats>("/admin/stats");
  const tenants = useApi<TenantSummary[]>("/admin/tenants");
  const audit = useApi<PlatformAuditEntry[]>("/admin/audit");
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // The provider-only rail's "Add owner" quick action (components/firm/shell.tsx)
  // links here with ?new=1 so it opens straight into tenant creation, the same
  // one-click feel as a firm's "Add client" landing on /clients/new.
  const requestedNew = searchParams.get("new") === "1";
  const [creating, setCreating] = useState(requestedNew);

  // A background token refresh couldn't re-enter the firm being impersonated
  // (lib/auth-client.ts's handleImpersonationLost) and landed here instead —
  // tell the person why, rather than let them discover it only when the next
  // action they take 409s with "no firm is linked to this account".
  useEffect(() => {
    if (searchParams.get("impersonation_ended") !== "1") return;
    toast.info(
      "Returned to the platform console",
      "Your session inside that firm ended unexpectedly (it may have been suspended or removed, or your own sign-in needed refreshing). Open it again from the list below if you still need it.",
    );
    const next = new URLSearchParams(searchParams);
    next.delete("impersonation_ended");
    router.replace(next.size ? `/admin?${next.toString()}` : "/admin");
    // Fires once for whatever query string this component mounted with —
    // re-running on every searchParams identity change would re-show the
    // toast after router.replace's own re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [editing, setEditing] = useState<TenantSummary | null>(null);
  const [deleting, setDeleting] = useState<TenantSummary | null>(null);
  const [credentials, setCredentials] = useState<CredentialResult | null>(null);

  const forbidden =
    stats.error?.status === 403 || tenants.error?.status === 403 || audit.error?.status === 403;

  const refreshAll = () => {
    stats.refresh();
    tenants.refresh();
    audit.refresh();
  };

  const filtered = useMemo(() => {
    const rows = tenants.data ?? [];
    const q = query.trim().toLowerCase();
    return rows.filter((t) => {
      if (statusFilter === "active" && !t.is_active) return false;
      if (statusFilter === "suspended" && t.is_active) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q) ||
        (t.admin_email ?? "").toLowerCase().includes(q)
      );
    });
  }, [tenants.data, query, statusFilter]);

  const tenantExportColumns = useMemo(
    () => [
      { header: "Firm", value: (row: TenantSummary) => row.name },
      { header: "Slug", value: (row: TenantSummary) => row.slug },
      { header: "Custom domain", value: (row: TenantSummary) => row.custom_domain ?? "" },
      { header: "Admin email", value: (row: TenantSummary) => row.admin_email ?? "" },
      { header: "Plan", value: (row: TenantSummary) => row.plan },
      { header: "Status", value: (row: TenantSummary) => (row.is_active ? "Active" : "Suspended") },
      { header: "Demo", value: (row: TenantSummary) => (row.is_demo ? "Yes" : "No") },
      { header: "Platform workspace", value: (row: TenantSummary) => (row.is_platform ? "Yes" : "No") },
      { header: "Clients", value: (row: TenantSummary) => row.clients },
      { header: "Max clients", value: (row: TenantSummary) => cap(row.max_clients) },
      { header: "Users", value: (row: TenantSummary) => row.users },
      { header: "Max users", value: (row: TenantSummary) => cap(row.max_users) },
      { header: "Signed letters", value: (row: TenantSummary) => row.signed_letters },
      { header: "Created", value: (row: TenantSummary) => row.created_at ?? "" },
    ],
    [],
  );
  const tenantExport = useSpreadsheetExport(filtered, tenantExportColumns, "speednum-tenants");

  const auditExportColumns = useMemo(
    () => [
      { header: "Timestamp", value: (row: PlatformAuditEntry) => row.created_at },
      { header: "Actor", value: (row: PlatformAuditEntry) => row.actor_email ?? "System" },
      { header: "Action", value: (row: PlatformAuditEntry) => row.action },
      { header: "Entity", value: (row: PlatformAuditEntry) => row.entity },
      { header: "Firm", value: (row: PlatformAuditEntry) => row.tenant_name ?? "" },
      { header: "Summary", value: (row: PlatformAuditEntry) => row.summary ?? "" },
    ],
    [],
  );
  const auditExport = useSpreadsheetExport(audit.data ?? [], auditExportColumns, "speednum-audit-log");

  if (forbidden) {
    return (
      <EmptyState
        icon={<Ban className="size-6" />}
        title="Superadmin access required"
        description="The platform console is restricted to the platform superadmin role."
      />
    );
  }

  const impersonate = async (tenant: TenantSummary) => {
    setActionError(null);
    setBusyId(tenant.id);
    try {
      await startImpersonation(tenant.id);
      // A full navigation, not router.push: the session identity just changed
      // (new access cookie), so the proxy and the firm shell must re-run and
      // re-read /auth/me as the impersonated firm rather than reuse this tree.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/overview");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not open that firm.");
      setBusyId(null);
    }
  };

  const toggleSuspend = async (tenant: TenantSummary) => {
    setActionError(null);
    setBusyId(tenant.id);
    try {
      await suspendTenant(tenant.id, !tenant.is_active);
      refreshAll();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <KpiRow>
        <KpiTile
          tone="blue"
          value={stats.data ? String(stats.data.tenants) : "—"}
          label="Total tenants"
          hint={stats.data ? `${stats.data.active_tenants} active` : undefined}
          icon={<Building2 className="size-5" />}
        />
        <KpiTile
          tone="amber"
          value={stats.data?.trialing_tenants != null ? String(stats.data.trialing_tenants) : "—"}
          label="Trialing"
          icon={<Building2 className="size-5" />}
        />
        <KpiTile
          tone="rose"
          value={stats.data?.suspended_tenants != null ? String(stats.data.suspended_tenants) : "—"}
          label="Suspended"
          icon={<Ban className="size-5" />}
        />
        <KpiTile
          tone="green"
          value={stats.data ? String(stats.data.clients) : "—"}
          label="Clients (all firms)"
          icon={<Users className="size-5" />}
        />
        <KpiTile
          tone="violet"
          value={stats.data ? String(stats.data.letters_signed) : "—"}
          label="Signed letters"
          icon={<Signature className="size-5" />}
        />
      </KpiRow>

      {actionError ? (
        <Alert tone="danger" className="mt-4" onDismiss={() => setActionError(null)}>
          {actionError}
        </Alert>
      ) : null}

      <section className="mt-6 rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-ink">Firms</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              {tenants.data ? `${tenants.data.length} firms` : "Every firm on the platform"} — create,
              configure, impersonate and suspend
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, slug, email…"
              className="h-9 w-56"
            />
            <NativeSelect
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="h-9 w-36"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </NativeSelect>
            <ExportMenu
              exportCsv={tenantExport.exportCsv}
              exportXlsx={tenantExport.exportXlsx}
              exportPdf={tenantExport.exportPdf}
              exporting={tenantExport.exporting}
            />
            <ButtonLink
              href="/import?mode=tenants"
              variant="secondary"
              size="sm"
              icon={<Upload className="size-4" />}
            >
              Import
            </ButtonLink>
            <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              New tenant
            </Button>
          </div>
        </div>

        {tenants.isLoading ? (
          <LoadingBlock label="Loading tenants…" />
        ) : !filtered.length ? (
          <EmptyState title={tenants.data?.length ? "No firms match your filters" : "No tenants yet"} />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-line text-[11.5px] tracking-wide text-muted uppercase">
                  <th className="px-5 py-2.5 text-left font-semibold">Firm</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Admin</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Plan</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Clients</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Users</th>
                  <th className="px-5 py-2.5 text-center font-semibold">Status</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Created</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tenant) => (
                  <tr key={tenant.id} className="border-b border-line last:border-b-0">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-brand-soft text-[11px] font-bold text-brand">
                          {tenant.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <Link
                            href={`/admin/tenants/${tenant.id}`}
                            className="block truncate font-medium text-ink hover:text-brand"
                          >
                            {tenant.name}
                          </Link>
                          <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted">
                            {tenant.custom_domain ? (
                              <>
                                <Globe className="size-3 text-brand" />
                                {tenant.custom_domain}
                              </>
                            ) : (
                              tenant.slug
                            )}
                            {tenant.is_demo ? (
                              <Badge tone="warn" className="ml-1">
                                Demo
                              </Badge>
                            ) : null}
                            {tenant.is_platform ? (
                              <Badge tone="brand" className="ml-1">
                                Platform
                              </Badge>
                            ) : null}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-ink-soft">{tenant.admin_email ?? "—"}</td>
                    <td className="px-5 py-3 text-ink-soft capitalize">{tenant.plan}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-ink-soft">
                      {tenant.clients} / {cap(tenant.max_clients)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-ink-soft">
                      {tenant.users} / {cap(tenant.max_users)}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <Badge tone={tenant.is_active ? "success" : "danger"}>
                        {tenant.is_active ? "Active" : "Suspended"}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted">
                      {formatDate(tenant.created_at)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <IconAction
                          title="Open admin panel (impersonate)"
                          onClick={() => impersonate(tenant)}
                          busy={busyId === tenant.id}
                        >
                          <LogIn className="size-4" />
                        </IconAction>
                        <Link
                          href={`/admin/tenants/${tenant.id}`}
                          title="View firm"
                          className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink"
                        >
                          <Eye className="size-4" />
                        </Link>
                        <IconAction title="Edit tenant" onClick={() => setEditing(tenant)}>
                          <Pencil className="size-4" />
                        </IconAction>
                        <IconAction
                          title={tenant.is_active ? "Suspend firm" : "Re-activate firm"}
                          onClick={() => toggleSuspend(tenant)}
                          busy={busyId === tenant.id}
                          tone={tenant.is_active ? "warn" : "success"}
                        >
                          {tenant.is_active ? <Pause className="size-4" /> : <Play className="size-4" />}
                        </IconAction>
                        <IconAction
                          title="Delete tenant"
                          tone="danger"
                          onClick={() => setDeleting(tenant)}
                        >
                          <Trash2 className="size-4" />
                        </IconAction>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Audit log</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              Append-only, across every tenant — including every superadmin action here
            </p>
          </div>
          <ExportMenu
            exportCsv={auditExport.exportCsv}
            exportXlsx={auditExport.exportXlsx}
            exportPdf={auditExport.exportPdf}
            exporting={auditExport.exporting}
          />
        </div>
        {audit.isLoading ? (
          <LoadingBlock label="Loading audit log…" />
        ) : !audit.data?.length ? (
          <EmptyState title="No audit events yet" />
        ) : (
          <ul className="divide-y divide-line">
            {audit.data.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 px-5 py-3">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-brand" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-snug text-ink-soft">
                    <strong className="font-semibold text-ink">{entry.actor_email ?? "System"}</strong>{" "}
                    {entry.action}{" "}
                    <span className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-muted">
                      {entry.entity}
                    </span>
                    {entry.tenant_name ? ` · ${entry.tenant_name}` : ""}
                    {entry.summary ? ` — ${entry.summary}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-[11.5px] whitespace-nowrap text-muted">
                  {formatDateTime(entry.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {creating ? (
        <CreateTenantModal
          onClose={() => setCreating(false)}
          onCreated={(result) => {
            setCreating(false);
            setCredentials(result);
            refreshAll();
          }}
        />
      ) : null}

      {editing ? (
        <EditTenantModal
          tenant={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refreshAll();
          }}
        />
      ) : null}

      {deleting ? (
        <DeleteTenantModal
          tenant={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            refreshAll();
          }}
        />
      ) : null}

      {credentials ? (
        <CredentialsModal credential={credentials} onClose={() => setCredentials(null)} />
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */

function IconAction({
  title,
  onClick,
  busy = false,
  tone = "neutral",
  children,
}: {
  title: string;
  onClick: () => void;
  busy?: boolean;
  tone?: "neutral" | "warn" | "danger" | "success";
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "text-muted hover:text-ink",
    warn: "text-warn hover:text-warn",
    danger: "text-danger hover:text-danger",
    success: "text-success hover:text-success",
  };
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={busy}
      className={cn(
        "grid size-8 place-items-center rounded-lg transition hover:bg-surface-2 disabled:opacity-50",
        tones[tone],
      )}
    >
      {children}
    </button>
  );
}

function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

function CreateTenantModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (credential: CredentialResult) => void;
}) {
  const [name, setName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminName, setAdminName] = useState("");
  const [slug, setSlug] = useState("");
  const [plan, setPlan] = useState("trial");
  const [customDomain, setCustomDomain] = useState("");
  const [maxClients, setMaxClients] = useState("");
  const [maxUsers, setMaxUsers] = useState("");
  const [isDemo, setIsDemo] = useState(false);
  const [isPlatform, setIsPlatform] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (name.trim().length < 2) return setError("Firm name is required.");
    if (!adminEmail.trim()) return setError("An admin email is required.");
    setPending(true);
    try {
      const result = await createTenant({
        name: name.trim(),
        admin_email: adminEmail.trim(),
        admin_name: adminName.trim() || undefined,
        slug: slug.trim() || null,
        plan,
        custom_domain: customDomain.trim() || null,
        max_clients: numberOrNull(maxClients),
        max_users: numberOrNull(maxUsers),
        is_demo: isDemo,
        is_platform: isPlatform,
        send_email: sendEmail,
      });
      onCreated(result.admin);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
      setPending(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New tenant"
      description="Provision a firm and its first admin login in one step."
      width="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending}>
            Create firm
          </Button>
        </>
      }
    >
      {error ? (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      ) : null}
      <div className="grid gap-4">
        <Field label="Firm name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Amzad Amiri Professional Corporation" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Admin email" required>
            <Input
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="admin@firm.com"
            />
          </Field>
          <Field label="Admin name">
            <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Nadia Amiri" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Slug / subdomain" hint="Blank auto-generates from the name">
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="amzad-amiri" />
          </Field>
          <Field label="Plan">
            <NativeSelect value={plan} onChange={(e) => setPlan(e.target.value)}>
              {PLAN_OPTIONS.map((p) => (
                <option key={p} value={p} className="capitalize">
                  {p}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <Field label="Custom domain (white-label)" hint="Optional — requires DNS setup">
          <Input value={customDomain} onChange={(e) => setCustomDomain(e.target.value)} placeholder="app.firmname.com" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Max clients" hint="Blank = ∞">
            <Input value={maxClients} onChange={(e) => setMaxClients(e.target.value)} placeholder="∞" inputMode="numeric" />
          </Field>
          <Field label="Max users" hint="Blank = ∞">
            <Input value={maxUsers} onChange={(e) => setMaxUsers(e.target.value)} placeholder="∞" inputMode="numeric" />
          </Field>
        </div>
        <Checkbox
          checked={isDemo}
          onChange={(e) => setIsDemo(e.target.checked)}
          label={
            <span>
              Sandbox / demo tenant
              <span className="block text-[12px] text-muted">For evaluation — keep real client data out of it.</span>
            </span>
          }
        />
        <Checkbox
          checked={isPlatform}
          onChange={(e) => setIsPlatform(e.target.checked)}
          label={
            <span>
              This is our own platform workspace
              <span className="block text-[12px] text-muted">
                Not a customer — an account here sees Settings and Notifications for this workspace, but not
                the client-servicing pages. At most one tenant should carry this.
              </span>
            </span>
          }
        />
        <Checkbox
          checked={sendEmail}
          onChange={(e) => setSendEmail(e.target.checked)}
          label="Email the admin their sign-in credentials"
        />
      </div>
    </Modal>
  );
}

export function EditTenantModal({
  tenant,
  onClose,
  onSaved,
}: {
  tenant: TenantSummary;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(tenant.name);
  const [slug, setSlug] = useState(tenant.slug);
  const [email, setEmail] = useState(tenant.admin_email ?? "");
  const [plan, setPlan] = useState(tenant.plan);
  const [customDomain, setCustomDomain] = useState(tenant.custom_domain ?? "");
  const [isActive, setIsActive] = useState(tenant.is_active);
  const [maxClients, setMaxClients] = useState(tenant.max_clients === null ? "" : String(tenant.max_clients));
  const [maxUsers, setMaxUsers] = useState(tenant.max_users === null ? "" : String(tenant.max_users));
  const initialPlanExpiry = toDateInput(tenant.plan_expires_at);
  const initialServiceExpiry = toDateInput(tenant.service_expires_at);
  const [planExpires, setPlanExpires] = useState(initialPlanExpiry);
  const [serviceExpires, setServiceExpires] = useState(initialServiceExpiry);
  const [isDemo, setIsDemo] = useState(tenant.is_demo);
  const [isPlatform, setIsPlatform] = useState(tenant.is_platform);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setPending(true);
    const payload: TenantEditInput = {
      name: name.trim(),
      slug: slug.trim(),
      email: email.trim() || null,
      plan,
      custom_domain: customDomain.trim() || null,
      is_active: isActive,
      max_clients: numberOrNull(maxClients),
      max_users: numberOrNull(maxUsers),
      is_demo: isDemo,
      is_platform: isPlatform,
    };
    // Only send a date when it actually changed, so an untouched save neither
    // clears it nor spuriously resets its reminder ladder.
    if (planExpires !== initialPlanExpiry) payload.plan_expires_at = toExpiryIso(planExpires);
    if (serviceExpires !== initialServiceExpiry) payload.service_expires_at = toExpiryIso(serviceExpires);
    try {
      await updateTenant(tenant.id, payload);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
      setPending(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit tenant"
      description="Update this firm's plan, limits and status."
      width="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending}>
            Save changes
          </Button>
        </>
      }
    >
      {error ? (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      ) : null}
      <div className="grid gap-4">
        <Field label="Firm name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Slug / subdomain">
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
          </Field>
          <Field label="Contact email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
        <Field label="Custom domain (white-label)">
          <Input value={customDomain} onChange={(e) => setCustomDomain(e.target.value)} placeholder="app.firmname.com" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Plan">
            <NativeSelect value={plan} onChange={(e) => setPlan(e.target.value)}>
              {[...new Set([tenant.plan, ...PLAN_OPTIONS])].map((p) => (
                <option key={p} value={p} className="capitalize">
                  {p}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Status">
            <NativeSelect value={isActive ? "active" : "suspended"} onChange={(e) => setIsActive(e.target.value === "active")}>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </NativeSelect>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Max clients" hint="Blank = ∞">
            <Input value={maxClients} onChange={(e) => setMaxClients(e.target.value)} placeholder="∞" inputMode="numeric" />
          </Field>
          <Field label="Max users" hint="Blank = ∞">
            <Input value={maxUsers} onChange={(e) => setMaxUsers(e.target.value)} placeholder="∞" inputMode="numeric" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ExpiryField
            label="Plan expiry"
            target="plan"
            tenantId={tenant.id}
            value={planExpires}
            onChange={setPlanExpires}
          />
          <ExpiryField
            label="Server / domain expiry"
            target="service"
            tenantId={tenant.id}
            value={serviceExpires}
            onChange={setServiceExpires}
          />
        </div>
        <p className="-mt-1 text-[12px] text-muted">
          Past either date the firm is locked out until it&apos;s extended. Use the quick buttons to
          renew for the coming months, or &ldquo;Remind&rdquo; to nudge the company now.
        </p>
        <Checkbox
          checked={isDemo}
          onChange={(e) => setIsDemo(e.target.checked)}
          label={
            <span>
              Sandbox / demo tenant
              <span className="block text-[12px] text-muted">For evaluation — keep real client data out of it.</span>
            </span>
          }
        />
        <Checkbox
          checked={isPlatform}
          onChange={(e) => setIsPlatform(e.target.checked)}
          label={
            <span>
              This is our own platform workspace
              <span className="block text-[12px] text-muted">
                Not a customer — an account here sees Settings and Notifications for this workspace, but not
                the client-servicing pages. At most one tenant should carry this.
              </span>
            </span>
          }
        />
      </div>
    </Modal>
  );
}

/** One expiry date in the edit modal: a date input, quick "+N months" buttons
 * that renew from the later of today / the current date, a clear, and a manual
 * "Remind" that drops a renewal notice into the company's bell immediately. */
function ExpiryField({
  label,
  target,
  tenantId,
  value,
  onChange,
}: {
  label: string;
  target: ExpiryTarget;
  tenantId: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { run, pending } = useAction();
  const toast = useToast();
  return (
    <Field label={label} hint="Blank = no expiry">
      <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} />
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {[1, 3, 6, 12].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange(addMonths(value, m))}
            className="rounded-md border border-line px-2 py-0.5 text-[11.5px] font-medium text-ink-soft transition hover:bg-surface-2"
          >
            +{m}mo
          </button>
        ))}
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="rounded-md px-2 py-0.5 text-[11.5px] font-medium text-muted transition hover:text-danger"
          >
            Clear
          </button>
        ) : null}
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            const ok = await run(() => remindTenant(tenantId, target));
            if (ok) toast.success("Reminder sent to the company");
          }}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[11.5px] font-medium text-ink-soft transition hover:bg-surface-2 disabled:opacity-50"
        >
          <Send className="size-3" />
          Remind
        </button>
      </div>
    </Field>
  );
}

function DeleteTenantModal({
  tenant,
  onClose,
  onDeleted,
}: {
  tenant: TenantSummary;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const armed = confirm.trim() === tenant.slug;

  const submit = async () => {
    if (!armed) return;
    setError(null);
    setPending(true);
    try {
      await deleteTenant(tenant.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
      setPending(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Delete tenant"
      description="This permanently removes the firm and all of its data."
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="danger" onClick={submit} loading={pending} disabled={!armed}>
            Delete permanently
          </Button>
        </>
      }
    >
      {error ? (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      ) : null}
      <Alert tone="danger" className="mb-4">
        Deleting <strong>{tenant.name}</strong> removes {tenant.clients} client
        {tenant.clients === 1 ? "" : "s"}, {tenant.users} user{tenant.users === 1 ? "" : "s"}, and every
        task, deadline and letter under it. This cannot be undone.
      </Alert>
      <Field label={`Type the slug "${tenant.slug}" to confirm`}>
        <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={tenant.slug} autoFocus />
      </Field>
    </Modal>
  );
}

export function CredentialsModal({
  credential,
  onClose,
  title = "Firm created",
}: {
  credential: CredentialResult;
  onClose: () => void;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(credential.temp_password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — the password is visible to copy by hand
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      width="sm"
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <Alert tone={credential.email_sent ? "success" : "warn"} className="mb-4">
        {credential.message}
      </Alert>
      <div className="space-y-3 text-sm">
        <div>
          <p className="text-[12px] font-medium text-muted uppercase">Admin login</p>
          <p className="font-medium text-ink">{credential.email}</p>
        </div>
        <div>
          <p className="text-[12px] font-medium text-muted uppercase">Temporary password</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-[13px] text-ink">
              {credential.temp_password}
            </code>
            <Button size="sm" variant="ghost" icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />} onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="mt-1 text-[12px] text-muted">
            They&apos;ll be forced to set a new password on first sign-in.
          </p>
        </div>
      </div>
    </Modal>
  );
}
