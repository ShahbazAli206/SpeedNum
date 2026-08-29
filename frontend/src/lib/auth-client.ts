"use client";

/**
 * Client-side session state: the access token itself, in memory only (a
 * module-level variable — never localStorage, per the "no long-lived
 * secret in a script-readable store" rule this app follows). The refresh
 * token never reaches this module or any browser JS at all — it lives in
 * an HttpOnly cookie only the src/app/api/auth/* route handlers ever read.
 *
 * register/login/logout/magicLogin below call THIS app's own API routes
 * (same-origin), not the FastAPI backend directly — see lib/session-server.ts
 * for why: the backend's refresh cookie is cross-origin from a Server
 * Component's point of view, so those routes re-mint it as a first-party
 * cookie on this domain. Data calls (lib/api.ts) are unaffected — they still
 * call the backend directly with whatever access token is currently held here.
 */

import type { Me } from "./types";

let accessToken: string | null = null;
let hydrated = false;
let hydrating: Promise<string | null> | null = null;

export function currentAccessToken(): string | null {
  return accessToken;
}

/**
 * A superadmin was impersonating a firm and a background token refresh
 * couldn't re-enter it (see session-server.ts's refreshFromCookie) — the
 * browser is now silently back on the superadmin's own tenant-less session
 * while whatever page it's on still shows that firm's stale content. Sending
 * them to the Admin console with an explanation is better than leaving them
 * to find out the hard way the next time an action 409s with "no firm is
 * linked to this account" (see PLATFORM_IMPLEMENTATION_LOG.md).
 */
function handleImpersonationLost() {
  if (typeof window === "undefined") return;
  if (window.location.pathname === "/admin" && window.location.search.includes("impersonation_ended")) return;
  // A hard navigation, deliberately: this runs inside ensureHydrated/
  // refreshAccessToken, plain module functions called from anywhere
  // (lib/api.ts's fetch wrapper included) with no React render tree to call
  // useRouter() from. A full reload is also the correct reset here, not
  // just the available one — it clears every other piece of client-side
  // state that assumed the old (impersonated) tenant, not just the route.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = "/admin?impersonation_ended=1";
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  hydrated = true;
}

/** Called once per page load before the first API call needs a token —
 * either reads the short-lived access cookie back (Route Handler makes
 * this possible despite it being HttpOnly) or refreshes via the refresh
 * cookie if it's already gone. */
export async function ensureHydrated(): Promise<string | null> {
  if (hydrated) return accessToken;
  if (hydrating) return hydrating;

  hydrating = (async () => {
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      if (!response.ok) {
        setAccessToken(null);
        return null;
      }
      const data = (await response.json()) as { access_token: string; impersonation_lost?: boolean };
      setAccessToken(data.access_token);
      if (data.impersonation_lost) handleImpersonationLost();
      return data.access_token;
    } catch {
      setAccessToken(null);
      return null;
    } finally {
      hydrating = null;
    }
  })();

  return hydrating;
}

/** Called by lib/api.ts on a 401 — the access token may have simply expired
 * (15 min default) mid-session; one silent refresh attempt before treating
 * the caller as signed out. */
export async function refreshAccessToken(): Promise<string | null> {
  try {
    const response = await fetch("/api/auth/refresh", { method: "POST", cache: "no-store" });
    if (!response.ok) {
      setAccessToken(null);
      return null;
    }
    const data = (await response.json()) as { access_token: string; impersonation_lost?: boolean };
    setAccessToken(data.access_token);
    if (data.impersonation_lost) handleImpersonationLost();
    return data.access_token;
  } catch {
    setAccessToken(null);
    return null;
  }
}

export interface AuthResult {
  access_token: string;
  expires_in: number;
  profile: Me["profile"];
}

async function postAuth<T extends AuthResult = AuthResult>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message =
      parsed && typeof parsed === "object" && "detail" in parsed
        ? String((parsed as { detail: unknown }).detail)
        : `Request failed (${response.status}).`;
    throw new Error(message);
  }
  setAccessToken(parsed.access_token);
  return parsed as T;
}

export function register(email: string, password: string, fullName: string): Promise<AuthResult> {
  return postAuth("/api/auth/register", { email, password, full_name: fullName });
}

export function login(email: string, password: string): Promise<AuthResult> {
  return postAuth("/api/auth/login", { email, password });
}

export function magicLogin(token: string): Promise<AuthResult> {
  return postAuth("/api/auth/magic-login", { token });
}

export interface OAuthResult extends AuthResult {
  is_new_account: boolean;
  next_path: string | null;
}

/** The frontend's own callback page (Google redirects the browser there
 * with ?code&state) calls this once it has both — same shape as
 * magicLogin above, just with the extra is_new_account/next_path fields a
 * password login never has. */
export function oauthCallback(provider: string, code: string, state: string): Promise<OAuthResult> {
  return postAuth<OAuthResult>(`/api/auth/oauth/${provider}/callback`, { code, state });
}

/** Full-page navigation, not a fetch — the browser needs to actually land
 * on Google, which only a top-level navigation can do. Goes straight to
 * the backend (not through a Next.js route) since a redirect chain has no
 * CORS to worry about. */
export function googleSignInUrl(next?: string | null): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const url = new URL(`${base.replace(/\/+$/, "")}/api/v1/auth/oauth/google/start`);
  if (next) url.searchParams.set("next", next);
  return url.toString();
}

export async function logout(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } finally {
    setAccessToken(null);
  }
}

/**
 * Platform-superadmin impersonation. `startImpersonation` swaps the in-memory
 * access token for one scoped to that firm; the caller then does a full-page
 * navigation so the proxy and firm shell re-read the new session. `exit` puts
 * the superadmin back on their own session the same way. Both talk to the
 * BFF route (src/app/api/auth/impersonate) — the cookie work lives there.
 */
export async function startImpersonation(tenantId: string): Promise<{ tenant_name: string }> {
  const response = await fetch("/api/auth/impersonate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenant_id: tenantId }),
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(
      parsed && typeof parsed === "object" && "detail" in parsed
        ? String((parsed as { detail: unknown }).detail)
        : "Could not open that firm.",
    );
  }
  setAccessToken(parsed.access_token);
  return { tenant_name: parsed.tenant_name };
}

export async function exitImpersonation(): Promise<void> {
  try {
    const response = await fetch("/api/auth/impersonate", { method: "DELETE" });
    const text = await response.text();
    const parsed = text ? JSON.parse(text) : null;
    setAccessToken(parsed?.access_token ?? null);
  } catch {
    setAccessToken(null);
  }
}
