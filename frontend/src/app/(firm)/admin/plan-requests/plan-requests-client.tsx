"use client";

import { Ban, Check, Clock, X } from "lucide-react";
import { useState } from "react";

import { KpiTile } from "@/components/charts";
import { KpiRow } from "@/components/dashboard/page-shell";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  NativeSelect,
  Textarea,
  type Tone,
} from "@/components/ui";
import { approvePlanRequest, rejectPlanRequest } from "@/lib/admin";
import { formatDateTime } from "@/lib/format";
import { useAction, useApi } from "@/lib/hooks";
import type { PlanRequestAdmin, PlanRequestStatus } from "@/lib/types";

/** Suggested seat caps per plan tier — mirrors backend/app/plans.py's
 * PLAN_CATALOG. Kept in sync by hand rather than fetched: this is only a
 * prefill hint for the approve dialog below, which the superadmin can always
 * override before confirming, so a stale duplicate here is never a
 * correctness problem, just a slightly-off suggestion. */
const SUGGESTED_CAPS: Record<string, { max_clients: number | null; max_staff: number | null }> = {
  trial: { max_clients: 10, max_staff: 2 },
  starter: { max_clients: 25, max_staff: 3 },
  growth: { max_clients: 100, max_staff: 10 },
  pro: { max_clients: 500, max_staff: 25 },
  enterprise: { max_clients: null, max_staff: null },
};

const STATUS_TONE: Record<PlanRequestStatus, Tone> = {
  pending: "warn",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
};

export function PlanRequestsClient() {
  const [statusFilter, setStatusFilter] = useState<"all" | PlanRequestStatus>("pending");
  const requests = useApi<PlanRequestAdmin[]>(
    statusFilter === "all" ? "/admin/plan-requests" : `/admin/plan-requests?status=${statusFilter}`,
    [statusFilter],
  );
  const mutate = useAction();

  const [approving, setApproving] = useState<PlanRequestAdmin | null>(null);
  const [rejecting, setRejecting] = useState<PlanRequestAdmin | null>(null);
  const [maxClients, setMaxClients] = useState("");
  const [maxUsers, setMaxUsers] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  if (requests.error?.status === 403) {
    return (
      <EmptyState
        icon={<Ban className="size-6" />}
        title="Superadmin access required"
        description="Plan-change requests are restricted to the platform superadmin role."
      />
    );
  }
  if (requests.error) {
    return (
      <EmptyState
        title="Couldn't load requests"
        description="Something went wrong reaching the API. Please try again."
        action={
          <Button variant="secondary" onClick={() => requests.reload()}>
            Try again
          </Button>
        }
      />
    );
  }

  const pendingCount = (requests.data ?? []).filter((r) => r.status === "pending").length;

  const openApprove = (row: PlanRequestAdmin) => {
    if (row.requested_plan === "custom") {
      // A custom request carries the firm's own asked-for numbers; prefill from
      // those rather than a catalog suggestion. The superadmin can still adjust.
      setMaxClients(row.custom_clients != null ? String(row.custom_clients) : "");
      setMaxUsers(row.custom_seats != null ? String(row.custom_seats) : "");
    } else {
      const suggested = SUGGESTED_CAPS[row.requested_plan];
      setMaxClients(suggested?.max_clients != null ? String(suggested.max_clients) : "");
      setMaxUsers(suggested?.max_staff != null ? String(suggested.max_staff) : "");
    }
    setFormError(null);
    setApproving(row);
  };

  const confirmApprove = () =>
    mutate.run(async () => {
      if (!approving) return;
      setFormError(null);
      try {
        await approvePlanRequest(
          approving.id,
          maxClients.trim() === "" ? null : Number(maxClients),
          maxUsers.trim() === "" ? null : Number(maxUsers),
        );
      } catch (err) {
        setFormError(err instanceof Error ? err.message : String(err));
        return;
      }
      setApproving(null);
      await requests.reload();
    });

  const confirmReject = () =>
    mutate.run(async () => {
      if (!rejecting) return;
      await rejectPlanRequest(rejecting.id, rejectNote.trim() || undefined);
      setRejecting(null);
      setRejectNote("");
      await requests.reload();
    });

  return (
    <>
      <KpiRow>
        <KpiTile tone="amber" value={String(pendingCount)} label="Pending requests" icon={<Clock className="size-5" />} />
      </KpiRow>

      <section className="mt-6 rounded-xl border border-line bg-surface shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Requests</h2>
            <p className="mt-0.5 text-[13px] text-muted">Every firm&apos;s plan-change requests</p>
          </div>
          <NativeSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="h-9 w-40"
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
            <option value="all">All statuses</option>
          </NativeSelect>
        </div>

        {requests.isLoading ? (
          <LoadingBlock label="Loading requests…" />
        ) : !requests.data?.length ? (
          <EmptyState title="No requests" description="Nothing matches this filter." />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-line text-[11.5px] tracking-wide text-muted uppercase">
                  <th className="px-5 py-2.5 text-left font-semibold">Firm</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Change</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Note</th>
                  <th className="px-5 py-2.5 text-center font-semibold">Status</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Requested</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.data.map((row) => (
                  <tr key={row.id} className="border-b border-line last:border-b-0">
                    <td className="px-5 py-3 font-medium text-ink">{row.tenant_name}</td>
                    <td className="px-5 py-3 text-ink-soft">
                      <span className="capitalize">{row.current_plan}</span> →{" "}
                      {row.requested_plan === "custom" ? (
                        <span className="font-medium text-ink">
                          Custom · {row.custom_clients} clients / {row.custom_seats} staff
                        </span>
                      ) : (
                        <span className="font-medium capitalize text-ink">{row.requested_plan}</span>
                      )}
                    </td>
                    <td className="max-w-64 px-5 py-3 text-muted">
                      <div className="flex items-center gap-2">
                        <span className="truncate">{row.note ?? "—"}</span>
                        {row.attachment ? (
                          <button
                            type="button"
                            onClick={() => setViewingImage(row.attachment)}
                            className="shrink-0"
                            title="View attachment"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={row.attachment}
                              alt="Attachment"
                              className="size-8 rounded border border-line object-cover transition hover:opacity-80"
                            />
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted">
                      {row.created_at ? formatDateTime(row.created_at) : "—"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {row.status === "pending" ? (
                        <span className="inline-flex gap-1.5">
                          <Button size="sm" variant="secondary" onClick={() => openApprove(row)}>
                            Approve
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setRejecting(row)}>
                            Decline
                          </Button>
                        </span>
                      ) : (
                        <span className="text-muted">
                          {row.resolved_at ? formatDateTime(row.resolved_at) : "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {approving ? (
        <Modal
          open
          onClose={() => setApproving(null)}
          title={`Approve ${approving.tenant_name}'s move to ${
            approving.requested_plan === "custom" ? "a custom plan" : approving.requested_plan
          }`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setApproving(null)} disabled={mutate.pending}>
                Cancel
              </Button>
              <Button icon={<Check className="size-4" />} loading={mutate.pending} onClick={() => void confirmApprove()}>
                Approve & apply
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            {formError ? <Alert tone="danger">{formError}</Alert> : null}
            {approving.requested_plan === "custom" ? (
              <Alert tone="info">
                {approving.tenant_name} asked for a custom plan: {approving.custom_clients} clients and{" "}
                {approving.custom_seats} staff seats. The fields below are prefilled from that — adjust before
                approving.
              </Alert>
            ) : null}
            <p className="text-[13.5px] text-ink-soft">
              Confirm the seat caps this firm will have on the{" "}
              {approving.requested_plan === "custom" ? "custom" : approving.requested_plan} plan. Leave a field
              blank for unlimited.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Max clients" hint="Blank = unlimited">
                <Input
                  type="number"
                  min="0"
                  value={maxClients}
                  onChange={(e) => setMaxClients(e.target.value)}
                  placeholder="Unlimited"
                />
              </Field>
              <Field label="Max staff" hint="Blank = unlimited">
                <Input
                  type="number"
                  min="0"
                  value={maxUsers}
                  onChange={(e) => setMaxUsers(e.target.value)}
                  placeholder="Unlimited"
                />
              </Field>
            </div>
            {approving.note ? (
              <Field label="Their note">
                <p className="rounded-lg bg-surface-2 p-3 text-[13px] text-ink-soft">{approving.note}</p>
              </Field>
            ) : null}
            {approving.attachment ? (
              <div>
                <p className="mb-1.5 text-[13px] font-medium text-ink">Attachment</p>
                <button type="button" onClick={() => setViewingImage(approving.attachment)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={approving.attachment}
                    alt="Request attachment"
                    className="max-h-48 rounded-lg border border-line object-contain transition hover:opacity-90"
                  />
                </button>
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}

      <Modal
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title="Decline plan change request"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejecting(null)} disabled={mutate.pending}>
              Cancel
            </Button>
            <Button variant="danger" icon={<X className="size-4" />} loading={mutate.pending} onClick={() => void confirmReject()}>
              Decline
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-[13.5px] text-ink-soft">
            {rejecting ? `${rejecting.tenant_name} will see this request marked declined.` : ""}
          </p>
          <Field label="Note to the firm" hint="Optional">
            <Textarea rows={3} value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="Why this isn't happening…" />
          </Field>
        </div>
      </Modal>

      <Modal open={viewingImage !== null} onClose={() => setViewingImage(null)} title="Request attachment">
        {viewingImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={viewingImage} alt="Request attachment" className="mx-auto max-h-[70vh] w-auto rounded-lg" />
        ) : null}
      </Modal>
    </>
  );
}
