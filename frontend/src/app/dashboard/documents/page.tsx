import type { Metadata } from "next";

import { getDocumentTotals, getDocuments } from "@/lib/demo";
import { fetchLiveDocumentTotals, fetchLiveDocuments } from "@/lib/portal-live";

import { DocumentsClient } from "./documents-client";

export const metadata: Metadata = { title: "Documents" };

export default async function DocumentsPage() {
  const [documents, totals] = await Promise.all([
    fetchLiveDocuments().then((live) => live ?? getDocuments()),
    fetchLiveDocumentTotals().then((live) => live ?? getDocumentTotals()),
  ]);

  return <DocumentsClient documents={documents} totals={totals} />;
}
