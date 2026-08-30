import { NextResponse, type NextRequest } from "next/server";

import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/session-server";

/**
 * Routes that require a signed-in user.
 *
 * `/dashboard` is the client portal; the rest are the firm-side app under
 * `src/app/(firm)/`. Keep this in sync with FIRM_NAV in `src/lib/site.ts`.
 *
 * Every entry must have a page behind it. `/onboarding` was listed here without
 * one, so the guard sent a signed-out visitor through login only to land them
 * on a 404; onboarding is covered by /clients, /import and /engagements instead.
 */
const FIRM_ROUTES = [
  "/overview",
  "/billing",
  "/clients",
  "/workflows",
  "/deadlines",
  "/reminders",
  "/services",
  "/engagements",
  "/team",
  "/users",
  "/reporting",
  "/notifications",
  "/integrations",
  "/settings",
  "/custom-fields",
  "/import",
  "/admin",
];

const PROTECTED = ["/dashboard", ...FIRM_ROUTES];

/** Routes a signed-in user should not see. */
const AUTH_ONLY = ["/login", "/signup"];

/** Where each kind of account belongs after signing in. */
const FIRM_HOME = "/overview";
const PORTAL_HOME = "/dashboard";
/** A superadmin who owns no firm of their own — see components/firm/shell.tsx's
 *  isProviderOnly — has nothing real on /overview, only empty/demo fixtures. */
const PROVIDER_HOME = "/admin";

function matches(pathname: string, routes: string[]): boolean {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

/**
 * Which app this account belongs to, read straight off the access token —
 * unverified (a plain base64url decode, no signature check). That's
 * deliberate, not an oversight: this value only ever picks which shell to
 * redirect to, never an authorization decision (every API call re-verifies
 * the token's signature server-side regardless), and Edge middleware
 * shouldn't need a JWT library or a network round trip just for a UX hint.
 *
 * Returns null when the cookie is absent or carries no hint, in which case
 * we leave the user where they asked to go rather than guessing: the page
 * itself calls `GET /auth/me` and can redirect with the real answer. Being
 * permissive here is deliberate — a wrong guess would lock a legitimate
 * user out of their own app.
 */
function accountKindFromAccessToken(token: string | undefined): "firm" | "portal" | "provider" | null {
  if (!token) return null;
  try {
    const payloadSegment = token.split(".")[1];
    if (!payloadSegment) return null;
    const base64 = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64);
    const payload = JSON.parse(json) as { user_metadata?: Record<string, unknown> };
    const metadata = payload.user_metadata;
    if (!metadata) return null;
    const clientId = metadata.client_id;
    if (typeof clientId === "string" && clientId.length > 0) return "portal";
    if (metadata.is_portal === true) return "portal";
    if (metadata.is_staff === true) {
      // A staff login with no tenant_id at all is the pure platform-provider
      // account (superadmin owning no firm of its own) — see
      // components/firm/shell.tsx's isProviderOnly for the matching nav
      // filter. A superadmin who also owns a firm still has tenant_id set,
      // so they land on FIRM_HOME like any other owner, unaffected.
      return metadata.tenant_id ? "firm" : "provider";
    }
    return null;
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!process.env.NEXT_PUBLIC_API_URL) {
    // No backend configured — demo mode, let every request through rather
    // than locking the whole site out; pages surface a clear setup message.
    return NextResponse.next();
  }

  // Presence of the long-lived refresh cookie is the "probably signed in"
  // signal, not the short-lived access cookie — the access token can be
  // legitimately absent for up to its own TTL between refreshes without the
  // user actually being signed out; the API is what re-verifies for real.
  const signedIn = Boolean(request.cookies.get(REFRESH_COOKIE)?.value);

  const needsAuth = matches(pathname, PROTECTED);
  if (needsAuth && !signedIn) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.searchParams.set("next", pathname);
    return NextResponse.redirect(redirect);
  }

  if (signedIn) {
    const kind = accountKindFromAccessToken(request.cookies.get(ACCESS_COOKIE)?.value);

    // Leaving /login or /signup: send them to their own home, not always the
    // client portal. `?next=` from the redirect above wins, so a deep link
    // survives the sign-in detour.
    if (AUTH_ONLY.includes(pathname)) {
      const requested = request.nextUrl.searchParams.get("next");
      const redirect = request.nextUrl.clone();
      redirect.search = "";
      redirect.pathname =
        requested && requested.startsWith("/")
          ? requested
          : kind === "portal"
            ? PORTAL_HOME
            : kind === "provider"
              ? PROVIDER_HOME
              : FIRM_HOME;
      return NextResponse.redirect(redirect);
    }

    // A client-portal login has no business on the firm surface. The API refuses
    // it anyway (deps.get_tenant_user returns 403), so without this the user
    // would land on a page of permission errors instead of their dashboard.
    if (kind === "portal" && matches(pathname, FIRM_ROUTES)) {
      const redirect = request.nextUrl.clone();
      redirect.pathname = PORTAL_HOME;
      redirect.search = "";
      return NextResponse.redirect(redirect);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // everything except Next internals, the public folder and file requests
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
