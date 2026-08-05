import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Routes that require a signed-in user.
 *
 * `/dashboard` is the client portal; the rest are the firm-side app under
 * `src/app/(firm)/`. Keep this in sync with FIRM_NAV in `src/lib/site.ts`.
 */
const PROTECTED = [
  "/dashboard",
  "/overview",
  "/clients",
  "/workflows",
  "/deadlines",
  "/services",
  "/engagements",
  "/team",
  "/reporting",
  "/notifications",
  "/settings",
  "/custom-fields",
  "/import",
  "/admin",
  "/onboarding",
];

/** Routes a signed-in user should not see. */
const AUTH_ONLY = ["/login", "/signup"];

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

  const needsAuth = PROTECTED.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  if (needsAuth && !user) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.searchParams.set("next", pathname);
    return NextResponse.redirect(redirect);
  }

  if (user && AUTH_ONLY.includes(pathname)) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/dashboard";
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  matcher: [
    // everything except Next internals, the public folder and file requests
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
