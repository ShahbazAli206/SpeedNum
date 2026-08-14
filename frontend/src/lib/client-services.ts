/**
 * Typed wrappers over the real `/clients/{client_id}/services` endpoints —
 * assigning/removing a service for a client, mirroring `engagements.ts`'s
 * style. The admin client-detail page's "Add service" modal was previously
 * local-only React state; this is what it now calls for real.
 */

import { del, get, patch, post } from "./api";
import type { ClientServiceLink, Frequency } from "./types";

export interface ClientServiceInput {
  service_id: string;
  price?: number | null;
  frequency_override?: Frequency | null;
  assignee_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  notes?: string | null;
}

export interface ClientServiceUpdateInput {
  price?: number | null;
  frequency_override?: Frequency | null;
  assignee_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_active?: boolean;
  notes?: string | null;
}

export const listClientServices = (clientId: string) =>
  get<ClientServiceLink[]>(`/clients/${clientId}/services`);

export const assignClientService = (clientId: string, payload: ClientServiceInput) =>
  post<ClientServiceLink>(`/clients/${clientId}/services`, payload);

export const updateClientService = (
  clientId: string,
  assignmentId: string,
  payload: ClientServiceUpdateInput,
) => patch<ClientServiceLink>(`/clients/${clientId}/services/${assignmentId}`, payload);

export const removeClientService = (clientId: string, assignmentId: string) =>
  del<{ message: string }>(`/clients/${clientId}/services/${assignmentId}`);
