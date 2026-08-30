"use client";

import { ArrowDown, ArrowUp, Ban, Check, Clock, History, X } from "lucide-react";
import { useState } from "react";

import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  LoadingBlock,
  Modal,
  Textarea,
  type Tone,
} from "@/components/ui";
import { cancelPlanRequest, requestPlanChange } from "@/lib/billing";
import { formatDateTime } from "@/lib/format";
import { useAction, useApi } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { BillingOverview, PlanRequest, PlanRequestStatus, PlanTier } from "@/lib/types";

const cap = (n: number | null) => (n === null ? "Unlimited" : String(n));

const STATUS_TONE: Record<PlanRequestStatus, Tone> = {
  pending: "warn",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
};

export function BillingClient() {
  const session = useSession();
  const overview = useApi<BillingOverview>("/billing/plans");
  const requests = useApi<PlanRequest[]>("/billing/requests");
  const mutate = useAction();

  const [targetTier, setTargetTier] = useState<PlanTier | null>(null);
  const [note, setNote] = useState("");
  const [cancelling, setCancelling] = useState<PlanRequest | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  if (overview.error?.status === 403) {
    return (
      <EmptyState
        icon={<Ban className="size-6" />}
        title="No access"
        description="Billing isn't available for this login."
      />
    );
  }
  if (overview.error) {
    return (
      <EmptyState
        title="Couldn't load your plan"
        description="Something went wrong reaching the API. Please try again."
        action={
          <Button variant="secondary" onClick={() => overview.reload()}>
            Try again
          </Button>
        }
      />
    );
  }
  if (overview.isLoading || !overview.data) {
    return <LoadingBlock label="Loading your plan…" />;
  }

  const data = overview.data;
  const catalog = data.catalog;
  const currentIndex = catalog.findIndex((tier) => tier.key === data.current_plan);
  const pastRequests = requests.data ?? [];
  const pendingRequest = pastRequests.find((r) => r.status === "pending");
  const canManage = session.isAdmin;

  const submitRequest = () =>
    mutate.run(async () => {
      if (!targetTier) return;
      setFormError(null);
      try {
        await requestPlanChange(targetTier.key, note.trim() || undefined);
      } catch (err) {
        setFormError(err instanceof Error ? err.message : String(err));
        return;
      }
      setTargetTier(null);
      setNote("");
      await Promise.all([overview.refresh(), requests.reload()]);
    });

  const confirmCancel = () =>
    mutate.run(async () => {
      if (!cancelling) return;
      await cancelPlanRequest(cancelling.id);
      setCancelling(null);
      await requests.reload();
    });

  return (
    <>
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[12px] font-medium text-muted uppercase">Active package</p>
            <h2 className="mt-0.5 text-xl font-semibold capitalize text-ink">{data.current_plan}</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <UsageStat label="staff seats" used={data.staff_used} capValue={data.max_users} />
            <UsageStat label="client seats" used={data.client_used} capValue={data.max_clients} />
          </div>
        </div>
      </Card>

      {pendingRequest ? (
        <Alert tone="warn" className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              A request to move to{" "}
              <span className="font-semibold capitalize">{pendingRequest.requested_plan}</span> is waiting on
              your provider.
            </span>
            {canManage ? (
              <Button size="sm" variant="secondary" onClick={() => setCancelling(pendingRequest)}>
                Cancel request
              </Button>
            ) : null}
          </div>
        </Alert>
      ) : null}

      <section className="mt-6">
        <h3 className="text-[15px] font-semibold text-ink">Available packages</h3>
        <p className="mt-0.5 text-[13px] text-muted">
          Pick a package to request. Your provider reviews and applies every change — nothing switches
          automatically.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {catalog.map((tier, index) => {
            const isCurrent = tier.key === data.current_plan;
            const direction = index > currentIndex ? "upgrade" : index < currentIndex ? "downgrade" : null;
            return (
              <Card key={tier.key} className={isCurrent ? "border-brand p-5" : "p-5"}>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-[15px] font-semibold text-ink">{tier.label}</h4>
                  {isCurrent ? <Badge tone="brand">Current</Badge> : null}
                </div>
                <p className="mt-1 text-[13px] text-muted">{tier.blurb}</p>
                <dl className="mt-3 space-y-1 text-[13px] text-ink-soft">
                  <div className="flex justify-between">
                    <dt>Clients</dt>
                    <dd className="font-medium tabular-nums">{cap(tier.max_clients)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Staff</dt>
                    <dd className="font-medium tabular-nums">{cap(tier.max_staff)}</dd>
                  </div>
                </dl>
                {!isCurrent && canManage ? (
                  <Button
                    className="mt-4 w-full"
                    variant="secondary"
                    size="sm"
                    disabled={Boolean(pendingRequest)}
                    icon={
                      direction === "upgrade" ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />
                    }
                    onClick={() => setTargetTier(tier)}
                  >
                    Request {direction ?? "change"}
                  </Button>
                ) : null}
              </Card>
            );
          })}
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-line bg-surface shadow-card">
        <div className="flex items-center gap-2 border-b border-line px-5 py-4">
          <History className="size-4 text-muted" />
          <h3 className="text-[15px] font-semibold text-ink">Request history</h3>
        </div>
        {requests.isLoading ? (
          <LoadingBlock />
        ) : pastRequests.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-muted">No plan changes requested yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {pastRequests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-[13.5px]">
                <span className="text-ink-soft">
                  <span className="capitalize">{r.current_plan}</span> →{" "}
                  <span className="font-medium capitalize text-ink">{r.requested_plan}</span>
                  {r.note ? <span className="ml-2 text-muted">&ldquo;{r.note}&rdquo;</span> : null}
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                  <span className="text-muted">{r.created_at ? formatDateTime(r.created_at) : ""}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {targetTier ? (
        <Modal
          open
          onClose={() => {
            setTargetTier(null);
            setFormError(null);
          }}
          title={`Request the ${targetTier.label} package`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setTargetTier(null)} disabled={mutate.pending}>
                Cancel
              </Button>
              <Button icon={<Check className="size-4" />} loading={mutate.pending} onClick={() => void submitRequest()}>
                Send request
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            {formError ? <Alert tone="danger">{formError}</Alert> : null}
            <p className="text-[13.5px] text-ink-soft">
              Your provider will review this and set the final seat counts when they approve it.
            </p>
            <Field label="Note to your provider" hint="Optional">
              <Textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why you need this change…"
              />
            </Field>
          </div>
        </Modal>
      ) : null}

      <Modal
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        title="Cancel plan change request"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelling(null)}>
              Keep request
            </Button>
            <Button
              variant="danger"
              icon={<X className="size-4" />}
              loading={mutate.pending}
              onClick={() => void confirmCancel()}
            >
              Cancel request
            </Button>
          </>
        }
      >
        <p className="text-[13.5px] text-ink-soft">Your provider will no longer see this request pending.</p>
      </Modal>
    </>
  );
}

function UsageStat({ label, used, capValue }: { label: string; used: number; capValue: number | null }) {
  const atCap = capValue !== null && used >= capValue;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium ${
        atCap ? "border-danger/30 bg-danger-soft text-danger" : "border-line bg-surface-2 text-ink-soft"
      }`}
    >
      <Clock className="size-3.5" />
      {used}/{cap(capValue)} {label}
    </span>
  );
}
