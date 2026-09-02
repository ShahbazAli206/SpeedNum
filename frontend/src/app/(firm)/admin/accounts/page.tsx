"use client";

import { Ban, CheckCircle2, KeyRound, Search, ShieldOff, Trash2 } from "lucide-react";
import { useState } from "react";

import { CredentialsModal } from "@/components/dashboard/credentials-modal";
import { useToast } from "@/components/toast";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  LoadingBlock,
  Modal,
  Select,
  Table,
  TD,
  TH,
} from "@/components/ui";
import { del, patch, post } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useAction, useApi, useDebounced } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { CredentialResult } from "@/lib/types";

/**
 * Search/act on accounts across every tenant without impersonating each one
 * first — the gap /users (tenant-scoped, requires impersonation) and the
 * per-tenant admin console (one firm at a time) both leave open. Every
 * action here hits backend/app/routers/admin_accounts.py, a superadmin-only
 * router that works by profile_id directly rather than the caller's
 * impersonated tenant. Same real-data-only pattern as admin/backups and
 * admin/finance — no demo fallback.
 */

interface Account {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  is_superadmin: boolean;
  is_active: boolean;
  must_change_password: boolean;
  source: "team" | "client";
  client_name: string | null;
  tenant_id: string | null;
  tenant_name: string | null;
  last_sign_in: string | null;
}

interface TenantOption {
  id: string;
  name: string;
}

const ROLE_OPTIONS = [
  { value: "", label: "Any role" },
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" },
];

const SOURCE_OPTIONS = [
  { value: "", label: "Staff & clients" },
  { value: "team", label: "Staff only" },
  { value: "client", label: "Client portal only" },
];

export default function AccountsPage() {
  const toast = useToast();
  const { me } = useSession();
  const ownProfileId = me?.profile.id ?? null;
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 300);
  const [tenantId, setTenantId] = useState("");
  const [role, setRole] = useState("");
  const [source, setSource] = useState("");

  const query = new URLSearchParams();
  if (debouncedSearch.trim()) query.set("q", debouncedSearch.trim());
  if (tenantId) query.set("tenant_id", tenantId);
  if (role) query.set("role", role);
  if (source) query.set("source", source);
  const path = `/admin/accounts${query.toString() ? `?${query.toString()}` : ""}`;

  const accounts = useApi<Account[]>(path, [debouncedSearch, tenantId, role, source]);
  const tenants = useApi<TenantOption[]>("/admin/tenants");
  const mutate = useAction();

  const [credentials, setCredentials] = useState<CredentialResult | null>(null);
  const [removing, setRemoving] = useState<Account | null>(null);
  const [suspending, setSuspending] = useState<Account | null>(null);

  const forbidden = accounts.error?.status === 403;
  if (forbidden) {
    return (
      <EmptyState
        icon={<ShieldOff className="size-6" />}
        title="Superadmin access required"
        description="The cross-tenant accounts directory is restricted to the platform superadmin role."
      />
    );
  }

  const resetPassword = (account: Account) =>
    mutate.run(async () => {
      const result = await post<CredentialResult>(`/admin/accounts/${account.id}/resend-credentials`);
      setCredentials(result);
      await accounts.reload();
    });

  const setActive = async (account: Account, isActive: boolean) => {
    await patch(`/admin/accounts/${account.id}`, { is_active: isActive });
    toast.success(isActive ? `${account.full_name ?? account.email} reactivated` : `${account.full_name ?? account.email} suspended`);
    await accounts.reload();
  };

  const toggleActive = (account: Account) => mutate.run(() => setActive(account, !account.is_active));

  const requestToggleActive = (account: Account) => {
    if (account.is_active) {
      setSuspending(account);
    } else {
      void toggleActive(account);
    }
  };

  const confirmSuspend = () =>
    mutate.run(async () => {
      if (!suspending) return;
      await setActive(suspending, false);
      setSuspending(null);
    });

  const confirmRemove = () =>
    mutate.run(async () => {
      if (!removing) return;
      const result = await del<{ message: string }>(`/admin/accounts/${removing.id}`);
      toast.success("Access removed", result.message);
      setRemoving(null);
      await accounts.reload();
    });

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-[1.6rem] font-bold tracking-tight text-ink">Accounts</h1>
        <p className="mt-0.5 text-[14px] text-muted">
          Every owner, admin, staff and client-portal login across every tenant, in one place.
        </p>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="pl-9"
          />
        </div>
        <Select
          value={tenantId}
          onValueChange={setTenantId}
          options={[{ value: "", label: "Every tenant" }, ...(tenants.data ?? []).map((t) => ({ value: t.id, label: t.name }))]}
          className="w-48"
        />
        <Select value={role} onValueChange={setRole} options={ROLE_OPTIONS} className="w-40" />
        <Select value={source} onValueChange={setSource} options={SOURCE_OPTIONS} className="w-48" />
      </div>

      <section className="rounded-xl border border-line bg-surface shadow-card">
        {accounts.isLoading ? (
          <LoadingBlock rows={6} />
        ) : !accounts.data || accounts.data.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-muted">No accounts match.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <TH>Name</TH>
                <TH>Email</TH>
                <TH>Tenant</TH>
                <TH>Role</TH>
                <TH>Last sign-in</TH>
                <TH>Status</TH>
                <TH align="right">Actions</TH>
              </tr>
            </thead>
            <tbody>
              {accounts.data.map((account) => (
                <tr key={account.id}>
                  <TD>
                    <span className="font-medium text-ink">{account.full_name || "—"}</span>
                    {account.source === "client" ? (
                      <span className="ml-1.5 text-[11.5px] text-muted">({account.client_name ?? "client"})</span>
                    ) : null}
                  </TD>
                  <TD>{account.email}</TD>
                  <TD>{account.tenant_name ?? "—"}</TD>
                  <TD>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="capitalize">{account.role}</span>
                      {account.is_superadmin ? (
                        <Badge tone="brand">Super Admin</Badge>
                      ) : null}
                      {account.must_change_password ? (
                        <Badge tone="warn">Pending</Badge>
                      ) : null}
                    </span>
                  </TD>
                  <TD>{account.last_sign_in ? formatDateTime(account.last_sign_in) : "Never"}</TD>
                  <TD>
                    <Badge tone={account.is_active ? "success" : "neutral"}>
                      {account.is_active ? "Active" : "Suspended"}
                    </Badge>
                  </TD>
                  <TD align="right">
                    <span className="inline-flex gap-1">
                      <button
                        type="button"
                        onClick={() => void resetPassword(account)}
                        className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-brand-soft hover:text-brand"
                        aria-label={`Reset password for ${account.full_name ?? account.email}`}
                        title="Regenerate password — no recovery email needed"
                      >
                        <KeyRound className="size-4" />
                      </button>
                      {account.id !== ownProfileId ? (
                        <button
                          type="button"
                          onClick={() => requestToggleActive(account)}
                          className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink"
                          aria-label={account.is_active ? "Suspend" : "Reactivate"}
                          title={account.is_active ? "Suspend access" : "Reactivate access"}
                        >
                          {account.is_active ? <Ban className="size-4" /> : <CheckCircle2 className="size-4" />}
                        </button>
                      ) : null}
                      {account.id !== ownProfileId ? (
                        <button
                          type="button"
                          onClick={() => setRemoving(account)}
                          className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-danger-soft hover:text-danger"
                          aria-label="Delete permanently"
                          title="Delete this account permanently"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      ) : null}
                    </span>
                  </TD>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <CredentialsModal result={credentials} onClose={() => setCredentials(null)} kind="account" />

      <Modal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Delete account permanently"
        description="This cannot be undone — the account is removed from the database entirely and would need to be recreated from scratch."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={mutate.pending} icon={<Trash2 className="size-4" />} onClick={() => void confirmRemove()}>
              Delete permanently
            </Button>
          </>
        }
      >
        {removing ? (
          <p className="text-[13.5px] text-ink-soft">
            <strong className="font-semibold text-ink">{removing.full_name || removing.email}</strong>{" "}
            ({removing.tenant_name ?? "no tenant"}) will lose access immediately and their account record will be
            permanently deleted. If they still own tasks, clients or documents, this will be rejected — suspend
            them instead in that case.
          </p>
        ) : null}
      </Modal>

      <Modal
        open={suspending !== null}
        onClose={() => setSuspending(null)}
        title="Suspend access"
        description="They'll be signed out and blocked from signing back in until you reactivate the account."
        footer={
          <>
            <Button variant="secondary" onClick={() => setSuspending(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={mutate.pending} icon={<Ban className="size-4" />} onClick={() => void confirmSuspend()}>
              Suspend access
            </Button>
          </>
        }
      >
        {suspending ? (
          <p className="text-[13.5px] text-ink-soft">
            <strong className="font-semibold text-ink">{suspending.full_name || suspending.email}</strong>{" "}
            ({suspending.tenant_name ?? "no tenant"}) will be suspended and unable to sign in.
          </p>
        ) : null}
      </Modal>
    </>
  );
}
