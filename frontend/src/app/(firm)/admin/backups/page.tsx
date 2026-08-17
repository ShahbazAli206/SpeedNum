"use client";

import { AlertTriangle, HardDrive, Laptop, RefreshCw, ShieldOff, Trash2 } from "lucide-react";

import { Badge, Button, EmptyState, LoadingBlock, Table, TD, TH } from "@/components/ui";
import { useToast } from "@/components/toast";
import { post } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { formatDateTime } from "@/lib/format";

/**
 * Real data, unlike the rest of this admin console (see admin/page.tsx —
 * still demo data). Every call here hits a superadmin-only backend endpoint
 * (backend/app/routers/admin_backups.py, admin_devices.py); a non-superadmin
 * gets a real 403 from the API, which is the actual enforcement boundary —
 * this page just reflects it rather than duplicating the check.
 */

interface BackupSnapshot {
  id: string;
  sequence: number;
  status: string;
  snapshot_kind: string;
  schema_version: string | null;
  app_version: string | null;
  postgres_size_bytes: number | null;
  storage_size_bytes: number | null;
  storage_bytes_total: number | null;
  tenants_count: number | null;
  clients_count: number | null;
  documents_count: number | null;
  storage_objects_count: number | null;
  trigger_source: string;
  error_message: string | null;
  downloaded_at: string | null;
  last_drill_at: string | null;
  last_drill_ok: boolean | null;
  created_at: string;
  completed_at: string | null;
}

interface BackupDevice {
  id: string;
  name: string;
  platform: string | null;
  app_version: string | null;
  status: "active" | "revoked";
  last_seen_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

function bytes(n: number | null): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export default function BackupsAdminPage() {
  const toast = useToast();
  const snapshots = useApi<BackupSnapshot[]>("/admin/backups");
  const devices = useApi<BackupDevice[]>("/admin/devices");
  const trigger = useAction();
  const retention = useAction();
  const revoke = useAction();

  const forbidden = snapshots.error?.status === 403 || devices.error?.status === 403;

  if (forbidden) {
    return (
      <EmptyState
        icon={<ShieldOff className="size-6" />}
        title="Superadmin access required"
        description="Backup and disaster-recovery data is restricted to the platform superadmin role."
      />
    );
  }

  const runBackupNow = () =>
    trigger.run(async () => {
      const result = await post<{ status: string; sequence: number }>("/admin/backups/run");
      toast.success(`Backup ${result.status}`, `Snapshot #${result.sequence}`);
      await snapshots.reload();
    });

  const runRetentionNow = () =>
    retention.run(async () => {
      const result = await post<{ pruned: unknown[]; skipped: unknown[]; kept: number }>(
        "/admin/backups/retention/run",
      );
      toast.info(
        "Retention complete",
        `Kept ${result.kept}, pruned ${result.pruned.length}, skipped ${result.skipped.length}`,
      );
      await snapshots.reload();
    });

  const revokeDevice = (id: string, name: string) =>
    revoke.run(async () => {
      await post(`/admin/devices/${id}/revoke`);
      toast.success("Device revoked", `${name} can no longer pull or acknowledge backups.`);
      await devices.reload();
    });

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[1.6rem] font-bold tracking-tight text-ink">
            Backup &amp; Disaster Recovery
          </h1>
          <p className="mt-0.5 text-[14px] text-muted">
            Versioned, checksummed snapshots synced to registered desktop backup devices. See{" "}
            <code className="rounded bg-surface-2 px-1 py-0.5 text-[12.5px]">BACKUP_ARCHITECTURE.md</code>{" "}
            for the full design.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<RefreshCw className="size-4" />} loading={retention.pending} onClick={runRetentionNow}>
            Run retention
          </Button>
          <Button icon={<HardDrive className="size-4" />} loading={trigger.pending} onClick={runBackupNow}>
            Backup now
          </Button>
        </div>
      </div>

      {trigger.error ? (
        <p role="alert" className="mb-4 flex items-center gap-2 text-[13px] font-medium text-danger">
          <AlertTriangle className="size-4" /> {trigger.error}
        </p>
      ) : null}

      <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">Snapshots</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            Newest first. &quot;Verified&quot; means this database&apos;s own recorded checksum still
            matches the manifest object in storage — see admin_backups.py&apos;s get_manifest.
          </p>
        </div>
        {snapshots.isLoading ? (
          <LoadingBlock label="Loading snapshots…" />
        ) : !snapshots.data?.length ? (
          <EmptyState title="No snapshots yet" description="Trigger the first one with Backup now." />
        ) : (
          <div>
            <Table>
              <thead>
                <tr>
                  <TH>#</TH>
                  <TH>Status</TH>
                  <TH>Kind</TH>
                  <TH className="text-right">Postgres</TH>
                  <TH className="text-right">Storage</TH>
                  <TH className="text-right">Tenants</TH>
                  <TH className="text-right">Clients</TH>
                  <TH className="text-right">Docs</TH>
                  <TH>Drill</TH>
                  <TH>Created</TH>
                </tr>
              </thead>
              <tbody>
                {snapshots.data.map((snap) => (
                  <tr key={snap.id} className="border-b border-line last:border-b-0">
                    <TD className="font-mono text-[12px]">#{snap.sequence}</TD>
                    <TD>
                      <Badge tone={snap.status === "ready" ? "success" : snap.status === "failed" ? "danger" : "warn"}>
                        {snap.status}
                      </Badge>
                    </TD>
                    <TD>{snap.snapshot_kind}</TD>
                    <TD className="text-right tabular-nums">{bytes(snap.postgres_size_bytes)}</TD>
                    <TD className="text-right tabular-nums">{bytes(snap.storage_size_bytes)}</TD>
                    <TD className="text-right tabular-nums">{snap.tenants_count ?? "—"}</TD>
                    <TD className="text-right tabular-nums">{snap.clients_count ?? "—"}</TD>
                    <TD className="text-right tabular-nums">{snap.documents_count ?? "—"}</TD>
                    <TD>
                      {snap.last_drill_at ? (
                        <Badge tone={snap.last_drill_ok ? "success" : "danger"}>
                          {snap.last_drill_ok ? "Passed" : "Failed"}
                        </Badge>
                      ) : (
                        <span className="text-[12px] text-muted">Not drilled</span>
                      )}
                    </TD>
                    <TD className="text-[12px] text-muted">{formatDateTime(snap.created_at)}</TD>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">Backup devices</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            Registered desktop backup clients. Revoking one blocks it immediately, even if it still
            holds a valid session — see the stolen-laptop scenario in SECURITY.md.
          </p>
        </div>
        {devices.isLoading ? (
          <LoadingBlock label="Loading devices…" />
        ) : !devices.data?.length ? (
          <EmptyState
            icon={<Laptop className="size-6" />}
            title="No devices registered"
            description="A device registers itself the first time the desktop backup app signs in."
          />
        ) : (
          <div>
            <Table>
              <thead>
                <tr>
                  <TH>Name</TH>
                  <TH>Platform</TH>
                  <TH>Version</TH>
                  <TH>Status</TH>
                  <TH>Last seen</TH>
                  <TH>Registered</TH>
                  <TH />
                </tr>
              </thead>
              <tbody>
                {devices.data.map((device) => (
                  <tr key={device.id} className="border-b border-line last:border-b-0">
                    <TD className="font-medium text-ink">{device.name}</TD>
                    <TD>{device.platform ?? "—"}</TD>
                    <TD className="font-mono text-[12px]">{device.app_version ?? "—"}</TD>
                    <TD>
                      <Badge tone={device.status === "active" ? "success" : "danger"}>{device.status}</Badge>
                    </TD>
                    <TD className="text-[12px] text-muted">
                      {device.last_seen_at ? formatDateTime(device.last_seen_at) : "Never"}
                    </TD>
                    <TD className="text-[12px] text-muted">{formatDateTime(device.created_at)}</TD>
                    <TD className="text-right">
                      {device.status === "active" ? (
                        <Button
                          variant="danger"
                          size="sm"
                          icon={<Trash2 className="size-3.5" />}
                          loading={revoke.pending}
                          onClick={() => revokeDevice(device.id, device.name)}
                        >
                          Revoke
                        </Button>
                      ) : null}
                    </TD>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </section>
    </>
  );
}
