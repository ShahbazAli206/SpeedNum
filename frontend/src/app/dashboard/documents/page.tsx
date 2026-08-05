import type { Metadata } from "next";

import { getDocumentTotals, getDocuments } from "@/lib/demo";

import { DocumentsClient } from "./documents-client";

export const metadata: Metadata = { title: "Documents" };

export default function DocumentsPage() {
  return <DocumentsClient documents={getDocuments()} totals={getDocumentTotals()} />;
}
