import { ArrowRight, Check, CircleCheck, Clock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Icon } from "@/components/icon";
import { HeroArt, PageHero } from "@/components/marketing/page-hero";
import { CtaBand, Section } from "@/components/marketing/section";
import { Reveal } from "@/components/reveal";
import { FEATURES, FEATURE_BY_SLUG } from "@/lib/content/features";

export function generateStaticParams() {
  return FEATURES.map((feature) => ({ slug: feature.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/features/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const feature = FEATURE_BY_SLUG.get(slug);
  if (!feature) return { title: "Feature not found" };

  return {
    title: feature.title,
    description: `${feature.tagline}. ${feature.intro}`,
    alternates: { canonical: `/features/${feature.slug}` },
    openGraph: {
      title: feature.title,
      description: feature.tagline,
      type: "article",
    },
  };
}

export default async function FeaturePage({ params }: PageProps<"/features/[slug]">) {
  const { slug } = await params;
  const feature = FEATURE_BY_SLUG.get(slug);
  if (!feature) notFound();

  const related = FEATURES.filter((item) => item.slug !== feature.slug).slice(0, 3);

  return (
    <>
      <PageHero
        trail={[
          { label: "Home", href: "/" },
          { label: "Features", href: "/features" },
          { label: feature.eyebrow },
        ]}
        eyebrow={feature.eyebrow}
        title={feature.title}
        lead={feature.intro}
        aside={
          <HeroArt
            icon={<Icon name={feature.icon} className="size-7" />}
            caption={feature.tagline}
          />
        }
      />

      {/* Three benefit cards */}
      <Section className="bg-surface-2/40 py-14 sm:py-16">
        <div className="grid gap-5 lg:grid-cols-3">
          {feature.highlights.map((highlight, index) => (
            <Reveal key={highlight.title} delay={index * 70}>
              <div className="h-full rounded-2xl border border-line bg-surface p-6">
                <CircleCheck className="size-5 text-brand" aria-hidden />
                <h2 className="mt-4 text-[16px] leading-snug font-bold text-ink">
                  {highlight.title}
                </h2>
                <p className="mt-2.5 text-[14px] leading-relaxed text-muted">{highlight.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* Narrative sections */}
      <Section>
        <div className="mx-auto max-w-3xl">
          {feature.sections.map((section, index) => (
            <Reveal key={section.heading} delay={index * 60}>
              <div className={index > 0 ? "mt-14" : ""}>
                <h2 className="text-2xl font-extrabold text-balance text-ink">
                  {section.heading}
                </h2>
                {section.paragraphs.map((paragraph) => (
                  <p
                    key={paragraph.slice(0, 48)}
                    className="mt-4 text-[16px] leading-relaxed text-muted"
                  >
                    {paragraph}
                  </p>
                ))}
                {section.bullets ? (
                  <ul className="mt-5 space-y-2.5">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-3">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
                        <span className="text-[15px] leading-relaxed text-ink-soft">{bullet}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* What ships */}
      <Section className="bg-surface-2/40">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <h2 className="text-2xl font-extrabold text-ink">What ships in the module</h2>
          </Reveal>
          <ul className="mt-7 space-y-3.5">
            {feature.ships.map((item, index) => (
              <Reveal key={item} delay={index * 50}>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
                    <Check className="size-3" />
                  </span>
                  <span className="text-[15px] leading-relaxed text-ink-soft">{item}</span>
                </li>
              </Reveal>
            ))}
          </ul>
          <Reveal delay={260}>
            <p className="mt-8 flex items-center gap-1.5 border-t border-line pt-5 text-[12.5px] text-muted">
              <Clock className="size-3.5" />
              Updated July 2026
            </p>
          </Reveal>
        </div>
      </Section>

      {/* Related modules */}
      <Section>
        <Reveal>
          <h2 className="text-xl font-extrabold text-ink">Related modules</h2>
        </Reveal>
        <div className="mt-6 grid gap-5 sm:grid-cols-3">
          {related.map((item, index) => (
            <Reveal key={item.slug} delay={index * 70}>
              <Link
                href={`/features/${item.slug}`}
                className="group flex h-full flex-col rounded-2xl border border-line bg-surface p-6 transition hover:-translate-y-0.5 hover:border-brand/35 hover:shadow-[var(--shadow-lift)]"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
                  <Icon name={item.icon} className="size-4.5" />
                </span>
                <h3 className="mt-4 text-[15.5px] font-bold text-ink group-hover:text-brand">
                  {item.navLabel}
                </h3>
                <p className="mt-2 flex-1 text-[13.5px] leading-relaxed text-muted">
                  {item.tagline}
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand">
                  Read more
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
