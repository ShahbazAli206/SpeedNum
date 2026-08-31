"use client";

/**
 * Client-side PDF generation for an invoice — same approach as
 * components/engagement/letter-pdf.tsx (@react-pdf/renderer, no native/system
 * dependencies). Simpler than the letter version: no rich-text terms, no
 * signatures, just header/meta/line items/totals/payments/notes.
 */

import { Document, Font, Image, Page, pdf, StyleSheet, Text, View } from "@react-pdf/renderer";

import { formatDate, formatMoney } from "@/lib/format";
import type { InvoiceDocumentData } from "./invoice-document";

Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: { padding: 44, fontSize: 10, fontFamily: "Helvetica", color: "#1e293b" },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#e4e9f0",
    paddingBottom: 12,
    marginBottom: 14,
  },
  fromName: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  logo: { width: 32, height: 32, marginRight: 8, objectFit: "contain" },
  fromRow: { flexDirection: "row", alignItems: "center" },
  kicker: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: "#0a8f4e" },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  label: { fontSize: 8.5, color: "#64748b" },
  bold: { fontFamily: "Helvetica-Bold" },
  body: { fontSize: 10, lineHeight: 1.5, marginBottom: 10, color: "#334155" },
  sectionTitle: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 6 },
  table: { marginTop: 4 },
  tHeadRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#cdd6e2",
    paddingBottom: 4,
    marginBottom: 2,
  },
  tRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e4e9f0",
    paddingVertical: 4,
  },
  tHeadCell: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#64748b" },
  colDesc: { flex: 3 },
  colQty: { flex: 1 },
  colUnit: { flex: 1, textAlign: "right" },
  colAmount: { flex: 1, textAlign: "right" },
  totalsBlock: { alignItems: "flex-end", marginTop: 6 },
  totalsRow: { flexDirection: "row", width: 200, justifyContent: "space-between", marginBottom: 2 },
  totalsFinal: {
    flexDirection: "row",
    width: 200,
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#cdd6e2",
    paddingTop: 4,
    marginTop: 2,
  },
});

function InvoicePdf({
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
    <Document title={`${invoice.number} — ${billToName ?? "Invoice"}`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.headerRow}>
          <View style={styles.fromRow}>
            {fromLogoUrl ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image has no alt prop; not a DOM <img>
              <Image src={fromLogoUrl} style={styles.logo} />
            ) : null}
            <Text style={styles.fromName}>{fromName}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.kicker}>INVOICE</Text>
            <Text style={styles.label}>{invoice.number}</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View>
            <Text style={styles.label}>BILL TO</Text>
            <Text style={styles.bold}>{billToName ?? "—"}</Text>
            {billToEmail ? <Text style={styles.label}>{billToEmail}</Text> : null}
          </View>
          <View>
            <Text style={styles.label}>Issued {formatDate(invoice.issued_on)}</Text>
            <Text style={styles.label}>Due {formatDate(invoice.due_on)}</Text>
          </View>
        </View>

        {invoice.description ? <Text style={styles.body}>{invoice.description}</Text> : null}

        <View style={styles.table}>
          <View style={styles.tHeadRow}>
            <Text style={[styles.tHeadCell, styles.colDesc]}>Description</Text>
            <Text style={[styles.tHeadCell, styles.colQty]}>Qty</Text>
            <Text style={[styles.tHeadCell, styles.colUnit]}>Unit price</Text>
            <Text style={[styles.tHeadCell, styles.colAmount]}>Amount</Text>
          </View>
          {invoice.items.map((item) => (
            <View key={item.id} style={styles.tRow}>
              <Text style={styles.colDesc}>{item.description}</Text>
              <Text style={styles.colQty}>{item.quantity}</Text>
              <Text style={styles.colUnit}>{formatMoney(item.unit_price, invoice.currency)}</Text>
              <Text style={styles.colAmount}>{formatMoney(item.amount, invoice.currency)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text>Subtotal</Text>
            <Text>{formatMoney(invoice.subtotal, invoice.currency)}</Text>
          </View>
          {invoice.tax_rate ? (
            <View style={styles.totalsRow}>
              <Text>Tax ({invoice.tax_rate}%)</Text>
              <Text>{formatMoney(invoice.tax_amount, invoice.currency)}</Text>
            </View>
          ) : null}
          <View style={styles.totalsFinal}>
            <Text style={styles.bold}>Total</Text>
            <Text style={styles.bold}>{formatMoney(invoice.total, invoice.currency)}</Text>
          </View>
          {invoice.amount_paid > 0 ? (
            <>
              <View style={styles.totalsRow}>
                <Text>Paid</Text>
                <Text>{formatMoney(invoice.amount_paid, invoice.currency)}</Text>
              </View>
              <View style={styles.totalsFinal}>
                <Text style={styles.bold}>Balance due</Text>
                <Text style={styles.bold}>{formatMoney(balanceDue, invoice.currency)}</Text>
              </View>
            </>
          ) : null}
        </View>

        {invoice.payments.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Payments</Text>
            <View style={styles.table}>
              {invoice.payments.map((payment) => (
                <View key={payment.id} style={styles.tRow}>
                  <Text style={styles.colDesc}>{formatDate(payment.paid_on)}</Text>
                  <Text style={styles.colQty}>{payment.method ?? "manual"}</Text>
                  <Text style={styles.colAmount}>{formatMoney(payment.amount, invoice.currency)}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {invoice.notes ? (
          <>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={styles.body}>{invoice.notes}</Text>
          </>
        ) : null}
      </Page>
    </Document>
  );
}

export async function downloadInvoicePdf({
  fromName,
  fromLogoUrl,
  billToName,
  billToEmail,
  invoice,
  filenameHint,
}: {
  fromName: string;
  fromLogoUrl?: string | null;
  billToName: string | null;
  billToEmail?: string | null;
  invoice: InvoiceDocumentData;
  filenameHint: string;
}) {
  const blob = await pdf(
    <InvoicePdf
      fromName={fromName}
      fromLogoUrl={fromLogoUrl}
      billToName={billToName}
      billToEmail={billToEmail}
      invoice={invoice}
    />,
  ).toBlob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${filenameHint.replace(/[^a-z0-9-_]+/gi, "-")}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
