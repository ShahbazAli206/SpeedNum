import { NextResponse } from "next/server";

import { refreshFromCookie } from "@/lib/session-server";

/**
 * Reads this domain's own first-party refresh cookie rather than the
 * request body — there is nothing else for the client to send. Exists so
 * Client Components (lib/api.ts's in-memory access token) and Server
 * Components (api-server.ts's cookie read) both have a way to mint a fresh
 * access token without ever holding the refresh token themselves.
 */
export async function POST() {
  const result = await refreshFromCookie();
  if (!result.ok) {
    return new NextResponse(result.body, { status: result.status, headers: { "Content-Type": "application/json" } });
  }
  return NextResponse.json({ access_token: result.accessToken, expires_in: result.expiresIn });
}
