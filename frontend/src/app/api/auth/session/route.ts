import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ACCESS_COOKIE, refreshFromCookie } from "@/lib/session-server";

/**
 * Called once on app load (see lib/auth-client.ts) to hydrate the in-memory
 * access token a fresh page load starts without — the access cookie is
 * short-lived by design, so this doubles as "refresh if needed" rather than
 * a plain cookie read. Returns 401 with no body assumptions on either "not
 * signed in" or "session expired" — the caller treats both as "not signed
 * in" and falls back to demo data, same as every other lib/api-server.ts
 * failure path.
 */
export async function GET() {
  const jar = await cookies();
  const existing = jar.get(ACCESS_COOKIE)?.value;
  if (existing) {
    return NextResponse.json({ access_token: existing });
  }

  const result = await refreshFromCookie();
  if (!result.ok) {
    return NextResponse.json({ detail: "Not signed in." }, { status: 401 });
  }
  return NextResponse.json({ access_token: result.accessToken });
}
