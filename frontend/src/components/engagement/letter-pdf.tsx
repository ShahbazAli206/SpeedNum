"use client";

/**
 * Client-side PDF generation — @react-pdf/renderer produces a real vector PDF
 * (selectable text, small file size), no native/system dependencies, so it
 * works the same on Windows dev and in the browser.
 *
 * `richHtmlToPdfNodes` is scoped to exactly the tag/style subset the Tiptap
 * toolbar in rich-text-editor.tsx can emit — not arbitrary HTML.
 */

import {
  Document,
  Font,
  Image,
  Page,
  pdf,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import type { ReactElement } from "react";

import { formatDate, formatMoney } from "@/lib/format";
import type { LetterDocumentData } from "./letter-document";

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
  firmName: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  logo: { width: 32, height: 32, marginRight: 8, objectFit: "contain" },
  firmRow: { flexDirection: "row", alignItems: "center" },
  kicker: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: "#0a8f4e" },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  label: { fontSize: 8.5, color: "#64748b" },
  bold: { fontFamily: "Helvetica-Bold" },
  sectionTitle: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 6 },
  body: { fontSize: 10, lineHeight: 1.5, marginBottom: 10, color: "#334155" },
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
  colFreq: { flex: 1 },
  colAmount: { flex: 1, textAlign: "right" },
  totalsBlock: { alignItems: "flex-end", marginTop: 6 },
  totalsRow: { flexDirection: "row", width: 180, justifyContent: "space-between", marginBottom: 2 },
  totalsFinal: {
    flexDirection: "row",
    width: 180,
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#cdd6e2",
    paddingTop: 4,
    marginTop: 2,
  },
  paragraph: { marginBottom: 6, lineHeight: 1.5 },
  heading1: { fontSize: 12.5, fontFamily: "Helvetica-Bold", marginTop: 8, marginBottom: 4 },
  heading2: { fontSize: 11.5, fontFamily: "Helvetica-Bold", marginTop: 8, marginBottom: 4 },
  heading3: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginTop: 8, marginBottom: 4 },
  listItem: { flexDirection: "row", marginBottom: 3 },
  bullet: { width: 12, fontSize: 10 },
  blockquote: {
    borderLeftWidth: 2,
    borderLeftColor: "#cdd6e2",
    paddingLeft: 8,
    marginBottom: 6,
    color: "#64748b",
  },
  hr: { borderBottomWidth: 1, borderBottomColor: "#e4e9f0", marginVertical: 8 },
  htmlTable: { marginVertical: 6, borderWidth: 0.5, borderColor: "#e4e9f0" },
  htmlTableRow: { flexDirection: "row" },
  htmlTableCell: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: "#e4e9f0",
    padding: 4,
    fontSize: 9.5,
  },
  htmlTableHeaderCell: { backgroundColor: "#f1f5f9", fontFamily: "Helvetica-Bold" },
  signatureRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 24 },
  signatureBlock: { width: "45%" },
  signatureImg: { width: 130, height: 36, objectFit: "contain", marginBottom: 4 },
  signatureRule: { borderTopWidth: 1, borderTopColor: "#cdd6e2", paddingTop: 4 },
});

/* -------------------------------------------------------------------------- */
/* HTML (from the Tiptap editor) -> react-pdf nodes                           */
/* -------------------------------------------------------------------------- */

interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
}

function parseInlineStyle(styleAttr: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (!styleAttr) return result;
  for (const decl of styleAttr.split(";")) {
    const [prop, value] = decl.split(":").map((part) => part?.trim());
    if (prop && value) result[prop] = value;
  }
  return result;
}

function collectRuns(node: ChildNode, inherited: TextRun, runs: TextRun[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    if (text) runs.push({ ...inherited, text });
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const next: TextRun = { ...inherited, text: "" };
  if (tag === "strong" || tag === "b") next.bold = true;
  if (tag === "em" || tag === "i") next.italic = true;
  if (tag === "u") next.underline = true;
  if (tag === "s" || tag === "strike" || tag === "del") next.strike = true;
  const style = parseInlineStyle(el.getAttribute("style"));
  if (style.color) next.color = style.color;

  el.childNodes.forEach((child) => collectRuns(child, next, runs));
}

function runsToPdfText(el: HTMLElement, key: string, baseStyle?: Style) {
  const runs: TextRun[] = [];
  el.childNodes.forEach((child) => collectRuns(child, {} as TextRun, runs));
  return (
    <Text key={key} style={baseStyle}>
      {runs.map((run, index) => (
        <Text
          key={index}
          style={{
            fontFamily: run.bold && run.italic ? "Helvetica-BoldOblique" : run.bold ? "Helvetica-Bold" : run.italic ? "Helvetica-Oblique" : "Helvetica",
            textDecoration: run.underline && run.strike ? "underline line-through" : run.underline ? "underline" : run.strike ? "line-through" : undefined,
            color: run.color,
          }}
        >
          {run.text}
        </Text>
      ))}
    </Text>
  );
}

function renderTableCell(cell: HTMLElement, key: string, isHeader: boolean) {
  return (
    <View key={key} style={[styles.htmlTableCell, isHeader ? styles.htmlTableHeaderCell : undefined]}>
      {runsToPdfText(cell, `${key}-t`)}
    </View>
  );
}

function renderBlock(el: HTMLElement, key: string): ReactElement | null {
  const tag = el.tagName.toLowerCase();

  switch (tag) {
    case "h1":
      return runsToPdfText(el, key, styles.heading1);
    case "h2":
      return runsToPdfText(el, key, styles.heading2);
    case "h3":
      return runsToPdfText(el, key, styles.heading3);
    case "p":
      return runsToPdfText(el, key, styles.paragraph);
    case "blockquote":
      return (
        <View key={key} style={styles.blockquote}>
          {[...el.children].map((child, index) =>
            renderBlock(child as HTMLElement, `${key}-${index}`),
          )}
        </View>
      );
    case "hr":
      return <View key={key} style={styles.hr} />;
    case "ul":
    case "ol":
      return (
        <View key={key}>
          {[...el.children]
            .filter((child) => child.tagName.toLowerCase() === "li")
            .map((li, index) => (
              <View key={`${key}-${index}`} style={styles.listItem}>
                <Text style={styles.bullet}>{tag === "ol" ? `${index + 1}.` : "•"}</Text>
                {runsToPdfText(li as HTMLElement, `${key}-${index}-t`, { flex: 1 })}
              </View>
            ))}
        </View>
      );
    case "table": {
      const rows = [...el.querySelectorAll("tr")];
      return (
        <View key={key} style={styles.htmlTable}>
          {rows.map((row, rowIndex) => (
            <View key={`${key}-${rowIndex}`} style={styles.htmlTableRow}>
              {[...row.children].map((cell, cellIndex) =>
                renderTableCell(
                  cell as HTMLElement,
                  `${key}-${rowIndex}-${cellIndex}`,
                  cell.tagName.toLowerCase() === "th",
                ),
              )}
            </View>
          ))}
        </View>
      );
    }
    default:
      return el.textContent?.trim() ? runsToPdfText(el, key, styles.paragraph) : null;
  }
}

export function richHtmlToPdfNodes(html: string): ReactElement[] {
  if (typeof window === "undefined" || !html.trim()) return [];
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return [];
  return [...root.children]
    .map((child, index) => renderBlock(child as HTMLElement, `blk-${index}`))
    .filter((node): node is ReactElement => node !== null);
}

/* -------------------------------------------------------------------------- */
/* The document itself                                                        */
/* -------------------------------------------------------------------------- */

function LetterPdf({
  firmName,
  firmLogoUrl,
  letter,
}: {
  firmName: string;
  firmLogoUrl?: string | null;
  letter: LetterDocumentData;
}) {
  const termsNodes = richHtmlToPdfNodes(letter.terms_html ?? "");

  return (
    <Document title={`${letter.title} — ${letter.client_name ?? "Client"}`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.headerRow}>
          <View style={styles.firmRow}>
            {firmLogoUrl ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image has no alt prop; not a DOM <img>
              <Image src={firmLogoUrl} style={styles.logo} />
            ) : null}
            <Text style={styles.firmName}>{firmName}</Text>
          </View>
          <Text style={styles.kicker}>ENGAGEMENT LETTER</Text>
        </View>

        <View style={styles.metaRow}>
          <View>
            <Text style={styles.label}>PREPARED FOR</Text>
            <Text style={styles.bold}>{letter.client_name ?? "—"}</Text>
            {letter.recipient_name ? <Text style={styles.label}>{letter.recipient_name}</Text> : null}
          </View>
          <View>
            {letter.period_start ? <Text style={styles.label}>From {formatDate(letter.period_start)}</Text> : null}
            {letter.period_end ? <Text style={styles.label}>To {formatDate(letter.period_end)}</Text> : null}
          </View>
        </View>

        {letter.body ? <Text style={styles.body}>{letter.body}</Text> : null}

        <Text style={styles.sectionTitle}>1. Services &amp; fees</Text>
        <View style={styles.table}>
          <View style={styles.tHeadRow}>
            <Text style={[styles.tHeadCell, styles.colDesc]}>Service</Text>
            <Text style={[styles.tHeadCell, styles.colFreq]}>Frequency</Text>
            <Text style={[styles.tHeadCell, styles.colAmount]}>Amount</Text>
          </View>
          {letter.items.map((item) => (
            <View key={item.id} style={styles.tRow}>
              <Text style={styles.colDesc}>{item.description}</Text>
              <Text style={styles.colFreq}>{item.quantity !== 1 ? `× ${item.quantity}` : "—"}</Text>
              <Text style={styles.colAmount}>{formatMoney(item.amount, letter.currency)}</Text>
            </View>
          ))}
        </View>
        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text>Subtotal</Text>
            <Text>{formatMoney(letter.subtotal, letter.currency)}</Text>
          </View>
          {letter.tax_rate ? (
            <View style={styles.totalsRow}>
              <Text>Tax ({letter.tax_rate}%)</Text>
              <Text>{formatMoney(letter.tax_amount, letter.currency)}</Text>
            </View>
          ) : null}
          <View style={styles.totalsFinal}>
            <Text style={styles.bold}>Total</Text>
            <Text style={styles.bold}>{formatMoney(letter.total, letter.currency)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>2. Terms &amp; conditions</Text>
        {termsNodes}

        <Text style={styles.sectionTitle}>3. Acceptance</Text>
        <Text style={styles.body}>
          By signing below, both parties confirm their agreement to the scope, fees and terms set out in this
          letter.
        </Text>
        <View style={styles.signatureRow}>
          <View style={styles.signatureBlock}>
            {letter.firm_signature_data ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image has no alt prop; not a DOM <img>
              <Image src={letter.firm_signature_data} style={styles.signatureImg} />
            ) : (
              <View style={{ height: 36 }} />
            )}
            <View style={styles.signatureRule}>
              <Text style={styles.bold}>For {firmName}</Text>
              <Text style={styles.label}>{letter.firm_signer_name ?? "—"}</Text>
              <Text style={styles.label}>
                {letter.firm_signed_at ? `Signed ${formatDate(letter.firm_signed_at, "long")}` : "Signature & date"}
              </Text>
            </View>
          </View>
          <View style={styles.signatureBlock}>
            {letter.signature_data ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image has no alt prop; not a DOM <img>
              <Image src={letter.signature_data} style={styles.signatureImg} />
            ) : (
              <View style={{ height: 36 }} />
            )}
            <View style={styles.signatureRule}>
              <Text style={styles.bold}>For {letter.client_name ?? "the client"}</Text>
              <Text style={styles.label}>{letter.signer_name ?? "—"}</Text>
              <Text style={styles.label}>
                {letter.signed_at ? `Signed ${formatDate(letter.signed_at, "long")}` : "Signature & date"}
              </Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function downloadLetterPdf({
  firmName,
  firmLogoUrl,
  letter,
  filenameHint,
}: {
  firmName: string;
  firmLogoUrl?: string | null;
  letter: LetterDocumentData;
  filenameHint: string;
}) {
  const blob = await pdf(
    <LetterPdf firmName={firmName} firmLogoUrl={firmLogoUrl} letter={letter} />,
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
