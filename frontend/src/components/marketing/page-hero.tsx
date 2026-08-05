import type { ReactNode } from "react";

import { Breadcrumbs, Eyebrow } from "@/components/marketing/section";
import { Reveal } from "@/components/reveal";
import { cn } from "@/lib/cn";

/**
 * Shared interior-page hero: breadcrumb, eyebrow, title, lead paragraph, and
 * an optional illustration panel on the right.
 */
export function PageHero({
  trail,
  eyebrow,
  title,
  lead,
  aside,
  children,
}: {
  trail: { label: string; href?: string }[];
  eyebrow: string;
  title: ReactNode;
  lead?: string;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="hero-wash relative overflow-hidden">
      <div className="grid-lines pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative mx-auto max-w-7xl px-4 pt-10 pb-16 sm:px-6 lg:px-8 lg:pt-12 lg:pb-20">
        <Breadcrumbs trail={trail} />

        <div
          className={cn(
            "grid items-center gap-12",
            aside ? "lg:grid-cols-[1.15fr_1fr]" : "",
          )}
        >
          <div>
            <Reveal>
              <Eyebrow>{eyebrow}</Eyebrow>
            </Reveal>
            <Reveal delay={70}>
              <h1 className="mt-5 max-w-2xl text-[2.2rem] leading-[1.1] font-extrabold tracking-tight text-balance text-ink sm:text-5xl">
                {title}
              </h1>
            </Reveal>
            {lead ? (
              <Reveal delay={130}>
                <p className="mt-5 max-w-xl text-[16.5px] leading-relaxed text-pretty text-muted">
                  {lead}
                </p>
              </Reveal>
            ) : null}
            {children}
          </div>

          {aside ? (
            <Reveal delay={160}>
              <div>{aside}</div>
            </Reveal>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/**
 * Stand-in for the office photography the existing site uses. Real imagery can
 * replace this by swapping the component — the aspect ratio is fixed here so
 * dropping a photo in will not shift the layout.
 */
export function HeroArt({
  icon,
  caption,
}: {
  icon: ReactNode;
  caption: string;
}) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-line shadow-[var(--shadow-lift)]">
      <div className="navy-band absolute inset-0" />
      <div className="grid-lines-dark absolute inset-0 opacity-50" aria-hidden />
      <div className="relative flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <span className="grid size-16 place-items-center rounded-2xl border border-white/15 bg-white/8 text-brand-on-dark backdrop-blur-sm">
          {icon}
        </span>
        <p className="max-w-xs text-[14.5px] leading-relaxed text-white/70">{caption}</p>
      </div>
    </div>
  );
}
