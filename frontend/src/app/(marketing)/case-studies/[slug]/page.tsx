import { ArrowRight, Check, Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Icon } from "@/components/icon";
import { HeroArt, PageHero } from "@/components/marketing/page-hero";
import { CtaBand, Section } from "@/components/marketing/section";
import { Reveal } from "@/components/reveal";
import {
  CASE_STUDIES,
  CASE_STUDY_BY_SLUG,
  CASE_STUDY_DISCLAIMER,
} from "@/lib/content/case-studies";
import { FEATURE_BY_SLUG } from "@/lib/content/features";

export function generateStaticParams() {
  return CASE_STUDIES.map((study) => ({ slug: study.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/case-studies/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const study = CASE_STUDY_BY_SLUG.get(slug);
  if (!study) return { title: "Scenario not found" };

  return {
    title: `${study.title} — illustrative scenario`,
    description: study.summary,
    alternates: { canonical: `/case-studies/${study.slug}` },
  };
}

export default async function CaseStudyPage({ params }: PageProps<"/case-studies/[slug]">) {
  const { slug } = await params;
  const study = CASE_STUDY_BY_SLUG.get(slug);
  if (!study) notFound();

  const modules = study.modules
    .map((moduleSlug) => FEATURE_BY_SLUG.get(moduleSlug))
    .filter((entry) => entry !== undefined);

  return (
    <>
      <PageHero
        trail={[
          { label: "Home", href: "/" },
          { label: "Case studies", href: "/case-studies" },
          { label: study.location },
        ]}
        eyebrow={study.location}
        title={study.title}
        lead={study.summary}
        aside={
          <HeroArt
            icon={<Icon name={modules[0]?.icon ?? "users"} className="size-7" />}
            caption={study.scale}
          />
        }
      />

      <Section className="pt-0">
        <Reveal>
          <div className="mx-auto flex max-w-3xl items-start gap-3 rounded-2xl border border-warn/25 bg-warn-soft/50 p-5">
            <Info className="mt-0.5 size-4.5 shrink-0 text-warn" aria-hidden />
            <p className="text-[13.5px] leading-relaxed text-ink-soft">{CASE_STUDY_DISCLAIMER}</p>
          </div>
        </Reveal>
      </Section>

      <Section className="pt-0">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <h2 className="text-2xl font-extrabold text-ink">The situation</h2>
          </Reveal>
          {study.challenge.map((paragraph, index) => (
            <Reveal key={paragraph.slice(0, 40)} delay={60 + index * 50}>
              <p className="mt-4 text-[16px] leading-relaxed text-muted">{paragraph}</p>
            </Reveal>
          ))}

          <Reveal delay={180}>
            <h2 className="mt-14 text-2xl font-extrabold text-ink">How the workflow fits</h2>
          </Reveal>
          <div className="mt-6 space-y-4">
            {study.approach.map((item, index) => (
              <Reveal key={item.heading} delay={220 + index * 60}>
                <div className="rounded-2xl border border-line bg-surface p-6">
                  <div className="flex items-start gap-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-[12px] font-bold text-brand">
                      {index + 1}
                    </span>
                    <div>
                      <h3 className="text-[16px] font-bold text-ink">{item.heading}</h3>
                      <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{item.body}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={400}>
            <h2 className="mt-14 text-2xl font-extrabold text-ink">What changes day-to-day</h2>
          </Reveal>
          <ul className="mt-6 space-y-3.5">
            {study.dayToDay.map((item, index) => (
              <Reveal key={item} delay={440 + index * 50}>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
                    <Check className="size-3" />
                  </span>
                  <span className="text-[15px] leading-relaxed text-ink-soft">{item}</span>
                </li>
              </Reveal>
            ))}
          </ul>
        </div>
      </Section>

      <Section className="bg-surface-2/40">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <h2 className="text-xl font-extrabold text-ink">Modules this scenario leans on</h2>
          </Reveal>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {modules.map((item, index) => (
              <Reveal key={item.slug} delay={index * 60}>
                <Link
                  href={`/features/${item.slug}`}
                  className="group flex h-full items-start gap-3 rounded-2xl border border-line bg-surface p-5 transition hover:border-brand/35 hover:shadow-[var(--shadow-lift)]"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                    <Icon name={item.icon} className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14.5px] font-bold text-ink group-hover:text-brand">
                      {item.navLabel}
                    </span>
                    <span className="mt-1 block text-[13px] leading-relaxed text-muted">
                      {item.tagline}
                    </span>
                  </span>
                  <ArrowRight className="mt-1 size-4 shrink-0 text-brand opacity-0 transition group-hover:opacity-100" />
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
