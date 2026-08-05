import { ArrowUpRight, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Reveal } from "@/components/reveal";
import { cn } from "@/lib/cn";
import { ButtonLink } from "@/components/ui";

/** Small pill label that sits above a section heading. */
export function Eyebrow({
  children,
  tone = "brand",
  className,
}: {
  children: ReactNode;
  tone?: "brand" | "onDark";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-bold tracking-[0.12em] uppercase",
        tone === "brand"
          ? "bg-brand-soft text-brand"
          : "border border-brand/30 bg-brand/12 text-brand-on-dark",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Centred section heading. `accent` is rendered in the brand colour — the
 * two-tone headline treatment used throughout the marketing pages.
 */
export function SectionHeading({
  eyebrow,
  title,
  accent,
  description,
  align = "center",
  tone = "light",
  className,
}: {
  eyebrow?: string;
  title: string;
  accent?: string;
  description?: string;
  align?: "center" | "left";
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <div
      className={cn(
        align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl",
        className,
      )}
    >
      {eyebrow ? (
        <Reveal>
          <Eyebrow tone={tone === "dark" ? "onDark" : "brand"}>{eyebrow}</Eyebrow>
        </Reveal>
      ) : null}
      <Reveal delay={60}>
        <h2
          className={cn(
            "mt-4 text-3xl leading-[1.12] font-extrabold text-balance sm:text-4xl",
            tone === "dark" ? "text-white" : "text-ink",
          )}
        >
          {title}
          {accent ? <span className="text-brand"> {accent}</span> : null}
        </h2>
      </Reveal>
      {description ? (
        <Reveal delay={120}>
          <p
            className={cn(
              "mt-4 text-[16.5px] leading-relaxed text-pretty",
              tone === "dark" ? "text-white/70" : "text-muted",
            )}
          >
            {description}
          </p>
        </Reveal>
      ) : null}
    </div>
  );
}

/** Standard vertical rhythm + max width for a marketing band. */
export function Section({
  children,
  className,
  id,
  bleed = false,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  /** Skip the max-width wrapper for full-bleed bands. */
  bleed?: boolean;
}) {
  return (
    <section id={id} className={cn("py-18 sm:py-24", className)}>
      {bleed ? children : (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">{children}</div>
      )}
    </section>
  );
}

/** Breadcrumb row used at the top of every interior page. */
export function Breadcrumbs({
  trail,
}: {
  trail: { label: string; href?: string }[];
}) {
  return (
    <nav aria-label="Breadcrumb" className="mb-8">
      <ol className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
        {trail.map((crumb, index) => {
          const last = index === trail.length - 1;
          return (
            <li key={crumb.label} className="flex items-center gap-1.5">
              {crumb.href && !last ? (
                <Link href={crumb.href} className="text-brand transition hover:underline">
                  {crumb.label}
                </Link>
              ) : (
                <span className={last ? "text-ink-soft" : "text-muted"} aria-current={last ? "page" : undefined}>
                  {crumb.label}
                </span>
              )}
              {!last ? <ChevronRight className="size-3.5 text-muted/60" aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** The dark call-to-action band that closes most pages. */
export function CtaBand({
  title = "Start running a tidier, deadline-proof practice.",
  description = "Set up your firm in minutes. No credit card to start.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Section>
      <Reveal>
        <div className="navy-band relative overflow-hidden rounded-3xl px-6 py-16 text-center sm:px-12 sm:py-20">
          <div className="grid-lines-dark pointer-events-none absolute inset-0 opacity-50" aria-hidden />
          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-3xl leading-tight font-extrabold text-balance text-white sm:text-4xl">
              {title}
            </h2>
            <p className="mt-4 text-[16.5px] text-white/70">{description}</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <ButtonLink
                href="/signup"
                size="lg"
                trailingIcon={<ArrowUpRight className="size-4" />}
              >
                Start free trial
              </ButtonLink>
              <ButtonLink href="/request-demo" variant="onDark" size="lg">
                Request a demo
              </ButtonLink>
            </div>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}

/** Card with an arrow affordance, used by the features / blog / case-study grids. */
export function LinkCard({
  href,
  eyebrow,
  title,
  description,
  footer,
  delay = 0,
}: {
  href: string;
  eyebrow?: string;
  title: string;
  description: string;
  footer?: ReactNode;
  delay?: number;
}) {
  return (
    <Reveal delay={delay} className="h-full">
      <Link
        href={href}
        className="group flex h-full flex-col rounded-2xl border border-line bg-surface p-6 transition hover:-translate-y-0.5 hover:border-brand/35 hover:shadow-[var(--shadow-lift)]"
      >
        {eyebrow ? (
          <p className="text-[11px] font-bold tracking-[0.12em] text-brand uppercase">{eyebrow}</p>
        ) : null}
        <h3 className="mt-2.5 text-[17px] leading-snug font-bold text-ink group-hover:text-brand">
          {title}
        </h3>
        <p className="mt-2.5 flex-1 text-[14px] leading-relaxed text-muted">{description}</p>
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
          <span className="text-[12.5px] text-muted">{footer}</span>
          <span className="grid size-7 place-items-center rounded-full bg-surface-2 text-brand transition group-hover:bg-brand group-hover:text-white">
            <ArrowUpRight className="size-3.5" />
          </span>
        </div>
      </Link>
    </Reveal>
  );
}
