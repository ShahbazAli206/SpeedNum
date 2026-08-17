"use client";

import { Building2, Globe, ShieldCheck, ShieldOff, Signature, Users } from "lucide-react";

import { KpiTile } from "@/components/charts";
import { KpiRow } from "@/components/dashboard/page-shell";
import { EmptyState, LoadingBlock } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime } from "@/lib/format";
import { useApi } from "@/lib/hooks";

interface PlatformStats {
  tenants: number;
  active_tenants: number;
  users: number;
  clients: number;
  deadlines: number;
  letters_signed: number;
}

interface PlatformTenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  seats: number;
  is_active: boolean;
  custom_domain: string | null;
  created_at: string;
  clients: number;
  users: number;
  signed_letters: number;
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

/**
 * Real data, unlike this page used to be — every call hits a superadmin-only
 * backend endpoint (backend/app/routers/admin.py), same pattern as
 * admin/backups/page.tsx: a non-superadmin gets a real 403, which is the
 * actual enforcement boundary, and this page just reflects it.
 */
export function AdminClient() {
  const stats = useApi<PlatformStats>("/admin/stats");
  const tenants = useApi<PlatformTenant[]>("/admin/tenants");
  const audit = useApi<PlatformAuditEntry[]>("/admin/audit");

  const forbidden =
    stats.error?.status === 403 || tenants.error?.status === 403 || audit.error?.status === 403;

  if (forbidden) {
    return (
      <EmptyState
        icon={<ShieldOff className="size-6" />}
        title="Superadmin access required"
        description="The platform console is restricted to the platform superadmin role."
      />
    );
  }

  return (
    <>
      <KpiRow>
        <KpiTile
          tone="blue"
          value={stats.data ? String(stats.data.tenants) : "—"}
          label="Tenants"
          hint={stats.data ? `${stats.data.active_tenants} active` : undefined}
          icon={<Building2 className="size-5" />}
        />
        <KpiTile
          tone="green"
          value={stats.data ? String(stats.data.clients) : "—"}
          label="Clients across all firms"
          icon={<Users className="size-5" />}
        />
        <KpiTile
          tone="amber"
          value={stats.data ? String(stats.data.users) : "—"}
          label="Seats in use"
          icon={<Users className="size-5" />}
        />
        <KpiTile
          tone="rose"
          value={stats.data ? String(stats.data.letters_signed) : "—"}
          label="Signed letters"
          icon={<Signature className="size-5" />}
        />
      </KpiRow>

      <section className="mt-6 rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">Tenants</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            Each fully isolated — tenant_id-scoped queries enforce the boundary in every request,
            not only in the application layer
          </p>
        </div>

        {tenants.isLoading ? (
          <LoadingBlock label="Loading tenants…" />
        ) : !tenants.data?.length ? (
          <EmptyState title="No tenants yet" />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-line text-[11.5px] tracking-wide text-muted uppercase">
                  <th className="px-5 py-2.5 text-left font-semibold">Firm</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Plan</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Domain</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Clients</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Seats</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Signed</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Created</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {tenants.data.map((tenant) => (
                  <tr key={tenant.id} className="border-b border-line last:border-b-0">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-brand-soft text-[11px] font-bold text-brand">
                          {tenant.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink">{tenant.name}</span>
                          <span className="block font-mono text-[11px] text-muted">{tenant.slug}</span>
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-ink-soft">{tenant.plan}</td>
                    <td className="px-5 py-3">
                      {tenant.custom_domain ? (
                        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-soft">
                          <Globe className="size-3.5 text-brand" />
                          {tenant.custom_domain}
                        </span>
                      ) : (
                        <span className="font-mono text-[11.5px] text-muted">{tenant.slug}.speednum.com</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-ink-soft">{tenant.clients}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-ink-soft">
                      {tenant.users} / {tenant.seats}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-ink-soft">{tenant.signed_letters}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted">{formatDate(tenant.created_at)}</td>
                    <td className="px-5 py-3 text-right">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          tenant.is_active ? "bg-success-soft text-success" : "bg-surface-2 text-muted",
                        )}
                      >
                        {tenant.is_active ? "Active" : "Suspended"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-semibold text-ink">Audit log</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              Append-only, across every tenant — &quot;who changed this, and when&quot; is a query,
              not an investigation
            </p>
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

        <section className="rounded-xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
              <ShieldCheck className="size-4.5" />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Isolation model</h2>
              <p className="mt-0.5 text-[13px] text-muted">How the boundary is enforced</p>
            </div>
          </div>
          <ul className="mt-4 space-y-3">
            {[
              "Every API request is verified against the identity provider's public keys.",
              "The caller's profile pins exactly one tenant; every query filters by it.",
              "Every mutation writes to an append-only audit log with actor, action and entity.",
              "Backups and object storage are provisioned per deployment, with retention automation.",
            ].map((point) => (
              <li key={point} className="flex items-start gap-2.5">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
                <span className="text-[13px] leading-relaxed text-ink-soft">{point}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
