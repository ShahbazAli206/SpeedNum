"use client";

/**
 * Uploads a file straight from the browser to the `documents` Supabase
 * Storage bucket (provisioned in db/migrations/0003_functions.sql), then
 * registers its metadata via POST /client-portal/documents.
 *
 * Bytes never pass through the FastAPI Space — a signed upload URL lets the
 * browser talk to Supabase Storage directly, so a large file can't burn the
 * Space's request timeout for no benefit.
 */

import { post } from "./api";
import { supabaseBrowser } from "./supabase/client";
import type { ClientDocument, PortalDocumentKind } from "./types";

const BUCKET = "documents";

export class UploadError extends Error {}

function randomToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function uploadDocument(
  file: File,
  options: { kind?: PortalDocumentKind; isClientVisible?: boolean; clientId?: string } = {},
): Promise<ClientDocument> {
  const supabase = supabaseBrowser();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${randomToken()}-${safeName}`;

  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);
  if (signError || !signed) {
    throw new UploadError(signError?.message ?? "Could not prepare the upload.");
  }

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .uploadToSignedUrl(path, signed.token, file);
  if (uploadError) throw new UploadError(uploadError.message);

  const query = options.clientId ? `?client_id=${encodeURIComponent(options.clientId)}` : "";
  return post<ClientDocument>(`/client-portal/documents${query}`, {
    name: file.name,
    kind: options.kind ?? "other",
    storage_path: path,
    mime_type: file.type || null,
    size_bytes: file.size,
    is_client_visible: options.isClientVisible ?? true,
  });
}
