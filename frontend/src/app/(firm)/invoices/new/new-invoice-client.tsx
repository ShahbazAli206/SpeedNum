"use client";

import { FileText, Plus, Receipt, Trash2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useToast } from "@/components/toast";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { createInvoice, sendInvoice } from "@/lib/invoices";
import type { Client, Service } from "@/lib/types";

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
  return `draft-${itemSeq}`;
}

function defaultDueDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}

export function NewInvoiceClient({ clients, services }: { clients: Client[]; services: Service[] }) {
  const toast = useToast();
  const router = useRouter();

  const [clientId, setClientId] = useState("");
  const [number, setNumber] = useState("");
  const [title, setTitle] = useState("Invoice");
  const [description, setDescription] = useState("");
  const [dueOn, setDueOn] = useState(defaultDueDate());
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [taxRate, setTaxRate] = useState("0");

  const [items, setItems] = useState<ItemDraft[]>([]);
  const [serviceToAdd, setServiceToAdd] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<"draft" | "send" | null>(null);

  const onSelectClient = (id: string) => {
    setClientId(id);
    const client = clients.find((c) => c.id === id);
    if (client) setRecipientEmail((current) => current || client.email || "");
  };

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

  const submit = async (mode: "draft" | "send") => {
    if (!clientId) {
      setError("Select a client.");
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
    if (mode === "send" && !recipientEmail.trim()) {
      setError("A recipient email is required to send this invoice.");
      return;
    }

    setError(null);
    setSubmitting(mode);
    try {
      const created = await createInvoice({
        client_id: clientId,
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

      if (mode === "send") {
        await sendInvoice(created.id);
        toast.success("Invoice sent", `${created.client_name ?? "The client"} will receive it by email.`);
      } else {
        toast.success("Draft saved", "Continue editing any time from the invoice's page.");
      }
      router.push(`/invoices/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-[1.6rem] font-bold tracking-tight text-ink">New invoice</h1>
        <p className="mt-0.5 text-[14px] text-muted">Bill a client for work performed.</p>
      </div>

      {clients.length === 0 ? (
        <p className="mb-4 rounded-lg border border-warn/40 bg-warn-soft px-4 py-3 text-[13px] text-warn">
          No clients found — the API may not be reachable, or there are no clients yet. Add a client first.
        </p>
      ) : null}

      <div className="space-y-5">
        <Section icon={<Users className="size-4.5" />} title="Invoice details" description="Who this invoice is for.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Client" required>
              <Select
                value={clientId}
                onValueChange={onSelectClient}
                placeholder="Select client…"
                searchPlaceholder="Search clients…"
                options={clients.map((client) => ({
                  value: client.id,
                  label: client.business_name || client.legal_name,
                  description: client.email ?? undefined,
                }))}
              />
            </Field>
            <Field label="Invoice number" required>
              <Input value={number} onChange={(event) => setNumber(event.target.value)} placeholder="INV-1001" />
            </Field>
            <Field label="Title">
              <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            </Field>
            <Field label="Due date" required>
              <Input type="date" value={dueOn} onChange={(event) => setDueOn(event.target.value)} />
            </Field>
            <Field label="Recipient name">
              <Input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} placeholder="Contact at the client" />
            </Field>
            <Field label="Recipient email" required>
              <Input
                type="email"
                value={recipientEmail}
                onChange={(event) => setRecipientEmail(event.target.value)}
                placeholder="accounts@client.ca"
              />
            </Field>
          </div>
          <Field label="Description" className="mt-4" hint="Shown on the invoice, under the header.">
            <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} />
          </Field>
        </Section>

        <Section icon={<Receipt className="size-4.5" />} title="Line items" description="Add services from your catalogue or custom lines.">
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

          {items.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-muted">No lines yet. Add a service or a custom line.</p>
          ) : (
            <div className="mt-4 space-y-2">
              <div className="grid grid-cols-[1fr_5rem_7rem_auto] gap-2 px-1 text-[11.5px] font-semibold text-muted uppercase">
                <span>Item</span>
                <span>Qty</span>
                <span>Unit price</span>
                <span />
              </div>
              {items.map((item) => (
                <div key={item.id} className="grid grid-cols-[1fr_5rem_7rem_auto] items-center gap-2">
                  <Input
                    value={item.description}
                    onChange={(event) => updateItem(item.id, { description: event.target.value })}
                    placeholder="Description"
                    aria-label="Description"
                  />
                  <Input
                    type="number"
                    min={0}
                    step="0.5"
                    value={item.quantity}
                    onChange={(event) => updateItem(item.id, { quantity: Number(event.target.value) || 0 })}
                    aria-label="Quantity"
                  />
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.unit_price}
                    onChange={(event) => updateItem(item.id, { unit_price: Number(event.target.value) || 0 })}
                    aria-label="Unit price"
                  />
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

              <div className="flex items-center justify-between border-t border-line pt-3">
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
          )}
        </Section>

        {error ? (
          <p role="alert" className="text-[13px] font-medium text-danger">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2 pb-2">
          <Button type="button" variant="secondary" disabled={submitting !== null} onClick={() => router.push("/invoices")}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" loading={submitting === "draft"} disabled={submitting !== null} onClick={() => submit("draft")}>
            Save draft
          </Button>
          <Button type="button" icon={<FileText className="size-4" />} loading={submitting === "send"} disabled={submitting !== null} onClick={() => submit("send")}>
            Save & send
          </Button>
        </div>
      </div>
    </>
  );
}

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
      <div className="flex items-start gap-3 border-b border-line px-5 py-4">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-soft">
          {icon}
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
