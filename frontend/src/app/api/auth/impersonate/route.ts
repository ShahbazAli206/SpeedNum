import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  ACCESS_COOKIE,
  ACT_AS_COOKIE,
  REFRESH_COOKIE_MAX_AGE_SECONDS,
  mintImpersonationToken,
  refreshFromCookie,
} from "@/lib/session-server";

/**
 * Platform-superadmin impersonation, cookie side.
 *
 * POST { tenant_id } — trade the superadmin's own access token for one scoped
 * to that firm and remember the target in a first-party marker cookie so the
 * view survives the 15-minute access-token expiry (session-server.refreshFromCookie
 * re-mints it on every refresh while the marker is set).
 *
 * DELETE — end the impersonation: drop the marker and refresh straight back
 * into the superadmin's own session.
 *
 * The refresh cookie is never touched here; it stays the superadmin's own
 * throughout, which is what makes "exit to platform" a plain refresh.
 */
export async function POST(request: Request) {
  let tenantId: string | undefined;
  try {
    const body = (await request.json()) as { tenant_id?: unknown };
    if (typeof body.tenant_id === "string") tenantId = body.tenant_id;
  } catch {
    // handled below
  }
  if (!tenantId) {
    return NextResponse.json({ detail: "A tenant_id is required." }, { status: 400 });
  }

  const jar = await cookies();
  let bearer = jar.get(ACCESS_COOKIE)?.value;
  if (!bearer) {
    const refreshed = await refreshFromCookie({ ignoreImpersonation: true });
    if (!refreshed.ok) {
      return NextResponse.json({ detail: "Your session has expired. Sign in again." }, { status: 401 });
    }
    bearer = refreshed.accessToken;
  }

  const impersonation = await mintImpersonationToken(bearer, tenantId);
  if (!impersonation) {
    return NextResponse.json(
      { detail: "Could not open that firm. It may have been removed, or your session is no longer a superadmin." },
      { status: 403 },
    );
  }

  jar.set(ACCESS_COOKIE, impersonation.access_token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: impersonation.expires_in,
  });
  jar.set(ACT_AS_COOKIE, tenantId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
  });

  return NextResponse.json({
    ok: true,
    access_token: impersonation.access_token,
    tenant_name: impersonation.tenant_name,
  });
}

export async function DELETE() {
  const jar = await cookies();
  jar.delete(ACT_AS_COOKIE);

  const refreshed = await refreshFromCookie({ ignoreImpersonation: true });
  if (!refreshed.ok) {
    // Marker is cleared regardless; the browser is effectively back on the
    // platform even if this particular refresh needs retrying.
    return NextResponse.json({ ok: true, access_token: null });
  }
  return NextResponse.json({ ok: true, access_token: refreshed.accessToken });
}
