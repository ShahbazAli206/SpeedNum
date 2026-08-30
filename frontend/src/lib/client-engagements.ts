/**
 * Typed wrappers over the authenticated client-portal engagement-letter
 * endpoints (backend/app/routers/client_engagements.py) — the logged-in
 * counterpart to lib/engagements.ts's token-based getPortalLetter/
 * signPortalLetter/declinePortalLetter. Same PortalLetter shape either way.
 */

import { get, post } from "./api";
import type { PortalLetter } from "./types";

export interface ClientSignPayload {
  signer_name: string;
  signer_title?: string | null;
  signature_data: string;
  agreed: boolean;
}

export const listMyEngagements = () => get<PortalLetter[]>("/client-portal/engagements");

export const getMyEngagement = (id: string) => get<PortalLetter>(`/client-portal/engagements/${id}`);

export const signMyEngagement = (id: string, payload: ClientSignPayload) =>
  post<PortalLetter>(`/client-portal/engagements/${id}/sign`, payload);

export const declineMyEngagement = (id: string, payload?: { reason?: string }) =>
  post<PortalLetter>(`/client-portal/engagements/${id}/decline`, payload ?? {});
