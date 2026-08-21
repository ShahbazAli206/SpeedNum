import type { MetadataRoute } from "next";

import { absoluteUrl, marketingRoutes } from "@/lib/seo";

/**
 * The public sitemap — every indexable marketing page, from the single source
 * of truth in lib/seo.ts (so it can't drift from the Reach page's footprint).
 * The signed-in app (firm surface + client portal) is deliberately absent: it's
 * marked noindex and blocked in robots.ts.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return marketingRoutes().map((route) => ({
    url: absoluteUrl(route.path),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
