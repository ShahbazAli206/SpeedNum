import { Scale } from "lucide-react";

import { Breadcrumbs, Section } from "@/components/marketing/section";
import { Reveal } from "@/components/reveal";
import type { LegalSection } from "@/lib/content/legal";
import { LEGAL_UPDATED } from "@/lib/content/legal";

/**
 * Shared shell for /terms and /privacy: dark hero, sticky contents rail, and
 * the numbered sections. Both pages differ only in their section array.
 */
export function LegalPage({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <>
      <header className="navy-band relative overflow-hidden">
        <div className="grid-lines-dark pointer-events-none absolute inset-0 opacity-50" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <div className="[&_a]:text-brand-on-dark [&_span]:text-white/60">
            <Breadcrumbs trail={[{ label: "Home", href: "/" }, { label: title }]} />
          </div>
          <div className="flex items-center gap-2 text-brand-on-dark">
            <Scale className="size-4" aria-hidden />
            <span className="text-[11.5px] font-bold tracking-[0.16em] uppercase">Legal</span>
          </div>
          <h1 className="mt-4 text-[2.2rem] leading-tight font-extrabold tracking-tight text-white sm:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-white/70">{intro}</p>
          <p className="mt-6 text-[13px] text-white/50">
            Last updated: <strong className="font-semibold text-white/80">{LEGAL_UPDATED}</strong>
          </p>
        </div>
      </header>

      <Section>
        <div className="grid gap-12 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <nav className="lg:sticky lg:top-24 lg:self-start" aria-label="Contents">
            <p className="text-[11.5px] font-bold tracking-[0.14em] text-muted uppercase">
              Contents
            </p>
            <ol className="scroll-thin mt-4 max-h-[60vh] space-y-1 overflow-y-auto pr-2">
              {sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="block rounded-lg px-2.5 py-1.5 text-[13px] leading-snug text-muted transition hover:bg-surface-2 hover:text-ink"
                  >
                    {section.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="prose-legal max-w-none">
            {sections.map((section, index) => (
              <Reveal key={section.id} delay={Math.min(index, 6) * 40}>
                <section id={section.id}>
                  <h2>{section.heading}</h2>
                  {section.paragraphs?.map((paragraph) => (
                    <p key={paragraph.slice(0, 48)}>{paragraph}</p>
                  ))}
                  {section.bullets ? (
                    <ul>
                      {section.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>
    </>
  );
}
