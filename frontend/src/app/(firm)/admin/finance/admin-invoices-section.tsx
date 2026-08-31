"use client";

/**
 * Invoice documents the platform sends tenant firms — layered on top of the
 * page's existing Income/Expenses ledger (backend/app/routers/
 * platform_invoices.py). Recording a payment here writes a platform_income
 * row, so it also appears in the Income table above and, once amount_paid
 * reaches the total, becomes a "paid" row on that firm's own /bills page.
 * Isolated into its own component so the existing Income/Expenses code on
 * this page stays untouched.
 */

import { Banknote, CircleCheck, Clock, Download, Pencil, Plus, Send, Trash2, TriangleAlert, XCircle } from "lucide-react";
import { useState } from "react";

import { KpiTile } from "@/components/charts";
import { InvoiceStatusBadge } from "@/components/dashboard/badges";
import { downloadInvoicePdf } from "@/components/invoice/invoice-pdf";
import { useConfirm } from "@/components/confirm";
import { useToast } from "@/components/toast";
import {
  Button,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Select,
  Table,
  TD,
  TH,
} from "@/components/ui";
import { ApiError } from "@/lib/api";
import {
  createPlatformInvoice,
  deletePlatformInvoice,
  recordPlatformInvoicePayment,
  sendPlatformInvoice,
  updatePlatformInvoice,
  voidPlatformInvoice,
  type PlatformInvoiceCreateInput,
} from "@/lib/admin";
import { formatMoney } from "@/lib/format";
import { useAction, useApi } from "@/lib/hooks";
import type { PlatformInvoice, PlatformInvoiceTotals } from "@/lib/types";

interface TenantOption {
  id: string;
  name: string;
}

interface ItemDraft {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
}

let itemSeq = 0;
function nextItemId() {
  itemSeq += 1;
  return `draft-${itemSeq}`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultDueDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return date.toISOString().slice(0, 10);
}

export function AdminInvoicesSection({ tenants }: { tenants: TenantOption[] }) {
  const toast = useToast();
  const confirm = useConfirm();
  const invoices = useApi<PlatformInvoice[]>("/admin/finance/invoices");
  const totals = useApi<PlatformInvoiceTotals>("/admin/finance/invoices/totals");
  const mutate = useAction();

  const [editorFor, setEditorFor] = useState<PlatformInvoice | "new" | null>(null);
  const [paymentFor, setPaymentFor] = useState<PlatformInvoice | null>(null);
  const [removing, setRemoving] = useState<PlatformInvoice | null>(null);

  const reload = () => Promise.all([invoices.reload(), totals.reload()]);

  const onSend = (invoice: PlatformInvoice) =>
    mutate.run(async () => {
      const updated = await sendPlatformInvoice(invoice.id);
      toast.success(invoice.status === "draft" ? "Invoice sent" : "Invoice resent", updated.tenant_name ?? undefined);
      await reload();
    });

  const onVoid = async (invoice: PlatformInvoice) => {
    const ok = await confirm({ description: "Void this invoice? It can no longer be sent or paid.", confirmLabel: "Void", danger: true });
    if (!ok) return;
    mutate.run(async () => {
      await voidPlatformInvoice(invoice.id);
      toast.success("Invoice voided");
      await reload();
    });
  };

  const onDelete = () =>
    mutate.run(async () => {
      if (!removing) return;
      await deletePlatformInvoice(removing.id);
      toast.success("Invoice deleted");
      setRemoving(null);
      await reload();
    });

  const downloadPdf = (invoice: PlatformInvoice) =>
    downloadInvoicePdf({
      fromName: "SpeedNum",
      billToName: invoice.tenant_name,
      // PlatformInvoice carries no description/payments breakdown (only the
      // running amount_paid total) — pass the fields InvoiceDocumentData
      // needs explicitly rather than widening that type for one field no
      // other invoice kind has.
      invoice: { ...invoice, description: null, payments: [] },
      filenameHint: `${invoice.number}-${invoice.tenant_name ?? "company"}`,
    });

  return (
    <section className="mb-6">
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <KpiTile tone="blue" value={formatMoney(totals.data?.billed ?? 0)} label="Billed" icon={<Clock className="size-5" />} />
        <KpiTile
          tone="green"
          value={formatMoney(totals.data?.collected ?? 0)}
          label="Collected"
          icon={<CircleCheck className="size-5" />}
        />
        <KpiTile
          tone="rose"
          value={formatMoney(totals.data?.overdue ?? 0)}
          label={`Overdue (${totals.data?.overdue_count ?? 0})`}
          icon={<TriangleAlert className="size-5" />}
        />
      </div>

      <div className="rounded-xl border border-line bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Invoices to companies</h2>
            <p className="mt-0.5 text-[13px] text-muted">Invoice documents you&apos;ve sent tenant firms</p>
          </div>
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditorFor("new")}>
            New invoice
          </Button>
        </div>

        {invoices.isLoading ? (
          <LoadingBlock />
        ) : !invoices.data || invoices.data.length === 0 ? (
          <EmptyState title="No invoices yet" description="Create an invoice to bill a tenant firm." />
        ) : (
          <Table>
            <thead>
              <tr>
                <TH>Number</TH>
                <TH>Company</TH>
                <TH>Due</TH>
                <TH align="right">Total</TH>
                <TH>Status</TH>
                <TH align="right">Actions</TH>
              </tr>
            </thead>
            <tbody>
              {invoices.data.map((invoice) => (
                <tr key={invoice.id}>
                  <TD>{invoice.number}</TD>
                  <TD>{invoice.tenant_name ?? "—"}</TD>
                  <TD>{invoice.due_on}</TD>
                  <TD align="right">{formatMoney(invoice.total, invoice.currency)}</TD>
                  <TD>
                    <InvoiceStatusBadge status={invoice.status} />
                  </TD>
                  <TD align="right">
                    <span className="inline-flex gap-1">
                      <button
                        type="button"
                        onClick={() => downloadPdf(invoice)}
                        className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink"
                        aria-label="Download PDF"
                      >
                        <Download className="size-4" />
                      </button>
                      {invoice.status !== "paid" && invoice.status !== "void" ? (
                        <button
                          type="button"
                          onClick={() => onSend(invoice)}
                          className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink"
                          aria-label="Send"
                        >
                          <Send className="size-4" />
                        </button>
                      ) : null}
                      {invoice.status !== "draft" && invoice.status !== "void" ? (
                        <button
                          type="button"
                          onClick={() => setPaymentFor(invoice)}
                          className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink"
                          aria-label="Record payment"
                        >
                          <Banknote className="size-4" />
                        </button>
                      ) : null}
                      {invoice.status !== "paid" && invoice.status !== "void" ? (
                        <button
                          type="button"
                          onClick={() => setEditorFor(invoice)}
                          className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink"
                          aria-label="Edit"
                        >
                          <Pencil className="size-4" />
                        </button>
                      ) : null}
                      {invoice.status !== "paid" && invoice.status !== "void" ? (
                        <button
                          type="button"
                          onClick={() => onVoid(invoice)}
                          className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink"
                          aria-label="Void"
                        >
                          <XCircle className="size-4" />
                        </button>
                      ) : null}
                      {invoice.status !== "paid" ? (
                        <button
                          type="button"
                          onClick={() => setRemoving(invoice)}
                          className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-danger-soft hover:text-danger"
                          aria-label="Delete"
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
      </div>

      {editorFor ? (
        <InvoiceEditorModal
          tenants={tenants}
          initial={editorFor === "new" ? null : editorFor}
          onClose={() => setEditorFor(null)}
          onSaved={async () => {
            setEditorFor(null);
            await reload();
          }}
        />
      ) : null}

      {paymentFor ? (
        <PaymentModal
          invoice={paymentFor}
          onClose={() => setPaymentFor(null)}
          onRecorded={async () => {
            setPaymentFor(null);
            toast.success("Payment recorded");
            await reload();
          }}
        />
      ) : null}

      <Modal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Delete invoice"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={mutate.pending} onClick={() => void onDelete()}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-[13.5px] text-ink-soft">This invoice will be permanently removed.</p>
      </Modal>
    </section>
  );
}

function InvoiceEditorModal({
  tenants,
  initial,
  onClose,
  onSaved,
}: {
  tenants: TenantOption[];
  initial: PlatformInvoice | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tenantId, setTenantId] = useState(initial?.tenant_id ?? "");
  const [number, setNumber] = useState(initial?.number ?? "");
  const [title, setTitle] = useState(initial?.title ?? "Invoice");
  const [dueOn, setDueOn] = useState(initial?.due_on ?? defaultDueDate());
  const [taxRate, setTaxRate] = useState(String(initial?.tax_rate ?? 0));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [items, setItems] = useState<ItemDraft[]>(
    initial?.items.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
    })) ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const addLine = () => setItems((current) => [...current, { id: nextItemId(), description: "", quantity: 1, unit_price: 0 }]);
  const updateLine = (id: string, patch: Partial<ItemDraft>) =>
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const removeLine = (id: string) => setItems((current) => current.filter((item) => item.id !== id));

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const taxAmount = (subtotal * (Number(taxRate) || 0)) / 100;
  const total = subtotal + taxAmount;

  const submit = async () => {
    if (!initial && !tenantId) {
      setError("Select a company.");
      return;
    }
    if (!number.trim()) {
      setError("Enter an invoice number.");
      return;
    }
    if (items.length === 0) {
      setError("Add at least one line item.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const body = {
        number: number.trim(),
        title: title.trim() || "Invoice",
        due_on: dueOn,
        tax_rate: Number(taxRate) || 0,
        notes: notes.trim() || null,
        items: items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
        })),
      };
      if (initial) {
        await updatePlatformInvoice(initial.id, body);
      } else {
        await createPlatformInvoice({ ...body, tenant_id: tenantId } as PlatformInvoiceCreateInput);
      }
      onSaved();
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
      width="lg"
      title={initial ? `Edit invoice ${initial.number}` : "New invoice"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button loading={pending} onClick={submit}>
            {initial ? "Save changes" : "Create invoice"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {!initial ? (
            <Field label="Company" required>
              <Select
                value={tenantId}
                onValueChange={setTenantId}
                placeholder="Select company…"
                options={tenants.map((t) => ({ value: t.id, label: t.name }))}
              />
            </Field>
          ) : (
            <Field label="Company">
              <Input value={initial.tenant_name ?? ""} disabled />
            </Field>
          )}
          <Field label="Invoice number" required>
            <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="SN-1001" />
          </Field>
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Due date" required>
            <Input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[13px] font-medium text-ink-soft">Line items</p>
            <Button type="button" variant="ghost" size="sm" icon={<Plus className="size-3.5" />} onClick={addLine}>
              Add line
            </Button>
          </div>
          {items.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-muted">No lines yet.</p>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="grid grid-cols-[1fr_4.5rem_6.5rem_auto] items-center gap-2">
                  <Input
                    value={item.description}
                    onChange={(e) => updateLine(item.id, { description: e.target.value })}
                    placeholder="Description"
                    aria-label="Description"
                  />
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    value={item.quantity}
                    onChange={(e) => updateLine(item.id, { quantity: Number(e.target.value) || 0 })}
                    aria-label="Quantity"
                  />
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.unit_price}
                    onChange={(e) => updateLine(item.id, { unit_price: Number(e.target.value) || 0 })}
                    aria-label="Unit price"
                  />
                  <button
                    type="button"
                    onClick={() => removeLine(item.id)}
                    className="grid size-9 place-items-center rounded-lg text-muted transition hover:bg-danger-soft hover:text-danger"
                    aria-label="Remove line"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
            <Field label="Tax rate (%)" className="w-28">
              <Input type="number" min={0} step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
            </Field>
            <div className="space-y-0.5 text-right text-[13px]">
              <p className="text-muted">Subtotal {formatMoney(subtotal)}</p>
              <p className="text-muted">Tax {formatMoney(taxAmount)}</p>
              <p className="text-[14px] font-bold text-ink">Total {formatMoney(total)}</p>
            </div>
          </div>
        </div>

        <Field label="Notes">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </Field>

        {error ? (
          <p role="alert" className="text-[13px] font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

function PaymentModal({
  invoice,
  onClose,
  onRecorded,
}: {
  invoice: PlatformInvoice;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const balanceDue = Math.max(0, invoice.total - invoice.amount_paid);
  const [amount, setAmount] = useState(String(balanceDue));
  const [receivedDate, setReceivedDate] = useState(todayISO());
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
      await recordPlatformInvoicePayment(invoice.id, {
        amount: value,
        received_date: receivedDate,
        method,
        notes: notes.trim() || null,
      });
      onRecorded();
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
            onChange={(e) => {
              setAmount(e.target.value);
              setError(null);
            }}
          />
        </Field>
        <Field label="Date">
          <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
        </Field>
        <Field label="Method" className="sm:col-span-2">
          <Select
            value={method}
            onValueChange={setMethod}
            options={[
              { value: "manual", label: "Manual" },
              { value: "stripe", label: "Stripe" },
            ]}
          />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </Field>
      </div>
    </Modal>
  );
}
