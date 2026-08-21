import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/seo";

/**
 * Crawl the marketing site; keep the signed-in app and API out of the index.
 * The app routes already render noindex via their layouts — this is the
 * belt-and-braces at the crawler level, and points bots at the sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin",
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
          "/dashboard",
          "/login",
          "/signup",
          "/reset-password",
          "/forgot-password",
          "/verify-email",
          "/portal-login",
          "/oauth",
        ],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl(""),
  };
}
