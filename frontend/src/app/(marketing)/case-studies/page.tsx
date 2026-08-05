import { Info, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { HeroArt, PageHero } from "@/components/marketing/page-hero";
import { CtaBand, Section } from "@/components/marketing/section";
import { Reveal } from "@/components/reveal";
import { CASE_STUDIES, CASE_STUDY_DISCLAIMER } from "@/lib/content/case-studies";

export const metadata: Metadata = {
  title: "Illustrative firm scenarios",
  description:
    "Twelve illustrative scenarios showing how Canadian firm archetypes run their work in SpeedNum. No client data, no quotes, no measured results — workflow only.",
  alternates: { canonical: "/case-studies" },
};

export default function CaseStudiesPage() {
  return (
    <>
      <PageHero
        trail={[{ label: "Home", href: "/" }, { label: "Illustrative firm scenarios" }]}
        eyebrow="Scenarios"
        title="Illustrative firm scenarios"
        lead={`${CASE_STUDIES.length} illustrative scenarios showing how Canadian firm archetypes run their work in SpeedNum. No client data, no quotes, no measured results — workflow only.`}
        aside={
          <HeroArt
            icon={<Users className="size-7" />}
            caption="Archetypes drawn from how Canadian practices actually organise work."
          />
        }
      />

      <Section className="pt-0">
        <Reveal>
          <div className="flex items-start gap-3 rounded-2xl border border-warn/25 bg-warn-soft/50 p-5">
            <Info className="mt-0.5 size-4.5 shrink-0 text-warn" aria-hidden />
            <p className="text-[13.5px] leading-relaxed text-ink-soft">
              {CASE_STUDY_DISCLAIMER}
            </p>
          </div>
        </Reveal>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CASE_STUDIES.map((study, index) => (
            <Reveal key={study.slug} delay={(index % 3) * 70} className="h-full">
              <Link
                href={`/case-studies/${study.slug}`}
                className="group flex h-full flex-col rounded-2xl border border-line bg-surface p-6 transition hover:-translate-y-0.5 hover:border-brand/35 hover:shadow-[var(--shadow-lift)]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10.5px] font-bold tracking-[0.1em] text-brand uppercase">
                    {study.location}
                  </span>
                  <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[9.5px] font-bold tracking-wide text-warn uppercase">
                    Illustrative scenario
                  </span>
                </div>
                <h2 className="mt-3 text-[17px] leading-snug font-bold text-ink group-hover:text-brand">
                  {study.title}
                </h2>
                <p className="mt-2.5 flex-1 text-[14px] leading-relaxed text-muted">
                  {study.summary}
                </p>
                <p className="mt-5 border-t border-line pt-4 text-[12.5px] text-muted">
                  {study.scale}
                </p>
              </Link>
            </Reveal>
          ))}
        </div>
      </Section>

      <CtaBand
        title="See it against your own firm's shape."
        description="A demo works through your services, cadences and client mix — not a generic tour."
      />
    </>
  );
}
