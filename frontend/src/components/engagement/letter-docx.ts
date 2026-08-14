/**
 * Client-side Word (.docx) export — mirrors letter-pdf.tsx's structure and
 * scope exactly, just targeting the `docx` package's node tree instead of
 * @react-pdf/renderer's. `richHtmlToDocxNodes` handles the same tag/style
 * subset the Tiptap toolbar in rich-text-editor.tsx can emit.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from "docx";

import { formatDate, formatMoney } from "@/lib/format";
import type { LetterDocumentData } from "./letter-document";

const HAIRLINE = { style: BorderStyle.SINGLE, size: 2, color: "E4E9F0" } as const;
const CELL_BORDERS = { top: HAIRLINE, bottom: HAIRLINE, left: HAIRLINE, right: HAIRLINE };

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function imageTypeFromDataUrl(dataUrl: string): "png" | "jpg" {
  return dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg") ? "jpg" : "png";
}

function signatureImage(dataUrl: string) {
  return new ImageRun({
    type: imageTypeFromDataUrl(dataUrl),
    data: dataUrlToUint8Array(dataUrl),
    transformation: { width: 130, height: 40 },
  });
}

/* -------------------------------------------------------------------------- */
/* HTML (from the Tiptap editor) -> docx nodes                                 */
/* -------------------------------------------------------------------------- */

interface TextRunSpec {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  link?: string;
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

function collectRuns(node: ChildNode, inherited: TextRunSpec, runs: TextRunSpec[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    if (text) runs.push({ ...inherited, text });
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const next: TextRunSpec = { ...inherited, text: "" };
  if (tag === "strong" || tag === "b") next.bold = true;
  if (tag === "em" || tag === "i") next.italic = true;
  if (tag === "u") next.underline = true;
  if (tag === "s" || tag === "strike" || tag === "del") next.strike = true;
  if (tag === "a") next.link = el.getAttribute("href") ?? undefined;
  const style = parseInlineStyle(el.getAttribute("style"));
  if (style.color) next.color = style.color.replace("#", "");

  el.childNodes.forEach((child) => collectRuns(child, next, runs));
}

function runsToDocxChildren(el: HTMLElement): ParagraphChild[] {
  const runs: TextRunSpec[] = [];
  el.childNodes.forEach((child) => collectRuns(child, {} as TextRunSpec, runs));

  return runs.map((run) => {
    const textRun = new TextRun({
      text: run.text,
      bold: run.bold,
      italics: run.italic,
      underline: run.underline ? {} : undefined,
      strike: run.strike,
      color: run.color,
    });
    return run.link ? new ExternalHyperlink({ link: run.link, children: [textRun] }) : textRun;
  });
}

function renderBlock(el: HTMLElement): (Paragraph | Table)[] {
  const tag = el.tagName.toLowerCase();

  switch (tag) {
    case "h1":
      return [new Paragraph({ heading: HeadingLevel.HEADING_1, children: runsToDocxChildren(el) })];
    case "h2":
      return [new Paragraph({ heading: HeadingLevel.HEADING_2, children: runsToDocxChildren(el) })];
    case "h3":
      return [new Paragraph({ heading: HeadingLevel.HEADING_3, children: runsToDocxChildren(el) })];
    case "p":
      return [new Paragraph({ spacing: { after: 120 }, children: runsToDocxChildren(el) })];
    case "blockquote":
      return [new Paragraph({ indent: { left: 360 }, spacing: { after: 120 }, children: runsToDocxChildren(el) })];
    case "hr":
      return [
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "E4E9F0" } },
          spacing: { after: 120 },
        }),
      ];
    case "ul":
    case "ol":
      return [...el.children]
        .filter((child) => child.tagName.toLowerCase() === "li")
        .map(
          (li, index) =>
            new Paragraph({
              bullet: tag === "ul" ? { level: 0 } : undefined,
              numbering: tag === "ol" ? { reference: "engagement-ordered-list", level: 0 } : undefined,
              children: tag === "ol"
                ? [new TextRun({ text: `${index + 1}. ` }), ...runsToDocxChildren(li as HTMLElement)]
                : runsToDocxChildren(li as HTMLElement),
            }),
        );
    case "table": {
      const rows = [...el.querySelectorAll("tr")];
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: rows.map(
            (row) =>
              new TableRow({
                children: [...row.children].map(
                  (cell) =>
                    new TableCell({
                      borders: CELL_BORDERS,
                      shading: cell.tagName.toLowerCase() === "th" ? { fill: "F1F5F9" } : undefined,
                      children: [new Paragraph({ children: runsToDocxChildren(cell as HTMLElement) })],
                    }),
                ),
              }),
          ),
        }),
      ];
    }
    default:
      return el.textContent?.trim() ? [new Paragraph({ children: runsToDocxChildren(el) })] : [];
  }
}

function richHtmlToDocxNodes(html: string): (Paragraph | Table)[] {
  if (typeof window === "undefined" || !html.trim()) return [];
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return [];
  return [...root.children].flatMap((child) => renderBlock(child as HTMLElement));
}

/* -------------------------------------------------------------------------- */
/* The document itself                                                        */
/* -------------------------------------------------------------------------- */

function servicesTable(letter: LetterDocumentData) {
  const headerRow = new TableRow({
    children: ["Service", "Frequency", "Amount"].map(
      (label, index) =>
        new TableCell({
          borders: CELL_BORDERS,
          shading: { fill: "F1F5F9" },
          width: index === 0 ? { size: 60, type: WidthType.PERCENTAGE } : undefined,
          children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })],
        }),
    ),
  });

  const rows = letter.items.map(
    (item) =>
      new TableRow({
        children: [
          new TableCell({ borders: CELL_BORDERS, children: [new Paragraph(item.description)] }),
          new TableCell({
            borders: CELL_BORDERS,
            children: [new Paragraph(item.quantity !== 1 ? `× ${item.quantity}` : "—")],
          }),
          new TableCell({
            borders: CELL_BORDERS,
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun(formatMoney(item.amount, letter.currency))],
              }),
            ],
          }),
        ],
      }),
  );

  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...rows] });
}

function signatureBlock(heading: string, signerName: string | null, signerTitle: string | null, signedAt: string | null, signatureData: string | null) {
  const children: Paragraph[] = [];
  children.push(
    new Paragraph({ children: signatureData ? [signatureImage(signatureData)] : [new TextRun(" ")] }),
  );
  children.push(
    new Paragraph({
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: "CDD6E2" } },
      spacing: { before: 60 },
      children: [new TextRun({ text: heading, bold: true })],
    }),
  );
  children.push(new Paragraph(signerName ?? "—"));
  if (signerTitle) children.push(new Paragraph(signerTitle));
  children.push(new Paragraph(signedAt ? `Signed ${formatDate(signedAt, "long")}` : "Signature & date"));
  return children;
}

function buildDocument(firmName: string, letter: LetterDocumentData): Document {
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      children: [new TextRun({ text: firmName, bold: true, size: 30 })],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: "ENGAGEMENT LETTER", bold: true, color: "0A8F4E" })],
    }),
    new Paragraph({
      children: [new TextRun({ text: "Prepared for: ", bold: true }), new TextRun(letter.client_name ?? "—")],
    }),
  ];

  if (letter.recipient_name) children.push(new Paragraph(letter.recipient_name));
  if (letter.period_start) children.push(new Paragraph(`From ${formatDate(letter.period_start)}`));
  if (letter.period_end) children.push(new Paragraph(`To ${formatDate(letter.period_end)}`));
  if (letter.body) children.push(new Paragraph({ spacing: { before: 200, after: 200 }, children: [new TextRun(letter.body)] }));

  children.push(
    new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200 }, children: [new TextRun("1. Services & fees")] }),
    servicesTable(letter),
    new Paragraph({
      spacing: { before: 120 },
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: `Subtotal: ${formatMoney(letter.subtotal, letter.currency)}` })],
    }),
  );
  if (letter.tax_rate) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun(`Tax (${letter.tax_rate}%): ${formatMoney(letter.tax_amount, letter.currency)}`)],
      }),
    );
  }
  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: `Total: ${formatMoney(letter.total, letter.currency)}`, bold: true })],
    }),
  );

  children.push(
    new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 300 }, children: [new TextRun("2. Terms & conditions")] }),
    ...richHtmlToDocxNodes(letter.terms_html ?? ""),
  );

  children.push(
    new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 300 }, children: [new TextRun("3. Acceptance")] }),
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun(
          "By signing below, both parties confirm their agreement to the scope, fees and terms set out in this letter.",
        ),
      ],
    }),
  );

  children.push(
    ...signatureBlock(`For ${firmName}`, letter.firm_signer_name, letter.firm_signer_title, letter.firm_signed_at, letter.firm_signature_data),
    ...signatureBlock(
      `For ${letter.client_name ?? "the client"}`,
      letter.signer_name,
      letter.signer_title,
      letter.signed_at,
      letter.signature_data,
    ),
  );

  return new Document({
    numbering: {
      config: [
        {
          reference: "engagement-ordered-list",
          levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.START }],
        },
      ],
    },
    sections: [{ children }],
  });
}

export async function downloadLetterDocx({
  firmName,
  letter,
  filenameHint,
}: {
  firmName: string;
  firmLogoUrl?: string | null;
  letter: LetterDocumentData;
  filenameHint: string;
}) {
  const doc = buildDocument(firmName, letter);
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${filenameHint.replace(/[^a-z0-9-_]+/gi, "-")}.docx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
