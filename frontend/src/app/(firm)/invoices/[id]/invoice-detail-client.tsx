"use client";

import { Banknote, Download, Files, Plus, Send, Trash2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useConfirm } from "@/components/confirm";
import { InvoiceStatusBadge } from "@/components/dashboard/badges";
import { InvoiceDocument } from "@/components/invoice/invoice-document";
import { downloadInvoicePdf } from "@/components/invoice/invoice-pdf";
import { useToast } from "@/components/toast";
import { Button, Field, Input, Modal, Select, Textarea } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import {
  deleteInvoice,
  deleteInvoicePayment,
  duplicateInvoice,
  recordInvoicePayment,
  sendInvoice,
  updateInvoice,
  voidInvoice,
} from "@/lib/invoices";
import type { Client, FirmInvoice, Service } from "@/lib/types";

const LOCKED_STATES = ["paid", "void"];

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

export function InvoiceDetailClient({
  initialInvoice,
  clients,
  services,
  firmName,
  firmLogoUrl,
}: {
  initialInvoice: FirmInvoice;
  clients: Client[];
  services: Service[];
  firmName: string;
  firmLogoUrl: string | null;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();

  const [invoice, setInvoice] = useState(initialInvoice);
  const editable = !LOCKED_STATES.includes(invoice.status);

  const [number, setNumber] = useState(invoice.number);
  const [title, setTitle] = useState(invoice.title);
  const [description, setDescription] = useState(invoice.description ?? "");
  const [dueOn, setDueOn] = useState(invoice.due_on);
  const [recipientName, setRecipientName] = useState(invoice.recipient_name ?? "");
  const [recipientEmail, setRecipientEmail] = useState(invoice.recipient_email ?? "");
  const [taxRate, setTaxRate] = useState(String(invoice.tax_rate));
  const [items, setItems] = useState<ItemDraft[]>(
    invoice.items.map((item) => ({
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
  const [paymentModal, setPaymentModal] = useState(false);

  const client = clients.find((c) => c.id === invoice.client_id);
  const balanceDue = Math.max(0, invoice.total - invoice.amount_paid);

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

  const withError = async (action: string, run: () => Promise<FirmInvoice>) => {
    setBusyAction(action);
    setError(null);
    try {
      const updated = await run();
      setInvoice(updated);
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
      const updated = await updateInvoice(invoice.id, {
        number: number.trim(),
        title: title.trim() || "Invoice",
        description: description.trim() || null,
        due_on: dueOn,
        tax_rate: Number(taxRate) || 0,
        recipient_name: recipientName.trim() || null,
        recipient_email: recipientEmail.trim() || null,
        items: items.map((item) => ({
          service_id: item.service_id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
        })),
      });
      setInvoice(updated);
      toast.success("Changes saved", "The invoice has been updated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const onSend = () =>
    withError("send", () => sendInvoice(invoice.id)).then((updated) => {
      if (updated) toast.success(invoice.status === "draft" ? "Invoice sent" : "Invoice resent", `${updated.recipient_email} will receive it by email.`);
    });

  const onVoid = async () => {
    const ok = await confirm({ description: "Void this invoice? It can no longer be sent or paid.", confirmLabel: "Void", danger: true });
    if (!ok) return;
    withError("void", () => voidInvoice(invoice.id)).then((updated) => {
      if (updated) toast.success("Invoice voided");
    });
  };

  const onDuplicate = async () => {
    setBusyAction("duplicate");
    try {
      const copy = await duplicateInvoice(invoice.id);
      toast.success("Draft created", "A duplicate draft is ready to edit.");
      router.push(`/invoices/${copy.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusyAction(null);
    }
  };

  const onDelete = async () => {
    const ok = await confirm({ description: "Delete this invoice? This cannot be undone.", confirmLabel: "Delete", danger: true });
    if (!ok) return;
    setBusyAction("delete");
    try {
      await deleteInvoice(invoice.id);
      toast.success("Invoice deleted");
      router.push("/invoices");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setBusyAction(null);
    }
  };

  const onDeletePayment = async (paymentId: string) => {
    const ok = await confirm({ description: "Remove this payment? The invoice balance will be recalculated.", confirmLabel: "Remove", danger: true });
    if (!ok) return;
    withError("payment-delete", () => deleteInvoicePayment(invoice.id, paymentId)).then((updated) => {
      if (updated) toast.success("Payment removed");
    });
  };

  const downloadPdf = () =>
    downloadInvoicePdf({
      fromName: firmName,
      fromLogoUrl: firmLogoUrl,
      billToName: client?.legal_name ?? invoice.client_name,
      billToEmail: invoice.recipient_email,
      invoice,
      filenameHint: `${invoice.number}-${invoice.client_name ?? "client"}`,
    });

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-[1.6rem] font-bold tracking-tight text-ink">{invoice.number}</h1>
          <InvoiceStatusBadge status={invoice.status} />
        </div>
        <Button variant="secondary" icon={<Download className="size-4" />} onClick={downloadPdf}>
          Download PDF
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-5">
          {editable ? (
            <>
              <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
                <div className="border-b border-line px-5 py-4">
                  <h2 className="text-[15px] font-semibold text-ink">Invoice details</h2>
                  <p className="mt-0.5 text-[13px] text-muted">{client?.legal_name ?? invoice.client_name}</p>
                </div>
                <div className="grid gap-4 p-5 sm:grid-cols-2">
                  <Field label="Invoice number">
                    <Input value={number} onChange={(event) => setNumber(event.target.value)} />
                  </Field>
                  <Field label="Title">
                    <Input value={title} onChange={(event) => setTitle(event.target.value)} />
                  </Field>
                  <Field label="Due date">
                    <Input type="date" value={dueOn} onChange={(event) => setDueOn(event.target.value)} />
                  </Field>
                  <div />
                  <Field label="Recipient name">
                    <Input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} />
                  </Field>
                  <Field label="Recipient email">
                    <Input type="email" value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} />
                  </Field>
                </div>
                <div className="px-5 pb-5">
                  <Field label="Description" hint="Shown on the invoice, under the header.">
                    <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} />
                  </Field>
                </div>
              </section>

              <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
                <div className="border-b border-line px-5 py-4">
                  <h2 className="text-[15px] font-semibold text-ink">Line items</h2>
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
              This invoice is {invoice.status} and can no longer be edited.
            </p>
          )}

          <div>
            <h2 className="mb-2 text-[15px] font-semibold text-ink">Invoice preview</h2>
            <InvoiceDocument
              fromName={firmName}
              fromLogoUrl={firmLogoUrl}
              billToName={client?.legal_name ?? invoice.client_name}
              billToEmail={invoice.recipient_email}
              invoice={invoice}
            />
          </div>
        </div>

        <div className="space-y-5">
          <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-[15px] font-semibold text-ink">Manage</h2>
              <p className="mt-0.5 text-[13px] text-muted">Send, record a payment, or remove this invoice.</p>
            </div>
            <div className="space-y-2 p-5">
              {invoice.status !== "paid" && invoice.status !== "void" ? (
                <Button
                  className="w-full justify-center"
                  icon={<Send className="size-4" />}
                  loading={busyAction === "send"}
                  onClick={onSend}
                >
                  {invoice.status === "draft" ? "Send" : "Resend email"}
                </Button>
              ) : null}
              {invoice.status !== "draft" && invoice.status !== "void" ? (
                <Button
                  variant="secondary"
                  className="w-full justify-center"
                  icon={<Banknote className="size-4" />}
                  onClick={() => setPaymentModal(true)}
                >
                  Record payment
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
              {invoice.status !== "paid" && invoice.status !== "void" ? (
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
              {invoice.status !== "paid" ? (
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
              <h2 className="text-[15px] font-semibold text-ink">Balance</h2>
            </div>
            <dl className="space-y-2.5 p-5 text-[12.5px]">
              <Row label="Total" value={formatMoney(invoice.total, invoice.currency)} />
              <Row label="Paid" value={formatMoney(invoice.amount_paid, invoice.currency)} />
              <Row label="Balance due" value={formatMoney(balanceDue, invoice.currency)} />
            </dl>
            {invoice.payments.length > 0 ? (
              <ul className="space-y-1.5 border-t border-line px-5 py-4">
                {invoice.payments.map((payment) => (
                  <li key={payment.id} className="flex items-center justify-between gap-2 text-[12.5px]">
                    <span className="text-muted">
                      {formatDate(payment.paid_on)} · {payment.method ?? "manual"}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-ink">{formatMoney(payment.amount, invoice.currency)}</span>
                      <button
                        type="button"
                        onClick={() => onDeletePayment(payment.id)}
                        className="text-muted transition hover:text-danger"
                        aria-label="Remove payment"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-[15px] font-semibold text-ink">Timeline</h2>
            </div>
            <dl className="space-y-2.5 p-5 text-[12.5px]">
              <Row label="Created" value={formatDate(invoice.created_at, "long")} />
              <Row label="Sent" value={invoice.sent_at ? formatDate(invoice.sent_at, "long") : "—"} />
              <Row label="Paid" value={invoice.paid_on ? formatDate(invoice.paid_on, "long") : "—"} />
              <Row label="Client email" value={invoice.recipient_email ?? "—"} />
            </dl>
          </section>
        </div>
      </div>

      {paymentModal ? (
        <PaymentModal
          invoice={invoice}
          onClose={() => setPaymentModal(false)}
          onRecorded={(updated) => {
            setInvoice(updated);
            setPaymentModal(false);
            toast.success("Payment recorded");
          }}
        />
      ) : null}
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

function PaymentModal({
  invoice,
  onClose,
  onRecorded,
}: {
  invoice: FirmInvoice;
  onClose: () => void;
  onRecorded: (updated: FirmInvoice) => void;
}) {
  const balanceDue = Math.max(0, invoice.total - invoice.amount_paid);
  const [amount, setAmount] = useState(String(balanceDue));
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("manual");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    const value = Number(amount);
    if (!value || value <= 0) {
      setError("Enter an amount greater than 0.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const updated = await recordInvoicePayment(invoice.id, {
        amount: value,
        paid_on: paidOn,
        method,
        notes: notes.trim() || null,
      });
      onRecorded(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Record payment"
      description={`Balance due: ${formatMoney(balanceDue, invoice.currency)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button loading={pending} onClick={submit}>
            Record payment
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount" required error={error}>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setError(null);
            }}
          />
        </Field>
        <Field label="Date">
          <Input type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} />
        </Field>
        <Field label="Method" className="sm:col-span-2">
          <Select
            value={method}
            onValueChange={setMethod}
            options={[
              { value: "manual", label: "Manual" },
              { value: "e-transfer", label: "E-transfer" },
              { value: "cheque", label: "Cheque" },
              { value: "card", label: "Card" },
            ]}
          />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" />
        </Field>
      </div>
    </Modal>
  );
}
