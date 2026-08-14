/**
 * Typed wrappers over the real `/engagements` (authenticated, firm-side) and
 * `/portal/{token}` — served at the public `/engagement/{token}` route
 * (`publicGet`/`publicPost`, unauthenticated) — backend endpoints.
 *
 * Unlike most of the rest of the (firm) app, engagement letters are built
 * against live data from the start: signing and notifications are inherently
 * persisted, stateful behavior that a static demo can't represent.
 */

import { del, get, patch, post, publicGet, publicPost, queryString } from "./api";
import type { Letter, PortalLetter } from "./types";

export interface LetterItemInput {
  service_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
}

export interface LetterUpsertInput {
  client_id?: string;
  title?: string;
  body?: string | null;
  terms_html?: string | null;
  currency?: string;
  tax_rate?: number;
  period_start?: string | null;
  period_end?: string | null;
  recipient_name?: string | null;
  recipient_email?: string | null;
  items?: LetterItemInput[];
}

export interface SignPayload {
  signer_name: string;
  signer_title?: string | null;
  signature_data: string;
}

export const listEngagements = (params?: { client_id?: string; status?: string }) =>
  get<Letter[]>(`/engagements${queryString(params ?? {})}`);

export const getEngagement = (id: string) => get<Letter>(`/engagements/${id}`);

export const createEngagement = (payload: LetterUpsertInput & { client_id: string }) =>
  post<Letter>("/engagements", payload);

export const updateEngagement = (id: string, payload: LetterUpsertInput) =>
  patch<Letter>(`/engagements/${id}`, payload);

export const sendEngagement = (
  id: string,
  payload?: { recipient_email?: string; recipient_name?: string; message?: string },
) => post<Letter>(`/engagements/${id}/send`, payload ?? {});

export const voidEngagement = (id: string) => post<Letter>(`/engagements/${id}/void`);

export const duplicateEngagement = (id: string) => post<Letter>(`/engagements/${id}/duplicate`);

export const deleteEngagement = (id: string) => del<{ message: string }>(`/engagements/${id}`);

/** The firm signs its own copy — separate from the client's signature. */
export const firmSignEngagement = (id: string, payload: SignPayload) =>
  post<Letter>(`/engagements/${id}/sign`, payload);

/** Manual override for a signature captured out of band (paper, email). */
export const markEngagementSigned = (
  id: string,
  payload?: { signer_name?: string; signer_title?: string },
) => post<Letter>(`/engagements/${id}/mark-signed`, payload ?? {});

/** Public, unauthenticated — the no-login page at /engagement/{token}. */
export const getPortalLetter = (token: string) => publicGet<PortalLetter>(`/portal/${token}`);

export const signPortalLetter = (
  token: string,
  payload: SignPayload & { agreed: boolean },
) => publicPost<PortalLetter>(`/portal/${token}/sign`, payload);

export const declinePortalLetter = (token: string, payload?: { reason?: string }) =>
  publicPost<PortalLetter>(`/portal/${token}/decline`, payload ?? {});
