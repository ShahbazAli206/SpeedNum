import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ACCESS_COOKIE, BACKEND_API_URL, REFRESH_COOKIE, cookieHeader } from "@/lib/session-server";

export async function POST() {
  const jar = await cookies();
  const refreshToken = jar.get(REFRESH_COOKIE)?.value;

  if (refreshToken) {
    try {
      await fetch(`${BACKEND_API_URL}/auth/logout`, {
        method: "POST",
        headers: { Cookie: cookieHeader("sn_refresh", refreshToken) },
        cache: "no-store",
      });
    } catch {
      // The backend session is best-effort revoked; clearing this domain's
      // own cookies below is what actually signs the browser out either way.
    }
  }

  jar.delete(REFRESH_COOKIE);
  jar.delete(ACCESS_COOKIE);
  return NextResponse.json({ ok: true, message: "Signed out." });
}
