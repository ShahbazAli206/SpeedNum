import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

function matches(pathname: string, routes: string[]): boolean {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

/**
 * Which app this account belongs to, read straight off the JWT.
 *
 * `profiles.client_id` is the authoritative flag (see backend/app/deps.py), but
 * the proxy has only the token — a database round trip on every request would
 * cost more than it saves. Supabase copies `user_metadata` into the JWT, so the
 * portal-invite flow stamps a `client_id` there and this reads it back.
 *
 * Returns null when the token carries no hint, in which case we leave the user
 * where they asked to go rather than guessing: the page itself calls
 * `GET /auth/me` and can redirect with the real answer. Being permissive here is
 * deliberate — a wrong guess would lock a legitimate user out of their own app.
 */
function accountKind(metadata: Record<string, unknown> | undefined): "firm" | "portal" | null {
  if (!metadata) return null;
  const clientId = metadata.client_id;
  if (typeof clientId === "string" && clientId.length > 0) return "portal";
  if (metadata.is_portal === true) return "portal";
  if (metadata.firm_name || metadata.is_staff === true) return "firm";
  return null;
}

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const { pathname } = request.nextUrl;

  // Without Supabase configured, let every request through rather than locking
  // the whole site out — the pages surface a clear setup message instead.
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Refreshes the session cookie as a side effect — must run on every request.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const needsAuth = matches(pathname, PROTECTED);
  if (needsAuth && !user) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.searchParams.set("next", pathname);
    return NextResponse.redirect(redirect);
  }

  if (user) {
    const kind = accountKind(user.user_metadata);

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

  return response;
}

export const config = {
  matcher: [
    // everything except Next internals, the public folder and file requests
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
