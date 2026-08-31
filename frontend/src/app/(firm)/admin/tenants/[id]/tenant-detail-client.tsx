"use client";

import {
  ArrowLeft,
  Ban,
  Building2,
  CalendarDays,
  Globe,
  Mail,
  Pause,
  Pencil,
  Play,
  Send,
  Signature,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Alert, Badge, Button, Card, EmptyState, Field, Input, LoadingBlock } from "@/components/ui";
import { CredentialsModal, EditTenantModal } from "@/app/(firm)/admin/admin-client";
import {
  resendTenantInvite,
  suspendTenant,
  type CredentialResult,
  type TenantDetail,
} from "@/lib/admin";
import { ApiError } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import { useApi } from "@/lib/hooks";

const cap = (n: number | null | undefined) => (n === null || n === undefined ? "∞" : String(n));

export function TenantDetailClient({ tenantId }: { tenantId: string }) {
  const tenant = useApi<TenantDetail>(`/admin/tenants/${tenantId}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [resent, setResent] = useState<CredentialResult | null>(null);

  if (tenant.error?.status === 403) {
    return (
      <EmptyState
        icon={<Ban className="size-6" />}
        title="Superadmin access required"
        description="This page is restricted to the platform superadmin role."
      />
    );
  }
  if (tenant.error?.status === 404) {
    return <EmptyState title="Firm not found" description="It may have been deleted." />;
  }
  if (tenant.error) {
    return (
      <EmptyState
        title="Couldn't load this firm"
        description="Something went wrong reaching the API. Please try again."
        action={
          <Button variant="secondary" onClick={() => tenant.reload()}>
            Try again
          </Button>
        }
      />
    );
  }
  if (tenant.isLoading || !tenant.data) {
    return <LoadingBlock label="Loading firm…" />;
  }

  const t = tenant.data;

  const toggleSuspend = async () => {
    setError(null);
    setBusy("suspend");
    try {
      await suspendTenant(t.id, !t.is_active);
      tenant.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const resend = async () => {
    setError(null);
    setBusy("resend");
    try {
      setResent(await resendTenantInvite(t.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-[13px] text-muted transition hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        Back to tenants
      </Link>

      {error ? (
        <Alert tone="danger" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-soft text-[15px] font-bold text-brand">
              {t.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-ink">{t.name}</h2>
                <Badge tone={t.is_active ? "success" : "danger"}>
                  {t.is_active ? "Active" : "Suspended"}
                </Badge>
                {t.is_demo ? <Badge tone="warn">Demo</Badge> : null}
              </div>
              <p className="text-[13px] text-muted">
                <span className="font-mono">{t.slug}</span> · <span className="capitalize">{t.plan}</span> plan ·
                created {formatDate(t.created_at)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Impersonation removed: a platform superadmin never opens a
                firm-owner surface, by policy (see components/firm/shell.tsx's
                isProviderOnly). */}
            <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              variant={t.is_active ? "ghost" : "secondary"}
              icon={t.is_active ? <Pause className="size-4" /> : <Play className="size-4" />}
              onClick={toggleSuspend}
              loading={busy === "suspend"}
            >
              {t.is_active ? "Suspend" : "Re-activate"}
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="border-b border-line px-5 py-4">
            <h3 className="text-[15px] font-semibold text-ink">Usage</h3>
          </div>
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
            <UsageStat icon={<Users className="size-4" />} label="Clients" value={`${t.clients} / ${cap(t.max_clients)}`} />
            <UsageStat icon={<Users className="size-4" />} label="Users" value={`${t.users} / ${cap(t.max_users)}`} />
            <UsageStat icon={<Signature className="size-4" />} label="Signed letters" value={String(t.signed_letters)} />
          </div>
        </Card>

        <Card>
          <div className="border-b border-line px-5 py-4">
            <h3 className="text-[15px] font-semibold text-ink">Firm details</h3>
          </div>
          <dl className="divide-y divide-line">
            <DetailRow icon={<Users className="size-4" />} label="Firm admin login" value={t.admin_email ?? "Not set"} />
            <DetailRow icon={<Mail className="size-4" />} label="Contact email" value={t.email ?? "Not set"} />
            <DetailRow
              icon={<Globe className="size-4" />}
              label="Custom domain"
              value={t.custom_domain ?? "Not set"}
            />
            <DetailRow icon={<Building2 className="size-4" />} label="Slug / workspace" value={t.slug} mono />
            <DetailRow
              icon={<CalendarDays className="size-4" />}
              label="Created"
              value={formatDate(t.created_at, "long")}
            />
            {t.admin_last_seen ? (
              <DetailRow
                icon={<CalendarDays className="size-4" />}
                label="Admin last seen"
                value={formatDateTime(t.admin_last_seen)}
              />
            ) : null}
          </dl>
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="text-[15px] font-semibold text-ink">Firm admin access</h3>
        <p className="mt-0.5 text-[13px] text-muted">
          Rotate the admin&apos;s password to a fresh one-time value and re-send their sign-in details.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Field label="Firm admin email" className="min-w-64 flex-1">
            <Input value={t.admin_email ?? "No admin login"} readOnly />
          </Field>
          <Button
            icon={<Send className="size-4" />}
            onClick={resend}
            loading={busy === "resend"}
            disabled={!t.admin_id}
          >
            Resend invite
          </Button>
        </div>
      </Card>

      {editing ? (
        <EditTenantModal
          tenant={t}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            tenant.refresh();
          }}
        />
      ) : null}

      {resent ? (
        <CredentialsModal
          credential={resent}
          title="Credentials reissued"
          onClose={() => setResent(null)}
        />
      ) : null}
    </div>
  );
}

function UsageStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted uppercase">
        <span className="text-brand">{icon}</span>
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 px-5 py-3">
      <span className="mt-0.5 text-muted">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[12px] font-medium text-muted uppercase">{label}</dt>
        <dd className={mono ? "font-mono text-[13px] text-ink" : "text-[13.5px] text-ink"}>{value}</dd>
      </div>
    </div>
  );
}
