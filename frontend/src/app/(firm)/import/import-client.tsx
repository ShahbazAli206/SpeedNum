"use client";

/**
 * Bulk import — clients and staff/portal logins.
 *
 * This page used to render a hardcoded `PREVIEW_ROWS` constant and toast
 * "Import not connected" at the end, while `backend/app/routers/imports.py`
 * already exposed the whole flow. It now drives the real endpoints:
 *
 *   POST /import/clients/preview   multipart, validates without writing
 *   POST /import/clients/commit    { mapping, rows, update_existing }
 *   POST /import/users/preview     multipart, validates without creating logins
 *   POST /import/users/commit      [UserImportRow]  → provisions + emails
 *
 * The file is parsed server-side (openpyxl for xlsx, csv.Sniffer otherwise), so
 * there is no spreadsheet parser in the browser bundle and one column-alias
 * table serves both halves.
 *
 * Rows the server flagged are excluded from the commit rather than silently
 * repaired — an import that quietly invents a province is worse than one that
 * tells you row 14 is wrong.
 */

import {
  Building2,
  CircleCheck,
  Download,
  KeyRound,
  Tag,
  TriangleAlert,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { DashboardHeader } from "@/components/dashboard/page-shell";
import { SpreadsheetDrop, downloadTemplate } from "@/components/dashboard/spreadsheet-drop";
import { useToast } from "@/components/toast";
import { Alert, Button, Checkbox } from "@/components/ui";
import { ApiError, api, post } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  CLIENT_COLUMNS,
  CLIENT_EXAMPLE,
  SERVICE_COLUMNS,
  SERVICE_EXAMPLE,
  TENANT_COLUMNS,
  TENANT_EXAMPLE,
  USER_COLUMNS,
  USER_EXAMPLE,
} from "@/lib/import-templates";
import { useSession } from "@/lib/session";
import type { ImportPreview, ImportResult, TenantImportResult, UserImportResult } from "@/lib/types";

type Mode = "clients" | "users" | "services" | "tenants";

const MODES: { value: Mode; label: string; icon: React.ReactNode; blurb: string; superadminOnly?: boolean }[] = [
  {
    value: "clients",
    label: "Clients",
    icon: <Users className="size-4" />,
    blurb: "Add or update client records in bulk.",
  },
  {
    value: "users",
    label: "Users & accountants",
    icon: <UserPlus className="size-4" />,
    blurb: "Create logins and email each person their credentials.",
  },
  {
    value: "services",
    label: "Services",
    icon: <Tag className="size-4" />,
    blurb: "Add or update the services catalogue in bulk.",
  },
  {
    value: "tenants",
    label: "Firms",
    icon: <Building2 className="size-4" />,
    blurb: "Provision several firms and their first admin login at once.",
    superadminOnly: true,
  },
];

function reason(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function ImportClient() {
  const toast = useToast();
  const session = useSession();
  const isSuperadmin = session.me?.profile?.is_superadmin ?? false;
  const visibleModes = MODES.filter((option) => !option.superadminOnly || isSuperadmin);

  // Lets a page's own "Import" button land the operator on the right tab
  // (e.g. the Accountants page links to /import?mode=users) instead of
  // always opening on Clients and making them hunt for the right one.
  // Access control is enforced server-side (SuperadminDep on the tenant
  // importer), so an invalid or unauthorized value just falls back to
  // Clients rather than needing to be checked here.
  const requestedMode = useSearchParams().get("mode");
  const initialMode = MODES.some((option) => option.value === requestedMode)
    ? (requestedMode as Mode)
    : "clients";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const [clientResult, setClientResult] = useState<ImportResult | null>(null);
  const [userResult, setUserResult] = useState<UserImportResult | null>(null);
  const [serviceResult, setServiceResult] = useState<ImportResult | null>(null);
  const [tenantResult, setTenantResult] = useState<TenantImportResult | null>(null);

  const columns =
    mode === "clients" ? CLIENT_COLUMNS
    : mode === "users" ? USER_COLUMNS
    : mode === "services" ? SERVICE_COLUMNS
    : TENANT_COLUMNS;

  const validRows = preview?.rows.filter((row) => row.errors.length === 0) ?? [];
  const invalidRows = preview?.rows.filter((row) => row.errors.length > 0) ?? [];
  /** Rows past the server's 100-row preview cap that will still be committed. */
  const beyondPreview = preview ? Math.max(0, preview.total_rows - preview.rows.length) : 0;

  const reset = (next: Mode) => {
    setMode(next);
    setFile(null);
    setPreview(null);
    setFailure(null);
    setClientResult(null);
    setUserResult(null);
    setServiceResult(null);
    setTenantResult(null);
  };

  const upload = async (picked: File) => {
    setFile(picked);
    setPreview(null);
    setFailure(null);
    setClientResult(null);
    setUserResult(null);
    setServiceResult(null);
    setTenantResult(null);
    setBusy(true);

    const body = new FormData();
    body.append("file", picked);

    try {
      setPreview(
        await api<ImportPreview>(`/import/${mode}/preview`, { method: "POST", body }),
      );
    } catch (error) {
      const detail =
        error instanceof ApiError && error.status === 0
          ? "The import API is unreachable. Set NEXT_PUBLIC_API_URL and make sure the backend is running."
          : reason(error, "The file could not be read.");
      setFailure(detail);
      toast.error("Could not read that file", detail);
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!preview || validRows.length === 0) return;
    setCommitting(true);
    setFailure(null);

    try {
      if (mode === "clients" || mode === "services") {
        const result = await post<ImportResult>(`/import/${mode}/commit`, {
          mapping: preview.detected_mapping,
          rows: validRows.map((row) => row.data),
          update_existing: updateExisting,
        });
        if (mode === "clients") setClientResult(result);
        else setServiceResult(result);
        toast.success(
          `${result.created + result.updated} ${mode === "clients" ? "client" : "service"}${result.created + result.updated === 1 ? "" : "s"} imported`,
          `${result.created} created, ${result.updated} updated, ${result.failed} failed.`,
        );
      } else if (mode === "users") {
        const result = await post<UserImportResult>(
          `/import/users/commit?send_email=${sendEmail}`,
          validRows.map((row) => row.data),
        );
        setUserResult(result);
        toast.success(
          `${result.created} account${result.created === 1 ? "" : "s"} created`,
          result.emailed > 0
            ? `${result.emailed} credential email${result.emailed === 1 ? "" : "s"} sent.`
            : "Email delivery isn't configured — copy the passwords below.",
        );
      } else {
        const result = await post<TenantImportResult>(
          "/import/tenants/commit",
          validRows.map((row) => ({ ...row.data, send_email: sendEmail })),
        );
        setTenantResult(result);
        toast.success(
          `${result.created} firm${result.created === 1 ? "" : "s"} created`,
          result.emailed > 0
            ? `${result.emailed} credential email${result.emailed === 1 ? "" : "s"} sent.`
            : "Email delivery isn't configured — copy the passwords below.",
        );
      }
      setPreview(null);
      setFile(null);
    } catch (error) {
      const detail = reason(error, "The import could not be committed.");
      setFailure(detail);
      toast.error("Import failed", detail);
    } finally {
      setCommitting(false);
    }
  };

  return (
    <>
      <DashboardHeader
        title="Bulk import"
        subtitle="Template-driven CSV/XLSX import — off the spreadsheet in an afternoon, never locked in"
        actions={
          <Button
            variant="secondary"
            icon={<Download className="size-4" />}
            onClick={() => {
              const stem = {
                clients: "spidnums-client-import",
                users: "spidnums-user-import",
                services: "spidnums-service-import",
                tenants: "spidnums-firm-import",
              }[mode];
              const example = {
                clients: CLIENT_EXAMPLE,
                users: USER_EXAMPLE,
                services: SERVICE_EXAMPLE,
                tenants: TENANT_EXAMPLE,
              }[mode];
              downloadTemplate(stem, columns.map((column) => column.column), example);
              toast.success("Template downloaded", "Fill it in, then upload it here.");
            }}
          >
            Download template
          </Button>
        }
      />

      {/* Which importer */}
      <div className="mb-5 inline-flex rounded-lg border border-line bg-surface p-0.5">
        {visibleModes.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={mode === option.value}
            onClick={() => reset(option.value)}
            className={cn(
              "inline-flex items-center gap-2 rounded-[7px] px-3.5 py-1.5 text-[13px] font-medium transition",
              mode === option.value
                ? "bg-brand-soft text-brand-ink"
                : "text-muted hover:text-ink",
            )}
          >
            {option.icon}
            {option.label}
          </button>
        ))}
      </div>

      <p className="mb-5 text-[13.5px] text-muted">
        {visibleModes.find((option) => option.value === mode)?.blurb}
      </p>

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-5">
          {/* Step 1 — upload */}
          <Step number={1} title="Upload your file" description="CSV, XLSX or XLSM. Nothing is written yet.">
            <SpreadsheetDrop
              onFile={(picked) => void upload(picked)}
              busy={busy}
              label={file ? file.name : "Drop your CSV or XLSX here"}
              hint={
                file && !busy
                  ? "Drop another file to replace it"
                  : undefined
              }
            />
            {failure ? (
              <Alert tone="danger" title="That file was rejected" className="mt-3">
                {failure}
              </Alert>
            ) : null}
          </Step>

          {/* Step 2 — review */}
          {preview ? (
            <Step
              number={2}
              title="Review what was found"
              description={`${preview.total_rows} row${preview.total_rows === 1 ? "" : "s"} in the file · ${preview.valid_rows} valid in the preview`}
            >
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <Stat label="Ready to import" value={validRows.length} tone="success" />
                <Stat label="Rows with errors" value={invalidRows.length} tone="danger" />
                <Stat label="Columns matched" value={Object.keys(preview.detected_mapping).length} tone="neutral" />
              </div>

              {invalidRows.length > 0 ? (
                <Alert tone="warn" title={`${invalidRows.length} row${invalidRows.length === 1 ? "" : "s"} will be skipped`} className="mb-4">
                  Only clean rows are sent. Fix these in your spreadsheet and upload it again to add them.
                </Alert>
              ) : null}

              {beyondPreview > 0 ? (
                <Alert tone="info" title={`${beyondPreview} more rows are not shown`} className="mb-4">
                  The preview covers the first {preview.rows.length} rows. Only those are committed in
                  this pass — split the file or re-upload the remainder afterwards.
                </Alert>
              ) : null}

              <div className="scroll-thin max-h-96 overflow-auto rounded-lg border border-line">
                <table className="w-full text-[12.5px]">
                  <thead className="sticky top-0 bg-surface-2">
                    <tr className="text-left text-muted">
                      <th className="px-3 py-2 font-semibold">Row</th>
                      <th className="px-3 py-2 font-semibold">
                        {mode === "clients" ? "Legal name"
                          : mode === "users" ? "Email"
                          : mode === "services" ? "Code"
                          : "Firm name"}
                      </th>
                      <th className="px-3 py-2 font-semibold">
                        {mode === "clients" ? "Province"
                          : mode === "users" ? "Name"
                          : mode === "services" ? "Name"
                          : "Admin email"}
                      </th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => {
                      const data = row.data as Record<string, unknown>;
                      const primary = String(
                        (mode === "clients" ? data.legal_name
                          : mode === "users" ? data.email
                          : mode === "services" ? data.code
                          : data.name) ?? "—",
                      );
                      const secondary = String(
                        (mode === "clients" ? data.province
                          : mode === "users" ? data.full_name
                          : mode === "services" ? data.name
                          : data.admin_email) ?? "—",
                      );
                      return (
                        <tr key={row.row} className="border-t border-line align-top">
                          <td className="px-3 py-2 tabular-nums text-muted">{row.row}</td>
                          <td className="px-3 py-2 text-ink">{primary || "—"}</td>
                          <td className="px-3 py-2 text-ink-soft">{secondary || "—"}</td>
                          <td className="px-3 py-2">
                            {row.errors.length === 0 ? (
                              <span className="inline-flex items-center gap-1 text-success">
                                <CircleCheck className="size-3.5" /> Ready
                              </span>
                            ) : (
                              <span className="inline-flex items-start gap-1 text-danger">
                                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                                <span>{row.errors.join("; ")}</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                {mode === "clients" ? (
                  <Checkbox
                    label="Update existing clients when the code or legal name matches"
                    checked={updateExisting}
                    onChange={(event) => setUpdateExisting(event.target.checked)}
                  />
                ) : mode === "services" ? (
                  <Checkbox
                    label="Update existing services when the code matches"
                    checked={updateExisting}
                    onChange={(event) => setUpdateExisting(event.target.checked)}
                  />
                ) : mode === "tenants" ? (
                  <Checkbox
                    label="Email each firm's admin their credentials"
                    checked={sendEmail}
                    onChange={(event) => setSendEmail(event.target.checked)}
                  />
                ) : (
                  <Checkbox
                    label="Email each person their credentials"
                    checked={sendEmail}
                    onChange={(event) => setSendEmail(event.target.checked)}
                  />
                )}
                <Button
                  icon={<Upload className="size-4" />}
                  onClick={() => void commit()}
                  loading={committing}
                  disabled={validRows.length === 0}
                >
                  Import {validRows.length} row{validRows.length === 1 ? "" : "s"}
                </Button>
              </div>
            </Step>
          ) : null}

          {/* Step 3 — outcome */}
          {clientResult ? (
            <Step number={3} title="Imported" description="The client book has been updated.">
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="Created" value={clientResult.created} tone="success" />
                <Stat label="Updated" value={clientResult.updated} tone="neutral" />
                <Stat label="Failed" value={clientResult.failed} tone="danger" />
              </div>
              {clientResult.errors.length > 0 ? (
                <Alert tone="warn" title="Some rows did not land" className="mt-4">
                  <ul className="list-disc space-y-0.5 pl-4">
                    {clientResult.errors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </Alert>
              ) : null}
            </Step>
          ) : null}

          {serviceResult ? (
            <Step number={3} title="Imported" description="The services catalogue has been updated.">
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="Created" value={serviceResult.created} tone="success" />
                <Stat label="Updated" value={serviceResult.updated} tone="neutral" />
                <Stat label="Failed" value={serviceResult.failed} tone="danger" />
              </div>
              {serviceResult.errors.length > 0 ? (
                <Alert tone="warn" title="Some rows did not land" className="mt-4">
                  <ul className="list-disc space-y-0.5 pl-4">
                    {serviceResult.errors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </Alert>
              ) : null}
            </Step>
          ) : null}

          {tenantResult ? (
            <Step
              number={3}
              title="Firms created"
              description="Each password below is shown once — it is never stored in plaintext."
            >
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <Stat label="Created" value={tenantResult.created} tone="success" />
                <Stat label="Emailed" value={tenantResult.emailed} tone="neutral" />
                <Stat label="Failed" value={tenantResult.failed} tone="danger" />
              </div>

              <div className="scroll-thin max-h-96 overflow-auto rounded-lg border border-line">
                <table className="w-full text-[12.5px]">
                  <thead className="sticky top-0 bg-surface-2">
                    <tr className="text-left text-muted">
                      <th className="px-3 py-2 font-semibold">Firm</th>
                      <th className="px-3 py-2 font-semibold">Temporary password</th>
                      <th className="px-3 py-2 font-semibold">Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenantResult.tenants.map((firm, index) => (
                      <tr key={`${firm.admin_email}-${index}`} className="border-t border-line">
                        <td className="px-3 py-2">
                          <span className="block text-ink">{firm.name}</span>
                          <span className="block text-[11.5px] text-muted">{firm.admin_email}</span>
                        </td>
                        <td className="px-3 py-2">
                          {firm.temp_password ? (
                            <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-ink">
                              {firm.temp_password}
                            </code>
                          ) : (
                            <span className="text-danger">{firm.error ?? "Not created"}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {firm.email_sent ? (
                            <span className="inline-flex items-center gap-1 text-success">
                              <CircleCheck className="size-3.5" /> Sent
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-warn">
                              <KeyRound className="size-3.5" /> Share manually
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {tenantResult.errors.length > 0 ? (
                <Alert tone="warn" title="Some rows did not land" className="mt-4">
                  <ul className="list-disc space-y-0.5 pl-4">
                    {tenantResult.errors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </Alert>
              ) : null}
            </Step>
          ) : null}

          {userResult ? (
            <Step
              number={3}
              title="Accounts created"
              description="Each password below is shown once — it is never stored in plaintext."
            >
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <Stat label="Created" value={userResult.created} tone="success" />
                <Stat label="Emailed" value={userResult.emailed} tone="neutral" />
                <Stat label="Failed" value={userResult.failed} tone="danger" />
              </div>

              <div className="scroll-thin max-h-96 overflow-auto rounded-lg border border-line">
                <table className="w-full text-[12.5px]">
                  <thead className="sticky top-0 bg-surface-2">
                    <tr className="text-left text-muted">
                      <th className="px-3 py-2 font-semibold">Person</th>
                      <th className="px-3 py-2 font-semibold">Temporary password</th>
                      <th className="px-3 py-2 font-semibold">Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userResult.accounts.map((account) => (
                      <tr key={account.email} className="border-t border-line">
                        <td className="px-3 py-2">
                          <span className="block text-ink">{account.full_name || account.email}</span>
                          <span className="block text-[11.5px] text-muted">{account.email}</span>
                        </td>
                        <td className="px-3 py-2">
                          {account.temp_password ? (
                            <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-ink">
                              {account.temp_password}
                            </code>
                          ) : (
                            <span className="text-danger">{account.error ?? "Not created"}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {account.email_sent ? (
                            <span className="inline-flex items-center gap-1 text-success">
                              <CircleCheck className="size-3.5" /> Sent
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-warn">
                              <KeyRound className="size-3.5" /> Share manually
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {userResult.errors.length > 0 ? (
                <Alert tone="warn" title="Some rows did not land" className="mt-4">
                  <ul className="list-disc space-y-0.5 pl-4">
                    {userResult.errors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </Alert>
              ) : null}
            </Step>
          ) : null}
        </div>

        {/* Column reference */}
        <aside className="h-fit rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-semibold text-ink">Expected columns</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              Headers are matched case-insensitively, and common aliases are recognised — you rarely
              need to rename anything.
            </p>
          </div>
          <ul className="divide-y divide-line">
            {columns.map((column) => (
              <li key={column.column} className="px-5 py-3">
                <div className="flex items-center gap-2">
                  <code className="font-mono text-[12.5px] text-ink">{column.column}</code>
                  {column.required ? (
                    <span className="rounded-full bg-danger-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-danger">
                      required
                    </span>
                  ) : null}
                </div>
                {column.note ? (
                  <p className="mt-0.5 text-[12px] text-muted">{column.note}</p>
                ) : null}
              </li>
            ))}
          </ul>
          {mode === "clients" ? (
            <p className="border-t border-line px-5 py-3 text-[12px] text-muted">
              Any other column in your file — a provincial corporation number, an internal code, anything —
              is kept as a custom field on the client record instead of being dropped.
            </p>
          ) : null}
        </aside>
      </div>
    </>
  );
}

function Step({
  number,
  title,
  description,
  children,
}: {
  number: number;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
      <div className="flex items-start gap-3 border-b border-line px-5 py-4">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-[12px] font-bold text-brand">
          {number}
        </span>
        <div>
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          <p className="mt-0.5 text-[13px] text-muted">{description}</p>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "danger" | "neutral";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3.5 py-3",
        tone === "success" && "border-transparent bg-success-soft",
        tone === "danger" && "border-transparent bg-danger-soft",
        tone === "neutral" && "border-line bg-surface-2",
      )}
    >
      <p
        className={cn(
          "text-[22px] font-bold tabular-nums",
          tone === "success" && "text-success",
          tone === "danger" && "text-danger",
          tone === "neutral" && "text-ink",
        )}
      >
        {value}
      </p>
      <p className="text-[12px] text-muted">{label}</p>
    </div>
  );
}
