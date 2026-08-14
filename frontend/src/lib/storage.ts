"use client";

/**
 * Document storage: upload and download, both signed by the backend.
 *
 * The bytes still go straight between the browser and Supabase Storage — a
 * large file never passes through the API, so it cannot burn its request
 * timeout. What changed is *who signs*: the browser used to call
 * `supabase.storage.createSignedUploadUrl()` itself, which cannot work against
 * the real project. `db/migrations/0003_functions.sql` creates the `documents`
 * bucket private and defines no policies on `storage.objects`, and Supabase has
 * RLS on by default there — so an anon-role session is denied every operation.
 *
 * The API signs with the service-role key instead (backend/app/services/storage.py),
 * having first checked that this account may touch this client's book. It also
 * mints the storage path, so a caller cannot aim a row at someone else's object.
 */

import { get, post } from "./api";
import type { ClientDocument, PortalDocumentKind } from "./types";

export class UploadError extends Error {}

interface UploadSlot {
  storage_path: string;
  token: string;
  url: string;
}

interface DownloadUrl {
  url: string;
  expires_in: number;
}

export async function uploadDocument(
  file: File,
  options: { kind?: PortalDocumentKind; isClientVisible?: boolean; clientId?: string } = {},
): Promise<ClientDocument> {
  const query = options.clientId ? `?client_id=${encodeURIComponent(options.clientId)}` : "";

  const slot = await post<UploadSlot>(`/client-portal/documents/upload-url${query}`, {
    name: file.name,
  });

  // The signed URL carries its own authorisation in the query string, so this
  // request deliberately sends no bearer token — it goes to Supabase, not to us.
  let response: Response;
  try {
    response = await fetch(slot.url, {
      method: "PUT",
      headers: file.type ? { "Content-Type": file.type } : undefined,
      body: file,
    });
  } catch {
    throw new UploadError("Could not reach storage. Check your connection and try again.");
  }

  if (!response.ok) {
    throw new UploadError(
      response.status === 400
        ? "Storage rejected the upload — the signed link may have expired. Try again."
        : `Upload failed (${response.status}).`,
    );
  }

  return post<ClientDocument>(`/client-portal/documents${query}`, {
    name: file.name,
    kind: options.kind ?? "other",
    storage_path: slot.storage_path,
    mime_type: file.type || null,
    size_bytes: file.size,
    is_client_visible: options.isClientVisible ?? true,
  });
}

/**
 * Opens a document. The signed URL is short-lived (5 minutes) and minted per
 * click rather than embedded in the table, so a page left open overnight cannot
 * leak a working link.
 *
 * Navigates rather than using a download attribute: the attribute is ignored
 * cross-origin, and Supabase serves the object with its own content type, so
 * the browser previews what it can and downloads the rest.
 */
export async function documentUrl(documentId: string, clientId?: string): Promise<string> {
  const query = clientId ? `?client_id=${encodeURIComponent(clientId)}` : "";
  const { url } = await get<DownloadUrl>(
    `/client-portal/documents/${documentId}/download-url${query}`,
  );
  return url;
}
