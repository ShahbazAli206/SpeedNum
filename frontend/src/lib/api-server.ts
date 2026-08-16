/**
 * Server Component data fetching.
 *
 * `api.ts` is "use client" — it reads the bearer token from the in-memory
 * client-side store, which doesn't exist during server rendering. This is
 * the Server Component equivalent: it reads the short-lived `sn_access`
 * cookie a Route Handler under src/app/api/auth/* already minted as a
 * first-party cookie on this same domain (see lib/session-server.ts for why
 * that indirection exists — the backend's own cookie is cross-origin and
 * therefore invisible here).
 *
 * Returns `null` on any failure — no backend configured, no session, a
 * network error, a non-2xx response — rather than throwing. That lets every
 * caller fall back to its `lib/demo.ts` / `lib/firm-demo.ts` getter:
 *
 *   const live = await apiServer<Client[]>("/clients");
 *   const clients = live ?? getClients();
 *
 * So a page never breaks: it shows real data once the backend is
 * configured and reachable, and the working demo otherwise. Deliberately
 * NOT exported for client components — they already have `api()` in `api.ts`.
 */

import { cookies } from "next/headers";

import { AUTH_CONFIGURED } from "./auth";
import { ACCESS_COOKIE } from "./session-server";

const RAW_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const API_URL = `${RAW_BASE.replace(/\/+$/, "")}/api/v1`;

export async function apiServer<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (!AUTH_CONFIGURED) return null;

  try {
    const jar = await cookies();
    const token = jar.get(ACCESS_COOKIE)?.value;
    if (!token) return null;

    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) return null;

    return (await response.json()) as T;
  } catch {
    return null;
  }
}
