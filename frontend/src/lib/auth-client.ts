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
      const data = (await response.json()) as { access_token: string };
      setAccessToken(data.access_token);
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
    const data = (await response.json()) as { access_token: string };
    setAccessToken(data.access_token);
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
