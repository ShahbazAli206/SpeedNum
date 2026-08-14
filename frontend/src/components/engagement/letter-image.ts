/**
 * PNG/JPG export — rasterizes the already-rendered <LetterDocument> DOM node
 * via html2canvas. Simpler than the PDF/DOCX exporters since it captures
 * what's already on screen rather than rebuilding the document from
 * structured data, so no HTML-to-node conversion is needed here.
 */

import html2canvas from "html2canvas";

export async function downloadLetterImage({
  element,
  filenameHint,
  format,
}: {
  element: HTMLElement;
  filenameHint: string;
  format: "png" | "jpg";
}) {
  const canvas = await html2canvas(element, {
    backgroundColor: "#ffffff",
    scale: 2,
    useCORS: true,
  });

  const mimeType = format === "jpg" ? "image/jpeg" : "image/png";
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mimeType, 0.95));
  if (!blob) return;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${filenameHint.replace(/[^a-z0-9-_]+/gi, "-")}.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
