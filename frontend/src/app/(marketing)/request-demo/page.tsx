import { CalendarCheck, Phone, ShieldCheck, Users } from "lucide-react";
import type { Metadata } from "next";

import { Eyebrow, Section } from "@/components/marketing/section";
import { Reveal } from "@/components/reveal";
import { PRIMARY_PHONE, SITE } from "@/lib/site";

import { DemoForm } from "./demo-form";

export const metadata: Metadata = {
  title: "Request a demo",
  description: `Tell us how your practice works. We'll shape the conversation around your team, recurring services, client requests and Canadian deadlines.`,
  alternates: { canonical: "/request-demo" },
};

const POINTS = [
  {
    icon: CalendarCheck,
    title: "See your workflows",
    body: "We focus the session on the client work, deadlines and handoffs your firm manages — not a generic feature tour.",
  },
  {
    icon: Users,
    title: "Bring your team",
    body: "Invite the partners, managers or administrators who will evaluate the process. More questions is better.",
  },
  {
    icon: ShieldCheck,
    title: "No hard sell",
    body: "Get direct answers about configuration, security, onboarding and fit. If it isn't a fit, we'll say so.",
  },
];

export default function RequestDemoPage() {
  return (
    <Section className="hero-wash relative overflow-hidden pt-14">
      <div className="grid-lines pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative grid items-start gap-14 lg:grid-cols-[1fr_1fr]">
        <div>
          <Reveal>
            <Eyebrow>Tailored product tour</Eyebrow>
          </Reveal>
          <Reveal delay={70}>
            <h1 className="mt-5 text-[2.2rem] leading-[1.1] font-extrabold tracking-tight text-balance text-ink sm:text-5xl">
              Request a {SITE.name} demo
            </h1>
          </Reveal>
          <Reveal delay={130}>
            <p className="mt-5 max-w-lg text-[16.5px] leading-relaxed text-pretty text-muted">
              Tell us how your practice works. We&apos;ll shape the conversation around your team,
              recurring services, client requests and Canadian deadlines.
            </p>
          </Reveal>

          <div className="mt-10 space-y-6">
            {POINTS.map((point, index) => (
              <Reveal key={point.title} delay={190 + index * 70}>
                <div className="flex gap-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                    <point.icon className="size-4.5" />
                  </span>
                  <div>
                    <p className="text-[15.5px] font-bold text-ink">{point.title}</p>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{point.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={420}>
            <div className="mt-10 rounded-2xl border border-line bg-surface p-5">
              <p className="text-[12.5px] font-semibold tracking-wide text-muted uppercase">
                Prefer to talk now?
              </p>
              <a
                href={`tel:${PRIMARY_PHONE.replace(/[^+\d]/g, "")}`}
                className="mt-2 inline-flex items-center gap-2 text-lg font-bold text-ink transition hover:text-brand"
              >
                <Phone className="size-4 text-brand" />
                {PRIMARY_PHONE}
              </a>
              <p className="mt-1.5 text-[13px] text-muted">
                {SITE.address.city}, {SITE.address.province} · Canadian business hours
              </p>
            </div>
          </Reveal>
        </div>

        <Reveal delay={160}>
          <DemoForm />
        </Reveal>
      </div>
    </Section>
  );
}
