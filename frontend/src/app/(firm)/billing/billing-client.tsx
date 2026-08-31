"use client";

import { ArrowDown, ArrowUp, Ban, Check, Clock, History, ImagePlus, Paperclip, Sparkles, X } from "lucide-react";
import { useRef, useState } from "react";

import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Textarea,
  type Tone,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { cancelPlanRequest, requestPlanChange, requestRenewal, type PlanChangeInput } from "@/lib/billing";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime, formatMoney, parseDate } from "@/lib/format";
import { useAction, useApi } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { BillingOverview, PlanRequest, PlanRequestStatus, PlanTier } from "@/lib/types";

const cap = (n: number | null) => (n === null ? "Unlimited" : String(n));

/** Whole days from today to an ISO datetime (negative = past), or null if unset. */
function daysUntil(value: string | null): number | null {
  const date = parseDate(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86_400_000);
}

/** Card price line: Free / $49/mo / Custom pricing. */
const priceLabel = (price: number | null) =>
  price === null ? "Custom pricing" : price === 0 ? "Free" : `${formatMoney(price)}/mo`;

const STATUS_TONE: Record<PlanRequestStatus, Tone> = {
  pending: "warn",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
};

/** The plan the request modal is targeting: a catalog tier, or a bespoke plan. */
type RequestTarget = PlanTier | "custom" | null;

export function BillingClient() {
  const session = useSession();
  const overview = useApi<BillingOverview>("/billing/plans");
  const requests = useApi<PlanRequest[]>("/billing/requests");
  const mutate = useAction();

  const [requestTarget, setRequestTarget] = useState<RequestTarget>(null);
  const [note, setNote] = useState("");
  const [attachment, setAttachment] = useState<string | null>(null);
  const [customClients, setCustomClients] = useState("");
  const [customSeats, setCustomSeats] = useState("");
  const [cancelling, setCancelling] = useState<PlanRequest | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [renewing, setRenewing] = useState(false);
  const toast = useToast();

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

  const resetForm = () => {
    setNote("");
    setAttachment(null);
    setCustomClients("");
    setCustomSeats("");
    setFormError(null);
  };
  const openTier = (tier: PlanTier) => {
    resetForm();
    setRequestTarget(tier);
  };
  const openCustom = () => {
    resetForm();
    setRequestTarget("custom");
  };
  const closeModal = () => {
    setRequestTarget(null);
    setFormError(null);
  };

  const submitRequest = () =>
    mutate.run(async () => {
      const target = requestTarget;
      if (!target) return;
      setFormError(null);

      let payload: PlanChangeInput;
      if (target === "custom") {
        const clients = Number(customClients);
        const seats = Number(customSeats);
        if (!customClients.trim() || !customSeats.trim() || clients < 1 || seats < 1) {
          setFormError("Enter how many clients and staff seats you need (at least 1 of each).");
          return;
        }
        payload = { requested_plan: "custom", note, attachment, custom_clients: clients, custom_seats: seats };
      } else {
        payload = { requested_plan: target.key, note, attachment };
      }

      try {
        await requestPlanChange(payload);
      } catch (err) {
        setFormError(err instanceof Error ? err.message : String(err));
        return;
      }
      closeModal();
      await Promise.all([overview.refresh(), requests.reload()]);
    });

  const confirmCancel = () =>
    mutate.run(async () => {
      if (!cancelling) return;
      await cancelPlanRequest(cancelling.id);
      setCancelling(null);
      await requests.reload();
    });

  const planLabel = (r: PlanRequest) =>
    r.requested_plan === "custom" ? `Custom · ${r.custom_clients} clients / ${r.custom_seats} staff` : r.requested_plan;

  const submitRenewal = async () => {
    setRenewing(true);
    try {
      await requestRenewal();
      toast.success("Renewal request sent to your provider");
      await overview.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send the request");
    } finally {
      setRenewing(false);
    }
  };

  const planDays = daysUntil(data.plan_expires_at);
  const serviceDays = daysUntil(data.service_expires_at);
  const hasExpiry = data.plan_expires_at !== null || data.service_expires_at !== null;
  const soonestDays = [planDays, serviceDays].filter((d): d is number => d !== null).sort((a, b) => a - b)[0];
  const renewalNeeded = soonestDays !== undefined && soonestDays <= 14;

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

        {hasExpiry ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
              {data.plan_expires_at ? (
                <span className="text-muted">
                  Plan expires{" "}
                  <span className={cn("font-medium", planDays !== null && planDays <= 14 ? "text-danger" : "text-ink")}>
                    {formatDate(data.plan_expires_at)}
                  </span>
                </span>
              ) : null}
              {data.service_expires_at ? (
                <span className="text-muted">
                  Server/domain expires{" "}
                  <span className={cn("font-medium", serviceDays !== null && serviceDays <= 14 ? "text-danger" : "text-ink")}>
                    {formatDate(data.service_expires_at)}
                  </span>
                </span>
              ) : null}
            </div>
            {canManage ? (
              <Button size="sm" variant="secondary" loading={renewing} onClick={() => void submitRenewal()}>
                Request renewal
              </Button>
            ) : null}
          </div>
        ) : null}
      </Card>

      {renewalNeeded ? (
        <Alert tone={soonestDays !== undefined && soonestDays < 0 ? "danger" : "warn"} className="mt-4">
          {soonestDays !== undefined && soonestDays < 0
            ? "Your plan or server/domain access has lapsed — request a renewal now to restore your services."
            : "Your plan or server/domain access is expiring soon. Request a renewal to avoid any interruption."}
        </Alert>
      ) : null}

      {pendingRequest ? (
        <Alert tone="warn" className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              A request to move to{" "}
              <span className="font-semibold">
                {pendingRequest.requested_plan === "custom" ? (
                  "a custom plan"
                ) : (
                  <span className="capitalize">{pendingRequest.requested_plan}</span>
                )}
              </span>{" "}
              is waiting on your provider.
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
                <p className="mt-1 text-[18px] font-semibold text-ink">{priceLabel(tier.price)}</p>
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
                    onClick={() => openTier(tier)}
                  >
                    Request {direction ?? "change"}
                  </Button>
                ) : null}
              </Card>
            );
          })}

          {canManage ? (
            <Card className="border-dashed p-5">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-brand" />
                <h4 className="text-[15px] font-semibold text-ink">Custom plan</h4>
              </div>
              <p className="mt-1 text-[18px] font-semibold text-ink">Priced with your provider</p>
              <p className="mt-1 text-[13px] text-muted">
                None of the packages fit? Ask for a tailored plan with the exact number of clients and staff
                seats you need.
              </p>
              <Button
                className="mt-4 w-full"
                variant="secondary"
                size="sm"
                disabled={Boolean(pendingRequest)}
                icon={<Sparkles className="size-4" />}
                onClick={openCustom}
              >
                Request custom plan
              </Button>
            </Card>
          ) : null}
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
                  <span className="font-medium text-ink">{planLabel(r)}</span>
                  {r.note ? <span className="ml-2 text-muted">&ldquo;{r.note}&rdquo;</span> : null}
                  {r.attachment ? (
                    <Paperclip className="ml-1.5 inline size-3.5 align-text-bottom text-muted" aria-label="Has an attachment" />
                  ) : null}
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

      {requestTarget ? (
        <Modal
          open
          onClose={closeModal}
          title={
            requestTarget === "custom"
              ? "Request a custom plan"
              : `Request the ${requestTarget.label} package`
          }
          footer={
            <>
              <Button variant="secondary" onClick={closeModal} disabled={mutate.pending}>
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
            {requestTarget === "custom" ? (
              <>
                <p className="text-[13.5px] text-ink-soft">
                  Tell your provider the sizing you need. They&apos;ll confirm the price and set the final caps
                  when they approve it.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Clients needed" hint="Client records">
                    <Input
                      type="number"
                      min="1"
                      value={customClients}
                      onChange={(e) => setCustomClients(e.target.value)}
                      placeholder="e.g. 250"
                    />
                  </Field>
                  <Field label="Staff seats needed" hint="Team logins">
                    <Input
                      type="number"
                      min="1"
                      value={customSeats}
                      onChange={(e) => setCustomSeats(e.target.value)}
                      placeholder="e.g. 15"
                    />
                  </Field>
                </div>
              </>
            ) : (
              <p className="text-[13.5px] text-ink-soft">
                Your provider will review this and set the final seat counts when they approve it.
              </p>
            )}
            <Field label="Note to your provider" hint="Optional">
              <Textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why you need this change…"
              />
            </Field>
            <Field label="Attach an image" hint="Optional — a screenshot, quote or anything that helps">
              <AttachmentField value={attachment} onChange={setAttachment} />
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

/** Reads a chosen image to a base64 data URL (like the firm-logo uploader in
 * settings) — no file-storage infra, capped at 3 MB. */
function AttachmentField({ value, onChange }: { value: string | null; onChange: (next: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const readFile = (file: File | undefined | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setError("Image must be under 3 MB.");
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => readFile(e.target.files?.[0])}
      />
      {value ? (
        <div className="flex items-center gap-3 rounded-lg border border-line p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Attachment preview" className="size-14 rounded object-cover" />
          <span className="flex-1 text-[13px] text-ink-soft">Image attached</span>
          <Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={() => onChange(null)}>
            Remove
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line p-4 text-[13px] text-muted transition hover:border-brand hover:text-ink"
        >
          <ImagePlus className="size-4" />
          Click to attach an image
        </button>
      )}
      {error ? <p className="mt-1 text-[12px] text-danger">{error}</p> : null}
    </div>
  );
}
