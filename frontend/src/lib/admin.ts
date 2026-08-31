"use client";

/**
 * Client for the platform-superadmin console (backend/app/routers/admin.py).
 * Every call is superadmin-only server-side — a non-superadmin gets a real 403,
 * which is the actual enforcement boundary; the UI just reflects it.
 */

import { del, get, patch, post } from "./api";
import type {
  ExpiryAlert,
  ExpiryTarget,
  PlanAdmin,
  PlanInput,
  PlanRequestAdmin,
  PlatformInvoice,
  PlatformInvoiceTotals,
} from "./types";

export interface PlatformStats {
  tenants: number;
  active_tenants: number;
  suspended_tenants: number;
  trialing_tenants: number;
  users: number;
  clients: number;
  deadlines: number;
  letters_signed: number;
}

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  plan: string;
  seats: number;
  is_active: boolean;
  is_demo: boolean;
  /** The provider's own internal workspace (at most one, by convention) —
   * distinct from is_demo, which is still a pretend *customer*. */
  is_platform: boolean;
  custom_domain: string | null;
  admin_email: string | null;
  trial_ends_at: string | null;
  /** Date-driven expiry (0024). Null = not tracked. */
  plan_expires_at: string | null;
  service_expires_at: string | null;
  created_at: string | null;
  clients: number;
  users: number;
  signed_letters: number;
  max_clients: number | null;
  max_users: number | null;
}

export interface TenantDetail extends TenantSummary {
  legal_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  brand_color: string;
  accent_color: string;
  logo_url: string | null;
  email_from_name: string | null;
  admin_id: string | null;
  admin_name: string | null;
  admin_last_seen: string | null;
}

export interface CredentialResult {
  profile_id?: string;
  email: string;
  full_name?: string | null;
  role?: string;
  temp_password: string;
  login_url: string;
  email_sent: boolean;
  message: string;
}

export interface TenantProvisionResult {
  tenant: TenantDetail;
  admin: CredentialResult;
}

export interface TenantCreateInput {
  name: string;
  admin_email: string;
  admin_name?: string;
  slug?: string | null;
  plan?: string;
  custom_domain?: string | null;
  max_clients?: number | null;
  max_users?: number | null;
  is_demo?: boolean;
  is_platform?: boolean;
  send_email?: boolean;
}

export interface TenantEditInput {
  name?: string;
  slug?: string;
  email?: string | null;
  custom_domain?: string | null;
  plan?: string;
  is_active?: boolean;
  /** ISO datetimes. Pass null to clear (untracked); omit to leave unchanged. */
  plan_expires_at?: string | null;
  service_expires_at?: string | null;
  max_clients?: number | null;
  max_users?: number | null;
  is_demo?: boolean;
  is_platform?: boolean;
}

export interface ReachData {
  vercel: {
    api_token_set: boolean;
    project_id_set: boolean;
    team_id_set: boolean;
    web_analytics_configured: boolean;
  };
  traffic: { visitors: number; pageviews: number; period_days: number } | null;
  scale: {
    tenants: number;
    active_tenants: number;
    clients: number;
    users: number;
    engagements: number;
  };
}

export interface PlatformEmailStatus {
  provider: "resend" | "smtp" | "none";
  configured: boolean;
  sender: string;
  sender_domain: string;
  reply_to: string | null;
  warnings: string[];
  smtp?: {
    host: string;
    port: number;
    security: string;
    username: string;
    authenticated: boolean;
  };
}

export interface EmailTestResult {
  ok: boolean;
  provider: string;
  to: string;
  error: string | null;
  message: string;
}

export const platformStats = () => get<PlatformStats>("/admin/stats");
export const platformReach = () => get<ReachData>("/admin/reach");
export const platformEmailStatus = () => get<PlatformEmailStatus>("/admin/email");
export const sendPlatformTestEmail = (to?: string) =>
  post<EmailTestResult>("/admin/email/test", { to: to || null });
export const listTenants = () => get<TenantSummary[]>("/admin/tenants");
export const getTenant = (id: string) => get<TenantDetail>(`/admin/tenants/${id}`);
export const createTenant = (body: TenantCreateInput) =>
  post<TenantProvisionResult>("/admin/tenants", body);
export const updateTenant = (id: string, body: TenantEditInput) =>
  patch<TenantDetail>(`/admin/tenants/${id}`, body);
export const suspendTenant = (id: string, active: boolean) =>
  post<TenantDetail>(`/admin/tenants/${id}/suspend?active=${active ? "true" : "false"}`);
export const deleteTenant = (id: string) =>
  del<{ ok: boolean; message: string }>(`/admin/tenants/${id}`);
export const resendTenantInvite = (id: string) =>
  post<CredentialResult>(`/admin/tenants/${id}/resend-invite`);

/** Every firm with a plan/server-domain date expiring soon or already past. */
export const listExpiryAlerts = () => get<ExpiryAlert[]>("/admin/expiry-alerts");
/** Manually drop an expiry reminder into a company's bell ("Send reminder now"). */
export const remindTenant = (id: string, target: ExpiryTarget, message?: string) =>
  post<TenantDetail>(`/admin/tenants/${id}/remind`, { target, message: message || null });

export const listPlanRequests = (status?: string) =>
  get<PlanRequestAdmin[]>(status ? `/admin/plan-requests?status=${status}` : "/admin/plan-requests");
export const approvePlanRequest = (id: string, maxClients: number | null, maxUsers: number | null) =>
  post<PlanRequestAdmin>(`/admin/plan-requests/${id}/approve`, {
    max_clients: maxClients,
    max_users: maxUsers,
  });
export const rejectPlanRequest = (id: string, note?: string) =>
  post<PlanRequestAdmin>(`/admin/plan-requests/${id}/reject`, { note: note || null });

/** Editable plan catalog — superadmin manages, company owners see the active
 * subset on /billing. See backend/app/routers/plans_admin.py. */
export const listAdminPlans = () => get<PlanAdmin[]>("/admin/plans");
export const createPlan = (input: PlanInput) => post<PlanAdmin>("/admin/plans", input);
export const updatePlan = (id: string, input: Partial<PlanInput> & { position?: number }) =>
  patch<PlanAdmin>(`/admin/plans/${id}`, input);
export const deletePlan = (id: string) =>
  del<{ ok: boolean; message: string }>(`/admin/plans/${id}`);

/** Invoice documents the platform sends tenant firms — layered on top of the
 * platform_income ledger in the Finance page above. See app/routers/
 * platform_invoices.py. A recorded payment writes a platform_income row, so
 * it also surfaces in the Income table and on the firm's own /bills page. */
export interface PlatformInvoiceItemInput {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface PlatformInvoiceCreateInput {
  tenant_id: string;
  number: string;
  title?: string;
  issued_on?: string | null;
  due_on: string;
  currency?: string;
  tax_rate?: number;
  notes?: string | null;
  items: PlatformInvoiceItemInput[];
}

export type PlatformInvoiceUpdateInput = Partial<Omit<PlatformInvoiceCreateInput, "tenant_id">>;

export const listPlatformInvoices = (tenantId?: string) =>
  get<PlatformInvoice[]>(tenantId ? `/admin/finance/invoices?tenant_id=${tenantId}` : "/admin/finance/invoices");
export const getPlatformInvoiceTotals = () => get<PlatformInvoiceTotals>("/admin/finance/invoices/totals");
export const createPlatformInvoice = (input: PlatformInvoiceCreateInput) =>
  post<PlatformInvoice>("/admin/finance/invoices", input);
export const updatePlatformInvoice = (id: string, input: PlatformInvoiceUpdateInput) =>
  patch<PlatformInvoice>(`/admin/finance/invoices/${id}`, input);
export const sendPlatformInvoice = (id: string, message?: string) =>
  post<PlatformInvoice>(`/admin/finance/invoices/${id}/send`, { message: message?.trim() || null });
export const recordPlatformInvoicePayment = (
  id: string,
  input: { amount: number; received_date?: string | null; method?: string; notes?: string | null },
) => post<PlatformInvoice>(`/admin/finance/invoices/${id}/record-payment`, input);
export const voidPlatformInvoice = (id: string) => post<PlatformInvoice>(`/admin/finance/invoices/${id}/void`);
export const deletePlatformInvoice = (id: string) =>
  del<{ ok: boolean; message: string }>(`/admin/finance/invoices/${id}`);
