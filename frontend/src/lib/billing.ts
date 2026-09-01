"use client";

/**
 * Client for the firm side of plan/seat management (backend/app/routers/
 * plan_requests.py, prefix /billing). Any signed-in staff can read; only
 * Owner/Admin can submit or cancel a request (AdminUserDep server-side —
 * the API is the real boundary, this just reflects it).
 */

import { del, get, post } from "./api";
import type { BillingOverview, CompanyInvoice, PlanRequest } from "./types";

export interface PlanChangeInput {
  /** A catalog key ("starter"…) or "custom" for a bespoke request. */
  requested_plan: string;
  note?: string | null;
  /** Base64 image data URL (data:image/...), optional. */
  attachment?: string | null;
  /** Required when requested_plan === "custom". */
  custom_clients?: number | null;
  custom_seats?: number | null;
}

export const getBillingOverview = () => get<BillingOverview>("/billing/plans");
export const listOwnPlanRequests = () => get<PlanRequest[]>("/billing/requests");
export const requestPlanChange = (input: PlanChangeInput) =>
  post<PlanRequest>("/billing/requests", {
    requested_plan: input.requested_plan,
    note: input.note?.trim() || null,
    attachment: input.attachment || null,
    custom_clients: input.custom_clients ?? null,
    custom_seats: input.custom_seats ?? null,
  });
export const cancelPlanRequest = (id: string) =>
  del<{ ok: boolean; message: string }>(`/billing/requests/${id}`);
/** Ask the platform to renew / reactivate the current plan — a lighter ping than
 * a tier change; deduped to once per 24h server-side. */
export const requestRenewal = (note?: string) =>
  post<{ ok: boolean; message: string }>("/billing/renewal-request", { note: note?.trim() || null });

/** Read-only: invoices SpidNums has sent this firm (backend/app/routers/
 * plan_requests.py's extension of /billing). No write path — there is no
 * payment processor wired up; the platform records payments on its side. */
export const listCompanyInvoices = () => get<CompanyInvoice[]>("/billing/invoices");
export const getCompanyInvoice = (id: string) => get<CompanyInvoice>(`/billing/invoices/${id}`);
