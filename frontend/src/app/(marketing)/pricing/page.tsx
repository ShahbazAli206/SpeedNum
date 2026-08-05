import { ArrowRight, Check, Minus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CtaBand, Section, SectionHeading } from "@/components/marketing/section";
import { Reveal } from "@/components/reveal";
import { ButtonLink } from "@/components/ui";
import { FEATURES } from "@/lib/content/features";
import { PRICING, SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Pricing — one plan, everything included",
  description: `Every firm gets the whole ${SITE.name} platform for a flat $${PRICING.annual.toLocaleString("en-CA")} ${PRICING.currency} per year. No tiers, no per-seat maths, unlimited clients and team members.`,
  alternates: { canonical: "/pricing" },
};

const FAQS = [
  {
    q: "Is it really one price for everything?",
    a: "Yes. Every module ships on the single plan — client CRM, workflow, deadlines, engagement letters, the client portal, reporting and white-label branding. There is no feature gating and no upsell tier.",
  },
  {
    q: "What counts as a seat?",
    a: "Nothing does. Team members are unlimited, and client-portal users are not seats at all. A five-person firm and a twenty-person firm pay the same.",
  },
  {
    q: "How does the free trial work?",
    a: `You get ${PRICING.trialDays} days with the full platform and no credit card. Import your real client book with the CSV/XLSX template rather than testing on five dummy records — that is the only way to know whether it fits.`,
  },
  {
    q: "What happens to my data if I leave?",
    a: "You export it. The full client book comes out as CSV or XLSX at any time, and after termination the export stays available for 30 days. There is no retention hostage-taking.",
  },
  {
    q: "Do you offer white-label reselling?",
    a: "Yes — one deployment can host many firms, each isolated and branded as its own. Reseller terms are separate from the standard plan; get in touch and we will scope it.",
  },
  {
    q: "Where is the data hosted?",
    a: "Postgres in ca-central-1, with backups also in Canada. Tenant isolation is enforced by row-level security in the database, not only by the application.",
  },
];

/** Included on the single plan vs. what firms usually cobble together instead. */
const COMPARISON = [
  { capability: "Client CRM with contacts and fiscal year-ends", included: true, alt: "Spreadsheet" },
  { capability: "Services catalogue with recurring cadence", included: true, alt: "Fee schedule doc" },
  { capability: "CRA-aware deadline generation", included: true, alt: "Shared calendar" },
  { capability: "Weekend & statutory holiday roll-forward", included: true, alt: false },
  { capability: "Task Master — table and Kanban", included: true, alt: "Separate PM tool" },
  { capability: "Engagement letters with e-signature", included: true, alt: "Separate e-sign tool" },
  { capability: "Branded client portal", included: true, alt: "Email + shared drive" },
  { capability: "Live workload and capacity per person", included: true, alt: false },
  { capability: "Practice reporting from live records", included: true, alt: false },
  { capability: "White-label branding and custom domain", included: true, alt: false },
  { capability: "CSV/XLSX import and full export", included: true, alt: "Manual re-keying" },
  { capability: "Canadian data residency & audit log", included: true, alt: false },
];

export default function PricingPage() {
  return (
    <>
      <Section className="hero-wash relative overflow-hidden pt-16">
        <div className="grid-lines pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative">
          <SectionHeading
            eyebrow="Pricing"
            title="One plan. Everything included, one"
            accent="simple price."
            description="No tiers, no per-seat maths. Every firm gets the whole platform for a flat annual fee."
          />

          <Reveal delay={120}>
            <div className="relative mx-auto mt-14 max-w-md">
              <span className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-brand px-3 py-1 text-[10.5px] font-bold tracking-[0.1em] text-white uppercase">
                Everything included
              </span>
              <div className="rounded-2xl border-2 border-brand bg-surface p-8 shadow-[var(--shadow-lift)]">
                <h2 className="text-lg font-bold text-ink">{SITE.name} — full platform</h2>
                <p className="mt-1 text-[13.5px] text-muted">
                  For accounting firms that want it all, from day one.
                </p>

                <p className="mt-6 flex items-baseline gap-2">
                  <span className="font-display text-5xl font-extrabold text-ink">
                    ${PRICING.annual.toLocaleString("en-CA")}
                  </span>
                  <span className="text-[13px] text-muted">{PRICING.currency} / year</span>
                </p>
                <p className="mt-1 text-[13px] text-muted">
                  Billed annually · about{" "}
                  <strong className="font-semibold text-ink">
                    ${PRICING.monthlyEquivalent}/month
                  </strong>
                </p>

                <ButtonLink
                  href="/signup"
                  size="lg"
                  className="mt-6 w-full"
                  trailingIcon={<ArrowRight className="size-4" />}
                >
                  Start free trial
                </ButtonLink>
                <p className="mt-2.5 text-center text-[12.5px] text-muted">
                  {PRICING.trialDays}-day trial · no credit card required
                </p>

                <ul className="mt-7 space-y-3 border-t border-line pt-6">
                  {PRICING.includes.map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 size-4 shrink-0 text-brand" />
                      <span className="text-[14px] text-ink-soft">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <p className="mt-5 text-center text-[13.5px] text-muted">
                Reselling {SITE.name} to many firms under your own brand?{" "}
                <Link href="/request-demo" className="font-semibold text-brand hover:underline">
                  Talk to us about white-label
                </Link>
              </p>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* What's included */}
      <Section className="bg-surface-2/40">
        <SectionHeading
          eyebrow="What you get"
          title="Included on the"
          accent="one plan."
          description="Everything below ships to every firm. The right-hand column is what practices typically stitch together instead."
        />

        <Reveal delay={100}>
          <div className="mx-auto mt-12 max-w-3xl overflow-hidden rounded-2xl border border-line bg-surface">
            <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-line bg-surface-2/60 px-5 py-3 text-[11.5px] font-bold tracking-wide text-muted uppercase">
              <span>Capability</span>
              <span className="w-24 text-center">{SITE.name}</span>
              <span className="w-32 text-center">Typical stack</span>
            </div>
            <ul>
              {COMPARISON.map((row) => (
                <li
                  key={row.capability}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-line px-5 py-3 last:border-b-0"
                >
                  <span className="text-[14px] text-ink-soft">{row.capability}</span>
                  <span className="flex w-24 justify-center">
                    <Check className="size-4.5 text-brand" aria-label="Included" />
                  </span>
                  <span className="w-32 text-center text-[12.5px] text-muted">
                    {row.alt === false ? (
                      <Minus className="mx-auto size-4 text-muted/50" aria-label="Not typically available" />
                    ) : (
                      row.alt
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        <Reveal delay={160}>
          <p className="mt-6 text-center text-[13.5px] text-muted">
            {FEATURES.length} modules in total —{" "}
            <Link href="/features" className="font-semibold text-brand hover:underline">
              see the full list
            </Link>
          </p>
        </Reveal>
      </Section>

      {/* FAQ */}
      <Section>
        <SectionHeading eyebrow="Questions" title="Before you" accent="sign up." />

        <div className="mx-auto mt-12 max-w-3xl space-y-3">
          {FAQS.map((faq, index) => (
            <Reveal key={faq.q} delay={index * 50}>
              <details className="group rounded-xl border border-line bg-surface px-5 open:border-brand/30">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[15.5px] font-semibold text-ink marker:hidden">
                  {faq.q}
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-muted transition group-open:rotate-45 group-open:bg-brand group-open:text-white">
                    <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
                      <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </span>
                </summary>
                <p className="pb-5 text-[14.5px] leading-relaxed text-muted">{faq.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
