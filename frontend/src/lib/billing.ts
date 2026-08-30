"use client";

/**
 * Client for the firm side of plan/seat management (backend/app/routers/
 * plan_requests.py, prefix /billing). Any signed-in staff can read; only
 * Owner/Admin can submit or cancel a request (AdminUserDep server-side —
 * the API is the real boundary, this just reflects it).
 */

import { del, get, post } from "./api";
import type { BillingOverview, PlanRequest } from "./types";

export const getBillingOverview = () => get<BillingOverview>("/billing/plans");
export const listOwnPlanRequests = () => get<PlanRequest[]>("/billing/requests");
export const requestPlanChange = (requested_plan: string, note?: string) =>
  post<PlanRequest>("/billing/requests", { requested_plan, note: note || null });
export const cancelPlanRequest = (id: string) =>
  del<{ ok: boolean; message: string }>(`/billing/requests/${id}`);
