"use client";

/**
 * Document storage: upload and download, both signed by the backend.
 *
 * The bytes still go straight between the browser and object storage (MinIO
 * on the VPS, or Supabase Storage as a rollback — see
 * backend/app/services/storage.py's provider dispatch) — a large file never
 * passes through the API, so it cannot burn its request timeout. The API
 * signs the URL itself, having first checked that this account may touch
 * this client's book, and mints the storage path server-side, so a caller
 * cannot aim a row at someone else's object. This module never needs to
 * know which provider is behind the URL it's given — it just PUTs to it.
 */

import { get, post } from "./api";
import type { ClientDocument, PortalDocumentKind, TaskAttachment } from "./types";

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
  // request deliberately sends no bearer token — it goes straight to object
  // storage, not to our own API.
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
 * cross-origin, and object storage serves the object with its own content
 * type, so the browser previews what it can and downloads the rest.
 */
export async function documentUrl(documentId: string, clientId?: string): Promise<string> {
  const query = clientId ? `?client_id=${encodeURIComponent(clientId)}` : "";
  const { url } = await get<DownloadUrl>(
    `/client-portal/documents/${documentId}/download-url${query}`,
  );
  return url;
}

/** Same presigned-upload-then-register pattern as uploadDocument above, for
 * task attachments (backend/app/routers/task_attachments.py) instead of the
 * client-portal documents endpoint. */
export async function uploadTaskAttachment(taskId: string, file: File): Promise<TaskAttachment> {
  const slot = await post<UploadSlot>(`/tasks/${taskId}/attachments/upload-url`, { name: file.name });

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

  return post<TaskAttachment>(`/tasks/${taskId}/attachments`, {
    name: file.name,
    kind: "other",
    storage_path: slot.storage_path,
    mime_type: file.type || null,
    size_bytes: file.size,
  });
}

export async function taskAttachmentUrl(taskId: string, attachmentId: string): Promise<string> {
  const { url } = await get<DownloadUrl>(`/tasks/${taskId}/attachments/${attachmentId}/download-url`);
  return url;
}

/**
 * Same presigned-upload-then-register pattern again, this time for a staff
 * caller managing a client's own document book
 * (backend/app/routers/client_documents_staff.py) rather than the client's
 * own client-portal session — which is what `uploadDocument` above talks to,
 * and which a firm user has no session for.
 */
export async function uploadClientDocument(
  clientId: string,
  file: File,
  options: { kind?: PortalDocumentKind; isClientVisible?: boolean } = {},
): Promise<ClientDocument> {
  const slot = await post<UploadSlot>(`/clients/${clientId}/documents/upload-url`, { name: file.name });

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

  return post<ClientDocument>(`/clients/${clientId}/documents`, {
    name: file.name,
    kind: options.kind ?? "other",
    storage_path: slot.storage_path,
    mime_type: file.type || null,
    size_bytes: file.size,
    is_client_visible: options.isClientVisible ?? true,
  });
}

export async function clientDocumentUrl(clientId: string, documentId: string): Promise<string> {
  const { url } = await get<DownloadUrl>(`/clients/${clientId}/documents/${documentId}/download-url`);
  return url;
}

/* -------------------------------------------------------------------------- */
/* Support-message attachments (backend/app/routers/support.py).               */
/* Same presigned-upload pattern; the endpoint prefix differs by side —        */
/* the firm owner uses /support, the platform super-admin uses                 */
/* /admin/support/threads/{tenantId}.                                          */
/* -------------------------------------------------------------------------- */
export type SupportScope = { kind: "firm" } | { kind: "platform"; tenantId: string };

/** The reference a caller includes in the create-message payload. */
export interface SupportAttachmentDraft {
  name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number;
}

async function putToStorage(url: string, file: File): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, {
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
}

export async function uploadSupportAttachment(
  scope: SupportScope,
  file: File,
): Promise<SupportAttachmentDraft> {
  const base = scope.kind === "firm" ? "/support" : `/admin/support/threads/${scope.tenantId}`;
  const slot = await post<UploadSlot>(`${base}/attachments/upload-url`, { name: file.name });
  await putToStorage(slot.url, file);
  return {
    name: file.name,
    storage_path: slot.storage_path,
    mime_type: file.type || null,
    size_bytes: file.size,
  };
}

export async function supportAttachmentUrl(scope: SupportScope, attachmentId: string): Promise<string> {
  // Download is keyed by attachment id alone on both sides (the row already
  // carries its tenant); only the prefix differs.
  const prefix = scope.kind === "firm" ? "/support" : "/admin/support";
  const { url } = await get<DownloadUrl>(`${prefix}/attachments/${attachmentId}/download-url`);
  return url;
}
