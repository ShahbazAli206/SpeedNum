"use client";

/**
 * Client for the platform-superadmin console (backend/app/routers/admin.py).
 * Every call is superadmin-only server-side — a non-superadmin gets a real 403,
 * which is the actual enforcement boundary; the UI just reflects it.
 */

import { del, get, patch, post } from "./api";

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
