/**
 * Single source of truth for how an invoice looks — reused by the firm's own
 * /invoices editor, the platform's /admin/finance invoices section, and the
 * read-only views on the client portal and a company's /billing page. Mirrors
 * components/engagement/letter-document.tsx's role for engagement letters;
 * simpler, since an invoice has no rich-text terms or signatures.
 */

import { formatDate, formatMoney } from "@/lib/format";

export interface InvoiceDocumentItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

export interface InvoiceDocumentPayment {
  id: string;
  amount: number;
  paid_on: string;
  method: string | null;
}

export interface InvoiceDocumentData {
  number: string;
  title: string;
  description: string | null;
  issued_on: string;
  due_on: string;
  currency: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  status: string;
  notes: string | null;
  items: InvoiceDocumentItem[];
  payments: InvoiceDocumentPayment[];
}

export function InvoiceDocument({
  fromName,
  fromLogoUrl,
  billToName,
  billToEmail,
  invoice,
}: {
  fromName: string;
  fromLogoUrl?: string | null;
  billToName: string | null;
  billToEmail?: string | null;
  invoice: InvoiceDocumentData;
}) {
  const balanceDue = Math.max(0, invoice.total - invoice.amount_paid);

  return (
    <div className="rounded-xl border border-line bg-surface p-8 text-ink shadow-[var(--shadow-card)]">
      <header className="flex items-start justify-between gap-4 border-b border-line pb-5">
        <div className="flex items-center gap-3">
          {fromLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fromLogoUrl} alt={fromName} className="size-10 rounded-lg object-contain" />
          ) : (
            <div className="grid size-10 place-items-center rounded-lg bg-brand-soft text-sm font-bold text-brand">
              {fromName.slice(0, 1)}
            </div>
          )}
          <p className="font-display text-lg font-bold text-ink">{fromName}</p>
        </div>
        <div className="text-right">
          <p className="text-[13px] font-semibold tracking-wide text-brand uppercase">Invoice</p>
          <p className="mt-0.5 text-[12.5px] text-muted">{invoice.number}</p>
        </div>
      </header>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Bill to</p>
          <p className="text-[14px] font-semibold text-ink">{billToName ?? "—"}</p>
          {billToEmail ? <p className="text-[12.5px] text-muted">{billToEmail}</p> : null}
        </div>
        <div className="text-right text-[12.5px] text-muted">
          <p>Issued {formatDate(invoice.issued_on)}</p>
          <p>Due {formatDate(invoice.due_on)}</p>
        </div>
      </div>

      {invoice.description ? (
        <p className="mt-5 text-[13.5px] leading-relaxed whitespace-pre-line text-ink-soft">
          {invoice.description}
        </p>
      ) : null}

      <section className="mt-6">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11.5px] font-semibold text-muted uppercase">
              <th className="pb-1.5 font-semibold">Description</th>
              <th className="pb-1.5 font-semibold">Qty</th>
              <th className="pb-1.5 text-right font-semibold">Unit price</th>
              <th className="pb-1.5 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id} className="border-b border-line/60">
                <td className="py-1.5 text-ink-soft">{item.description}</td>
                <td className="py-1.5 text-muted">{item.quantity}</td>
                <td className="py-1.5 text-right tabular-nums text-muted">
                  {formatMoney(item.unit_price, invoice.currency)}
                </td>
                <td className="py-1.5 text-right tabular-nums text-ink">
                  {formatMoney(item.amount, invoice.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 flex justify-end">
          <div className="w-56 space-y-1 text-[12.5px]">
            <div className="flex justify-between text-muted">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatMoney(invoice.subtotal, invoice.currency)}</span>
            </div>
            {invoice.tax_rate ? (
              <div className="flex justify-between text-muted">
                <span>Tax ({invoice.tax_rate}%)</span>
                <span className="tabular-nums">{formatMoney(invoice.tax_amount, invoice.currency)}</span>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-line pt-1 text-[13.5px] font-bold text-ink">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(invoice.total, invoice.currency)}</span>
            </div>
            {invoice.amount_paid > 0 ? (
              <>
                <div className="flex justify-between text-success">
                  <span>Paid</span>
                  <span className="tabular-nums">{formatMoney(invoice.amount_paid, invoice.currency)}</span>
                </div>
                <div className="flex justify-between text-[13.5px] font-bold text-ink">
                  <span>Balance due</span>
                  <span className="tabular-nums">{formatMoney(balanceDue, invoice.currency)}</span>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </section>

      {invoice.payments.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-[13px] font-bold text-ink">Payments</h2>
          <table className="mt-2.5 w-full text-[13px]">
            <tbody>
              {invoice.payments.map((payment) => (
                <tr key={payment.id} className="border-b border-line/60">
                  <td className="py-1.5 text-ink-soft">{formatDate(payment.paid_on)}</td>
                  <td className="py-1.5 text-muted capitalize">{payment.method ?? "manual"}</td>
                  <td className="py-1.5 text-right tabular-nums text-ink">
                    {formatMoney(payment.amount, invoice.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {invoice.notes ? (
        <section className="mt-6">
          <h2 className="text-[13px] font-bold text-ink">Notes</h2>
          <p className="mt-1.5 text-[12.5px] whitespace-pre-line text-muted">{invoice.notes}</p>
        </section>
      ) : null}
    </div>
  );
}
