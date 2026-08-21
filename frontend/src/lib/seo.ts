/**
 * Single source of truth for the public, indexable marketing surface.
 *
 * Both `app/sitemap.ts` (what search engines are told about) and the superadmin
 * Reach page's "search footprint" read from here, so the footprint can never
 * claim a page the sitemap doesn't actually publish — the two are the same list,
 * grouped two ways.
 *
 * Isomorphic on purpose: only imports plain content data + SITE, so a Server
 * Component (sitemap) and a Client Component (Reach page) can both use it.
 */

import { CASE_STUDIES } from "./content/case-studies";
import { POSTS } from "./content/blog";
import { FEATURES } from "./content/features";
import { SITE } from "./site";

export interface MarketingRoute {
  path: string;
  tier: string;
  priority: number;
  changeFrequency: "daily" | "weekly" | "monthly" | "yearly";
}

/** Every public page the marketing site publishes, tagged by tier. */
export function marketingRoutes(): MarketingRoute[] {
  const routes: MarketingRoute[] = [
    { path: "/", tier: "Core pages", priority: 1.0, changeFrequency: "weekly" },
    { path: "/pricing", tier: "Core pages", priority: 0.9, changeFrequency: "monthly" },
    { path: "/request-demo", tier: "Core pages", priority: 0.7, changeFrequency: "monthly" },

    { path: "/features", tier: "Product features", priority: 0.8, changeFrequency: "monthly" },
    ...FEATURES.map((f) => ({
      path: `/features/${f.slug}`,
      tier: "Product features",
      priority: 0.7,
      changeFrequency: "monthly" as const,
    })),

    { path: "/blog", tier: "Blog", priority: 0.7, changeFrequency: "weekly" },
    ...POSTS.map((p) => ({
      path: `/blog/${p.slug}`,
      tier: "Blog posts",
      priority: 0.6,
      changeFrequency: "monthly" as const,
    })),

    { path: "/case-studies", tier: "Case studies", priority: 0.7, changeFrequency: "monthly" },
    ...CASE_STUDIES.map((c) => ({
      path: `/case-studies/${c.slug}`,
      tier: "Case studies",
      priority: 0.6,
      changeFrequency: "monthly" as const,
    })),

    { path: "/privacy", tier: "Legal", priority: 0.3, changeFrequency: "yearly" },
    { path: "/terms", tier: "Legal", priority: 0.3, changeFrequency: "yearly" },
  ];
  return routes;
}

export function absoluteUrl(path: string): string {
  return `${SITE.url.replace(/\/+$/, "")}${path}`;
}

export interface FootprintTier {
  tier: string;
  pages: number;
}

/** The marketing routes grouped by tier, in first-seen order — the "search
 *  footprint" table on the Reach page. */
export function searchFootprint(): { tiers: FootprintTier[]; total: number } {
  const counts = new Map<string, number>();
  for (const route of marketingRoutes()) {
    counts.set(route.tier, (counts.get(route.tier) ?? 0) + 1);
  }
  const tiers = [...counts.entries()].map(([tier, pages]) => ({ tier, pages }));
  const total = tiers.reduce((sum, t) => sum + t.pages, 0);
  return { tiers, total };
}
