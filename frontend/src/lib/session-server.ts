/**
 * Server-only helpers for the auth BFF (Backend-For-Frontend) routes under
 * src/app/api/auth/*.
 *
 * Why routes exist at all instead of the browser calling the FastAPI backend
 * directly for auth: the backend's refresh-token cookie is scoped to its own
 * domain (test.spidnums.com). A cookie is never readable across origins —
 * not by JavaScript, and not by another origin's server — so Next.js Server
 * Components running on Vercel can never see it directly. These routes run
 * server-side, call the backend themselves, and re-mint the tokens as
 * first-party cookies on *this* domain instead, which both Server Components
 * (via next/headers) and this same browser (on the next same-site request)
 * can then read normally.
 *
 * Client-side *data* calls (lib/api.ts) are unaffected by any of this — an
 * Authorization: Bearer header has no cross-origin cookie restriction, so
 * they keep talking to the backend directly, exactly as before.
 */

const RAW_API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const BACKEND_API_URL = `${RAW_API_BASE.replace(/\/+$/, "")}/api/v1`;

export const ACCESS_COOKIE = "sn_access";
export const REFRESH_COOKIE = "sn_refresh";

// The backend deliberately doesn't return the refresh token's real expiry in
// its JSON body (only via the cookie it sets, matching its own
// REFRESH_TOKEN_TTL_SECONDS default) — this is a reasonable upper bound for
// this cookie's own maxAge. If the two ever drift, the backend's own tracked
// expiry is authoritative either way: a cookie that outlives its backend
// record just fails with 401 on the next refresh attempt, same as any
// expired session.
export const REFRESH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * Pulls a single cookie's value out of a raw Set-Cookie response header.
 * fetch() in a Route Handler does not behave like a browser — it never
 * auto-populates a cookie jar — so the backend's Set-Cookie has to be
 * parsed by hand to re-mint it as a first-party cookie here.
 */
export function extractSetCookieValue(setCookieHeader: string | null, name: string): string | null {
  if (!setCookieHeader) return null;
  // A Response can carry multiple Set-Cookie headers folded into one string
  // by some runtimes (comma-joined) — but commas also appear inside cookie
  // Expires attributes ("Wed, 21 Oct..."), so split on the cookie-name
  // pattern instead of a bare comma.
  const match = setCookieHeader.match(new RegExp(`(?:^|,\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export interface BackendAuthResult {
  access_token: string;
  token_type: string;
  expires_in: number;
  profile: unknown;
}

/** Forwards a request's own cookie header when calling the backend
 * server-to-server — fetch() does not do this automatically. */
export function cookieHeader(name: string, value: string): string {
  return `${name}=${encodeURIComponent(value)}`;
}

/**
 * Shared body for the register/login/magic-login route handlers: call the
 * backend, re-mint its refresh cookie as a first-party one on this domain,
 * and mirror the access token into a short-lived first-party cookie too (so
 * Server Components can read it via next/headers without a network round
 * trip — see api-server.ts). Returns the backend's own response body/status
 * unchanged on failure, so the client sees the exact same error shape it
 * would from calling the backend directly.
 */
export async function proxyAuthAndSetCookies(
  backendPath: string,
  body: string,
): Promise<Response> {
  const { cookies } = await import("next/headers");
  const { NextResponse } = await import("next/server");

  let backendResponse: Response;
  try {
    backendResponse = await fetch(`${BACKEND_API_URL}${backendPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { detail: "Could not reach the authentication service." },
      { status: 502 },
    );
  }

  const text = await backendResponse.text();
  if (!backendResponse.ok) {
    return new NextResponse(text, {
      status: backendResponse.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const refreshToken = extractSetCookieValue(backendResponse.headers.get("set-cookie"), "sn_refresh");
  const parsed = JSON.parse(text) as { access_token: string; expires_in: number };

  const jar = await cookies();
  if (refreshToken) {
    jar.set(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
    });
  }
  jar.set(ACCESS_COOKIE, parsed.access_token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: parsed.expires_in,
  });

  return new NextResponse(text, { status: 200, headers: { "Content-Type": "application/json" } });
}

/**
 * Shared by /api/auth/refresh (explicit client-triggered refresh) and
 * /api/auth/session (page-load bootstrap, when there's no access cookie yet
 * to read directly) — both need "read the refresh cookie, ask the backend
 * for a fresh pair, re-mint both cookies" and nothing else.
 */
export async function refreshFromCookie(): Promise<
  { ok: true; accessToken: string; expiresIn: number } | { ok: false; status: number; body: string }
> {
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  const refreshToken = jar.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    return { ok: false, status: 401, body: JSON.stringify({ detail: "No session to refresh." }) };
  }

  let backendResponse: Response;
  try {
    backendResponse = await fetch(`${BACKEND_API_URL}/auth/refresh`, {
      method: "POST",
      headers: { Cookie: cookieHeader("sn_refresh", refreshToken) },
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      status: 502,
      body: JSON.stringify({ detail: "Could not reach the authentication service." }),
    };
  }

  const text = await backendResponse.text();
  if (!backendResponse.ok) {
    jar.delete(REFRESH_COOKIE);
    jar.delete(ACCESS_COOKIE);
    return { ok: false, status: backendResponse.status, body: text };
  }

  const newRefreshToken = extractSetCookieValue(backendResponse.headers.get("set-cookie"), "sn_refresh");
  const parsed = JSON.parse(text) as { access_token: string; expires_in: number };

  if (newRefreshToken) {
    jar.set(REFRESH_COOKIE, newRefreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
    });
  }
  jar.set(ACCESS_COOKIE, parsed.access_token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: parsed.expires_in,
  });

  return { ok: true, accessToken: parsed.access_token, expiresIn: parsed.expires_in };
}
