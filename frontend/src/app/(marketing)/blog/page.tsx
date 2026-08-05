import { BookOpen } from "lucide-react";
import type { Metadata } from "next";

import { HeroArt, PageHero } from "@/components/marketing/page-hero";
import { CtaBand, LinkCard, Section } from "@/components/marketing/section";
import { POSTS_SORTED } from "@/lib/content/blog";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: `The ${SITE.name} blog`,
  description:
    "Practical writing for Canadian accounting firms: CRA deadlines, workflow, pricing, capacity planning and the systems that keep a practice from missing a date.",
  alternates: { canonical: "/blog" },
};

export default function BlogPage() {
  return (
    <>
      <PageHero
        trail={[{ label: "Home", href: "/" }, { label: `The ${SITE.name} blog` }]}
        eyebrow="Resources"
        title={`The ${SITE.name} blog`}
        lead="Practical writing for Canadian accounting firms: CRA deadlines, workflow, pricing, capacity planning and the systems that keep a practice from missing a date."
        aside={
          <HeroArt
            icon={<BookOpen className="size-7" />}
            caption="Written for practitioners, not for search engines."
          />
        }
      />

      <Section className="pt-0">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-2xl font-extrabold text-ink">Latest posts</h2>
          <p className="text-[13px] text-muted">
            {POSTS_SORTED.length} posts for Canadian accounting firms
          </p>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {POSTS_SORTED.map((post, index) => (
            <LinkCard
              key={post.slug}
              href={`/blog/${post.slug}`}
              eyebrow={post.category}
              title={post.title}
              description={post.excerpt}
              delay={(index % 3) * 70}
              footer={`${post.date} · ${post.readMinutes} min read`}
            />
          ))}
        </div>
      </Section>

      <CtaBand
        title="Reading about it is the easy part."
        description="See how the deadline board, letters and portal actually behave with your own client book."
      />
    </>
  );
}
