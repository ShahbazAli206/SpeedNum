import type { Metadata } from "next";
import { Clock, LayoutDashboard } from "lucide-react";

import { Icon } from "@/components/icon";
import { HeroArt, PageHero } from "@/components/marketing/page-hero";
import { CtaBand, LinkCard, Section } from "@/components/marketing/section";
import { Reveal } from "@/components/reveal";
import { FEATURES } from "@/lib/content/features";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Everything your practice runs on, in one place",
  description:
    "Fifteen modules that share one client record, one deadline board and one brand — yours. Client CRM, services catalogue, workflow, CRA deadlines, engagement letters, client portal and reporting.",
  alternates: { canonical: "/features" },
};

export default function FeaturesPage() {
  return (
    <>
      <PageHero
        trail={[
          { label: "Home", href: "/" },
          { label: "Everything your practice runs on, in one place" },
        ]}
        eyebrow="Features"
        title="Everything your practice runs on, in one place"
        lead={`Fifteen modules that share one client record, one deadline board and one brand — yours.`}
        aside={
          <HeroArt
            icon={<LayoutDashboard className="size-7" />}
            caption="Every module reads and writes the same client, service and deadline data."
          />
        }
      />

      <Section className="pt-0">
        <Reveal>
          <div className="mx-auto max-w-2xl rounded-2xl border border-brand/25 bg-brand-soft/40 p-7">
            <p className="text-[15.5px] leading-relaxed text-ink-soft">
              {SITE.name} is practice management for Canadian accounting firms:{" "}
              <strong className="font-semibold text-ink">client CRM</strong>,{" "}
              <strong className="font-semibold text-ink">services catalogue</strong>, Task Master,
              CRA-aware reminders, e-signed engagement letters, a branded{" "}
              <strong className="font-semibold text-ink">client portal</strong> and a live SLA
              dashboard — every module reading and writing the same client, service and deadline
              data, white-labelled down to the email footer.
            </p>
            <p className="mt-5 flex items-center gap-1.5 border-t border-brand/20 pt-4 text-[12.5px] text-muted">
              <Clock className="size-3.5" />
              Updated July 2026
            </p>
          </div>
        </Reveal>
      </Section>

      <Section className="bg-surface-2/40 pt-0 pb-20 sm:pb-24">
        <div className="grid gap-5 pt-18 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, index) => (
            <LinkCard
              key={feature.slug}
              href={`/features/${feature.slug}`}
              eyebrow={feature.eyebrow}
              title={feature.title}
              description={feature.tagline}
              delay={(index % 3) * 70}
              footer={
                <span className="inline-flex items-center gap-1.5">
                  <Icon name={feature.icon} className="size-3.5 text-brand" />
                  {feature.navLabel}
                </span>
              }
            />
          ))}
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
