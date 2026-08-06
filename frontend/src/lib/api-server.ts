/**
 * Server Component data fetching.
 *
 * `api.ts` is "use client" — it reads the bearer token via `supabaseBrowser()`,
 * which doesn't exist during server rendering. This is the Server Component
 * equivalent: it pulls the token from the cookie-backed session via
 * `supabaseServer()` instead.
 *
 * Returns `null` on any failure — no Supabase configured, no session, a
 * network error, a non-2xx response — rather than throwing. That lets every
 * caller fall back to its `lib/demo.ts` / `lib/firm-demo.ts` getter:
 *
 *   const live = await apiServer<Client[]>("/clients");
 *   const clients = live ?? getClients();
 *
 * So a page never breaks: it shows real data once Supabase is configured,
 * migrated, and populated, and the working demo otherwise. It is deliberately
 * NOT exported for client components — they already have `api()` in `api.ts`.
 */

import { SUPABASE_CONFIGURED } from "./auth";
import { supabaseServer } from "./supabase/server";

const RAW_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const API_URL = `${RAW_BASE.replace(/\/+$/, "")}/api/v1`;

export async function apiServer<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (!SUPABASE_CONFIGURED) return null;

  try {
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
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
