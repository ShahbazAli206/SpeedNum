"use client";

import {
  Copy,
  Files,
  Plus,
  Send,
  Signature,
  Trash2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { ExportMenu } from "@/components/engagement/export-menu";
import { LetterDocument } from "@/components/engagement/letter-document";
import { SignaturePad } from "@/components/engagement/signature-pad";
import { useConfirm } from "@/components/confirm";
import { useToast } from "@/components/toast";
import { Button, Field, Input, Select } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  deleteEngagement,
  duplicateEngagement,
  firmSignEngagement,
  markEngagementSigned,
  sendEngagement,
  updateEngagement,
  voidEngagement,
} from "@/lib/engagements";
import { formatDate, formatMoney } from "@/lib/format";
import type { Client, Letter, LetterStatus, Service } from "@/lib/types";

const EDITABLE_STATES: LetterStatus[] = ["draft", "sent", "viewed", "declined"];

const STATUS_TONE: Record<LetterStatus, string> = {
  draft: "bg-surface-2 text-muted",
  sent: "bg-info-soft text-info",
  viewed: "bg-warn-soft text-warn",
  signed: "bg-success-soft text-success",
  declined: "bg-danger-soft text-danger",
  void: "bg-surface-2 text-muted",
};

interface ItemDraft {
  id: string;
  service_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
}

let itemSeq = 0;
function nextItemId() {
  itemSeq += 1;
  return `edit-${itemSeq}`;
}

export function EngagementDetailClient({
  initialLetter,
  clients,
  services,
  firmName,
  firmLogoUrl,
}: {
  initialLetter: Letter;
  clients: Client[];
  services: Service[];
  firmName: string;
  firmLogoUrl: string | null;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();

  const [letter, setLetter] = useState(initialLetter);
  const editable = EDITABLE_STATES.includes(letter.status);

  const [title, setTitle] = useState(letter.title);
  const [periodStart, setPeriodStart] = useState(letter.period_start ?? "");
  const [periodEnd, setPeriodEnd] = useState(letter.period_end ?? "");
  const [recipientName, setRecipientName] = useState(letter.recipient_name ?? "");
  const [recipientEmail, setRecipientEmail] = useState(letter.recipient_email ?? "");
  const [taxRate, setTaxRate] = useState(String(letter.tax_rate));
  const [termsHtml, setTermsHtml] = useState(letter.terms_html ?? "");
  const [items, setItems] = useState<ItemDraft[]>(
    letter.items.map((item) => ({
      id: item.id,
      service_id: item.service_id,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
    })),
  );
  const [serviceToAdd, setServiceToAdd] = useState("");

  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const documentRef = useRef<HTMLDivElement>(null);

  const client = clients.find((c) => c.id === letter.client_id);

  const addFromCatalogue = () => {
    const service = services.find((s) => s.id === serviceToAdd);
    if (!service) return;
    setItems((current) => [
      ...current,
      { id: nextItemId(), service_id: service.id, description: service.name, quantity: 1, unit_price: service.default_price },
    ]);
    setServiceToAdd("");
  };

  const addCustomLine = () => {
    setItems((current) => [...current, { id: nextItemId(), service_id: null, description: "", quantity: 1, unit_price: 0 }]);
  };

  const updateItem = (id: string, patch: Partial<ItemDraft>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeItem = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  };

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const taxAmount = (subtotal * (Number(taxRate) || 0)) / 100;
  const total = subtotal + taxAmount;

  const withError = async (action: string, run: () => Promise<Letter>) => {
    setBusyAction(action);
    setError(null);
    try {
      const updated = await run();
      setLetter(updated);
      return updated;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      return null;
    } finally {
      setBusyAction(null);
    }
  };

  const saveChanges = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateEngagement(letter.id, {
        title: title.trim() || "Engagement Letter",
        terms_html: termsHtml,
        tax_rate: Number(taxRate) || 0,
        period_start: periodStart || null,
        period_end: periodEnd || null,
        recipient_name: recipientName.trim() || null,
        recipient_email: recipientEmail.trim() || null,
        items: items.map((item) => ({
          service_id: item.service_id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
        })),
      });
      setLetter(updated);
      toast.success("Changes saved", "The letter has been updated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const onSend = () =>
    withError("send", () => sendEngagement(letter.id)).then((updated) => {
      if (updated) toast.success(letter.status === "draft" ? "Letter sent" : "Letter resent", `${updated.recipient_email} will get a signing link.`);
    });

  const onVoid = async () => {
    const ok = await confirm({ description: "Void this letter? It can no longer be sent or signed.", confirmLabel: "Void", danger: true });
    if (!ok) return;
    withError("void", () => voidEngagement(letter.id)).then((updated) => {
      if (updated) toast.success("Letter voided");
    });
  };

  const onDuplicate = async () => {
    setBusyAction("duplicate");
    try {
      const copy = await duplicateEngagement(letter.id);
      toast.success("Draft created", "A duplicate draft is ready to edit.");
      router.push(`/engagements/${copy.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusyAction(null);
    }
  };

  const onDelete = async () => {
    const ok = await confirm({ description: "Delete this letter? This cannot be undone.", confirmLabel: "Delete", danger: true });
    if (!ok) return;
    setBusyAction("delete");
    try {
      await deleteEngagement(letter.id);
      toast.success("Letter deleted");
      router.push("/engagements");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setBusyAction(null);
    }
  };

  const onMarkSigned = async () => {
    const ok = await confirm({
      description: "Mark as signed manually? Use this only for a signature captured outside the app (paper, email).",
      confirmLabel: "Mark as signed",
    });
    if (!ok) return;
    withError("mark-signed", () => markEngagementSigned(letter.id, { signer_name: letter.recipient_name ?? undefined })).then(
      (updated) => {
        if (updated) toast.success("Marked as signed");
      },
    );
  };

  const onFirmSign = (signatureData: string, signerName: string, signerTitle: string) =>
    withError("firm-sign", () =>
      firmSignEngagement(letter.id, {
        signer_name: signerName,
        signer_title: signerTitle || null,
        signature_data: signatureData,
      }),
    ).then((updated) => {
      if (updated) toast.success("Firm signature applied");
    });

  const copyLink = async () => {
    if (!letter.share_url) return;
    await navigator.clipboard.writeText(letter.share_url);
    toast.success("Link copied");
  };

  return (
    <>
      <Link href="/engagements" className="text-[12.5px] font-medium text-brand transition hover:underline">
        ← Back to engagements
      </Link>

      <div className="mt-3 mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-[1.6rem] font-bold tracking-tight text-ink">{letter.title}</h1>
          <span className={cn("rounded-full px-2.5 py-1 text-[12px] font-semibold capitalize", STATUS_TONE[letter.status])}>
            {letter.status}
          </span>
        </div>
        <Button
          variant="secondary"
          icon={<Files className="size-4" />}
          onClick={() => window.open(`/engagements/${letter.id}/preview`, "_blank", "noopener")}
        >
          Open & download PDF
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-5">
          {editable ? (
            <>
              <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
                <div className="border-b border-line px-5 py-4">
                  <h2 className="text-[15px] font-semibold text-ink">Engagement details</h2>
                  <p className="mt-0.5 text-[13px] text-muted">{client?.legal_name ?? letter.client_name}</p>
                </div>
                <div className="grid gap-4 p-5 sm:grid-cols-2">
                  <Field label="Letter title">
                    <Input value={title} onChange={(event) => setTitle(event.target.value)} />
                  </Field>
                  <div />
                  <Field label="Period start">
                    <Input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
                  </Field>
                  <Field label="Period end">
                    <Input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
                  </Field>
                  <Field label="Recipient name">
                    <Input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} />
                  </Field>
                  <Field label="Recipient email">
                    <Input type="email" value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} />
                  </Field>
                </div>
              </section>

              <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
                <div className="border-b border-line px-5 py-4">
                  <h2 className="text-[15px] font-semibold text-ink">Pricing</h2>
                </div>
                <div className="p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={serviceToAdd}
                      onValueChange={setServiceToAdd}
                      className="w-64"
                      placeholder="Add a service…"
                      options={services.map((service) => ({
                        value: service.id,
                        label: service.name,
                        description: formatMoney(service.default_price),
                      }))}
                    />
                    <Button type="button" variant="secondary" size="sm" icon={<Plus className="size-3.5" />} onClick={addFromCatalogue} disabled={!serviceToAdd}>
                      Add
                    </Button>
                    <Button type="button" variant="ghost" size="sm" icon={<Plus className="size-3.5" />} onClick={addCustomLine}>
                      Custom line
                    </Button>
                  </div>

                  <div className="mt-4 space-y-2">
                    {items.map((item) => (
                      <div key={item.id} className="grid grid-cols-[1fr_5rem_7rem_auto] items-center gap-2">
                        <Input value={item.description} onChange={(event) => updateItem(item.id, { description: event.target.value })} aria-label="Description" />
                        <Input type="number" min={0} step="0.5" value={item.quantity} onChange={(event) => updateItem(item.id, { quantity: Number(event.target.value) || 0 })} aria-label="Quantity" />
                        <Input type="number" min={0} step="0.01" value={item.unit_price} onChange={(event) => updateItem(item.id, { unit_price: Number(event.target.value) || 0 })} aria-label="Unit price" />
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="grid size-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-danger-soft hover:text-danger"
                          aria-label="Remove line"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                    <Field label="Tax rate (%)" className="w-32">
                      <Input type="number" min={0} step="0.01" value={taxRate} onChange={(event) => setTaxRate(event.target.value)} />
                    </Field>
                    <div className="space-y-1 text-right text-[13px]">
                      <p className="text-muted">Subtotal {formatMoney(subtotal)}</p>
                      <p className="text-muted">Tax {formatMoney(taxAmount)}</p>
                      <p className="text-[15px] font-bold text-ink">Total {formatMoney(total)}</p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
                <div className="border-b border-line px-5 py-4">
                  <h2 className="text-[15px] font-semibold text-ink">Terms & conditions</h2>
                </div>
                <div className="p-5">
                  <RichTextEditor value={termsHtml} onChange={setTermsHtml} />
                </div>
              </section>

              {error ? (
                <p role="alert" className="text-[13px] font-medium text-danger">
                  {error}
                </p>
              ) : null}

              <div className="flex justify-end">
                <Button loading={saving} onClick={saveChanges}>
                  Save changes
                </Button>
              </div>
            </>
          ) : (
            <p className="rounded-lg border border-line bg-surface-2 px-4 py-3 text-[13px] text-muted">
              This letter is {letter.status} and can no longer be edited.
            </p>
          )}

          <div>
            <h2 className="mb-2 text-[15px] font-semibold text-ink">Letter preview</h2>
            <div ref={documentRef}>
              <LetterDocument
                firmName={firmName}
                firmLogoUrl={firmLogoUrl}
                letter={{ ...letter, terms_html: editable ? termsHtml : letter.terms_html }}
                firmSignatureSlot={
                  !letter.firm_signature_data ? (
                    <InlineFirmSign onApply={onFirmSign} pending={busyAction === "firm-sign"} />
                  ) : undefined
                }
              />
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-[15px] font-semibold text-ink">Manage</h2>
              <p className="mt-0.5 text-[13px] text-muted">Send, sign, or remove this letter.</p>
            </div>
            <div className="space-y-2 p-5">
              {letter.status === "signed" ? (
                <ExportMenu
                  letter={letter}
                  firmName={firmName}
                  firmLogoUrl={firmLogoUrl}
                  filenameHint={`${letter.title}-${letter.client_name ?? "client"}`}
                  documentRef={documentRef}
                  label="Download signed record"
                  className="w-full justify-center"
                />
              ) : null}
              {letter.status !== "signed" && letter.status !== "void" ? (
                <Button
                  className="w-full justify-center"
                  icon={<Send className="size-4" />}
                  loading={busyAction === "send"}
                  onClick={onSend}
                >
                  {letter.status === "draft" ? "Send" : "Resend email"}
                </Button>
              ) : null}
              {letter.status !== "signed" ? (
                <Button
                  variant="secondary"
                  className="w-full justify-center"
                  icon={<Signature className="size-4" />}
                  loading={busyAction === "mark-signed"}
                  onClick={onMarkSigned}
                >
                  Mark as signed
                </Button>
              ) : null}
              <Button
                variant="secondary"
                className="w-full justify-center"
                icon={<Files className="size-4" />}
                loading={busyAction === "duplicate"}
                onClick={onDuplicate}
              >
                Duplicate
              </Button>
              {letter.status !== "signed" && letter.status !== "void" ? (
                <Button
                  variant="secondary"
                  className="w-full justify-center"
                  icon={<XCircle className="size-4" />}
                  loading={busyAction === "void"}
                  onClick={onVoid}
                >
                  Void
                </Button>
              ) : null}
              {letter.status !== "signed" ? (
                <Button
                  variant="danger"
                  className="w-full justify-center"
                  icon={<Trash2 className="size-4" />}
                  loading={busyAction === "delete"}
                  onClick={onDelete}
                >
                  Delete
                </Button>
              ) : null}
            </div>
          </section>

          <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-[15px] font-semibold text-ink">Timeline</h2>
            </div>
            <dl className="space-y-2.5 p-5 text-[12.5px]">
              <Row label="Created" value={formatDate(letter.created_at, "long")} />
              <Row label="Sent" value={letter.sent_at ? formatDate(letter.sent_at, "long") : "—"} />
              <Row label="Viewed" value={letter.viewed_at ? formatDate(letter.viewed_at, "long") : "—"} />
              <Row label="Signed" value={letter.signed_at ? formatDate(letter.signed_at, "long") : "—"} />
              {letter.status === "declined" ? <Row label="Declined" value={formatDate(letter.declined_at, "long")} /> : null}
              <Row label="Client email" value={letter.recipient_email ?? "—"} />
              {letter.share_url ? (
                <div>
                  <dt className="text-muted">Client link</dt>
                  <dd className="mt-0.5 flex items-center gap-1.5">
                    <a href={letter.share_url} target="_blank" rel="noreferrer" className="truncate text-brand hover:underline">
                      {letter.share_url}
                    </a>
                    <button type="button" onClick={copyLink} aria-label="Copy link" className="shrink-0 text-muted hover:text-ink">
                      <Copy className="size-3.5" />
                    </button>
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}

function InlineFirmSign({
  onApply,
  pending,
}: {
  onApply: (signatureData: string, signerName: string, signerTitle: string) => void;
  pending: boolean;
}) {
  const [signature, setSignature] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [signerTitle, setSignerTitle] = useState("");

  return (
    <div className="w-full max-w-xs space-y-2 text-left">
      <Input value={signerName} onChange={(event) => setSignerName(event.target.value)} placeholder="Your full name" />
      <Input value={signerTitle} onChange={(event) => setSignerTitle(event.target.value)} placeholder="Title (optional)" />
      <SignaturePad value={signature} onChange={setSignature} label="Firm signature" />
      <Button
        size="sm"
        disabled={!signature || !signerName.trim()}
        loading={pending}
        onClick={() => signature && onApply(signature, signerName.trim(), signerTitle.trim())}
      >
        Apply firm signature
      </Button>
    </div>
  );
}
