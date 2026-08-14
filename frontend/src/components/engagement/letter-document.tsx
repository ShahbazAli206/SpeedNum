/**
 * Single source of truth for how an engagement letter looks — reused by the
 * admin detail page's "Letter preview" panel, the new-tab PDF-preview page,
 * and the public no-login sign page, so all three present an identical
 * document. Presentational only; signature capture is composed in via the
 * `firmSignatureSlot`/`clientSignatureSlot` props rather than baked in here.
 */

import type { ReactNode } from "react";

import { formatDate, formatMoney } from "@/lib/format";
import type { LetterItem, LetterStatus } from "@/lib/types";

export interface LetterDocumentData {
  title: string;
  status: LetterStatus;
  currency: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  period_start: string | null;
  period_end: string | null;
  client_name: string | null;
  recipient_name: string | null;
  body: string | null;
  terms_html: string | null;
  items: LetterItem[];
  signed_at: string | null;
  signer_name: string | null;
  signer_title: string | null;
  signature_data: string | null;
  firm_signer_name: string | null;
  firm_signer_title: string | null;
  firm_signature_data: string | null;
  firm_signed_at: string | null;
}

export const DEFAULT_TERMS_HTML = `
  <ol>
    <li><strong>Scope</strong> — Our services are limited to the services listed in this letter. Additional work will be quoted separately.</li>
    <li><strong>Fees</strong> — Fees are as stated and payable on receipt of invoice unless otherwise agreed. Recurring services are billed per their stated frequency.</li>
    <li><strong>Client responsibilities</strong> — You agree to provide accurate, complete and timely information and records required to perform the services.</li>
    <li><strong>Confidentiality</strong> — We will keep your information confidential in accordance with applicable professional and privacy standards.</li>
    <li><strong>Term &amp; termination</strong> — This engagement continues until completed or terminated by either party in writing. Fees for work performed up to termination remain payable.</li>
  </ol>
`;

function SignatureBlock({
  heading,
  signerName,
  signerTitle,
  signatureData,
  signedAt,
  slot,
}: {
  heading: string;
  signerName: string | null;
  signerTitle: string | null;
  signatureData: string | null;
  signedAt: string | null;
  slot?: ReactNode;
}) {
  return (
    <div>
      {signatureData ? (
        // Trusted content: produced by our own SignaturePad (type/draw/upload),
        // never arbitrary user HTML.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={signatureData} alt={`${heading} signature`} className="h-14 max-w-48 object-contain object-left" />
      ) : slot ? (
        slot
      ) : (
        <div className="h-14" />
      )}
      <div className="mt-1 border-t border-line pt-1.5">
        <p className="text-[12.5px] font-semibold text-ink">{heading}</p>
        <p className="text-[12px] text-muted">{signerName ?? "—"}</p>
        {signerTitle ? <p className="text-[11.5px] text-muted">{signerTitle}</p> : null}
        <p className="text-[11.5px] text-muted">
          {signedAt ? `Signed ${formatDate(signedAt, "long")}` : "Signature & date"}
        </p>
      </div>
    </div>
  );
}

export function LetterDocument({
  firmName,
  firmLogoUrl,
  letter,
  firmSignatureSlot,
  clientSignatureSlot,
}: {
  firmName: string;
  firmLogoUrl?: string | null;
  letter: LetterDocumentData;
  /** Rendered in the firm's signature slot when not yet firm-signed. */
  firmSignatureSlot?: ReactNode;
  /** Rendered in the client's signature slot when not yet signed. */
  clientSignatureSlot?: ReactNode;
}) {
  const termsHtml = letter.terms_html?.trim() || DEFAULT_TERMS_HTML;

  return (
    <div className="rounded-xl border border-line bg-surface p-8 text-ink shadow-[var(--shadow-card)]">
      <header className="flex items-start justify-between gap-4 border-b border-line pb-5">
        <div className="flex items-center gap-3">
          {firmLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={firmLogoUrl} alt={firmName} className="size-10 rounded-lg object-contain" />
          ) : (
            <div className="grid size-10 place-items-center rounded-lg bg-brand-soft text-sm font-bold text-brand">
              {firmName.slice(0, 1)}
            </div>
          )}
          <p className="font-display text-lg font-bold text-ink">{firmName}</p>
        </div>
        <p className="text-right text-[13px] font-semibold tracking-wide text-brand uppercase">
          Engagement letter
        </p>
      </header>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Prepared for</p>
          <p className="text-[14px] font-semibold text-ink">{letter.client_name ?? "—"}</p>
          {letter.recipient_name ? <p className="text-[12.5px] text-muted">{letter.recipient_name}</p> : null}
        </div>
        <div className="text-right text-[12.5px] text-muted">
          {letter.period_start ? <p>From {formatDate(letter.period_start)}</p> : null}
          {letter.period_end ? <p>To {formatDate(letter.period_end)}</p> : null}
        </div>
      </div>

      {letter.body ? (
        <p className="mt-5 text-[13.5px] leading-relaxed whitespace-pre-line text-ink-soft">{letter.body}</p>
      ) : null}

      <section className="mt-6">
        <h2 className="text-[13px] font-bold text-ink">1. Services &amp; fees</h2>
        <table className="mt-2.5 w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11.5px] font-semibold text-muted uppercase">
              <th className="pb-1.5 font-semibold">Service</th>
              <th className="pb-1.5 font-semibold">Frequency</th>
              <th className="pb-1.5 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {letter.items.map((item) => (
              <tr key={item.id} className="border-b border-line/60">
                <td className="py-1.5 text-ink-soft">{item.description}</td>
                <td className="py-1.5 text-muted">{item.quantity !== 1 ? `× ${item.quantity}` : "—"}</td>
                <td className="py-1.5 text-right tabular-nums text-ink">
                  {formatMoney(item.amount, letter.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 flex justify-end">
          <div className="w-56 space-y-1 text-[12.5px]">
            <div className="flex justify-between text-muted">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatMoney(letter.subtotal, letter.currency)}</span>
            </div>
            {letter.tax_rate ? (
              <div className="flex justify-between text-muted">
                <span>Tax ({letter.tax_rate}%)</span>
                <span className="tabular-nums">{formatMoney(letter.tax_amount, letter.currency)}</span>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-line pt-1 text-[13.5px] font-bold text-ink">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(letter.total, letter.currency)}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-[13px] font-bold text-ink">2. Terms &amp; conditions</h2>
        {/* Trusted: authored by the firm's own admin Terms editor, not
            arbitrary public input. */}
        <div
          className="engagement-terms-content prose-editor mt-2.5 text-[13px] text-ink-soft"
          dangerouslySetInnerHTML={{ __html: termsHtml }}
        />
      </section>

      <section className="mt-6">
        <h2 className="text-[13px] font-bold text-ink">3. Acceptance</h2>
        <p className="mt-1.5 text-[12.5px] text-muted">
          By signing below, both parties confirm their agreement to the scope, fees and terms set out in this
          letter.
        </p>
        <div className="mt-4 grid gap-8 sm:grid-cols-2">
          <SignatureBlock
            heading={`For ${firmName}`}
            signerName={letter.firm_signer_name}
            signerTitle={letter.firm_signer_title}
            signatureData={letter.firm_signature_data}
            signedAt={letter.firm_signed_at}
            slot={firmSignatureSlot}
          />
          <SignatureBlock
            heading={`For ${letter.client_name ?? "the client"}`}
            signerName={letter.signer_name}
            signerTitle={letter.signer_title}
            signatureData={letter.signature_data}
            signedAt={letter.signed_at}
            slot={clientSignatureSlot}
          />
        </div>
      </section>
    </div>
  );
}
