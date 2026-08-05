"use client";

import { ArrowRight, ArrowUpRight, ChevronDown, Menu, Phone, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/icon";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { ButtonLink, cn } from "@/components/ui";
import { PRIMARY_FEATURES } from "@/lib/content/features";
import { MAIN_NAV, PRIMARY_PHONE } from "@/lib/site";

export function Header() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const featuresRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Route change closes anything left open. Handling this in link onClick
  // would miss browser back/forward, which is exactly when a stale open menu
  // is most jarring — so it keys off the router's pathname instead.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMenuOpen(false);
    setFeaturesOpen(false);
  }, [pathname]);

  // The header gains a border and blur once the page moves.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Escape closes the dropdown; a click outside does too.
  useEffect(() => {
    if (!featuresOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFeaturesOpen(false);
    };
    const onClick = (event: MouseEvent) => {
      if (!featuresRef.current?.contains(event.target as Node)) setFeaturesOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [featuresOpen]);

  // Body scroll lock while the mobile sheet is open.
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  /** A small hover delay stops the menu snapping shut crossing the gap to it. */
  const openFeatures = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setFeaturesOpen(true);
  };
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setFeaturesOpen(false), 140);
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition",
        scrolled
          ? "border-b border-line bg-surface/85 backdrop-blur-md"
          : "border-b border-transparent bg-surface/60 backdrop-blur-sm",
      )}
    >
      <div className="mx-auto flex h-17 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Logo size={32} />

        <nav className="ml-6 hidden items-center gap-0.5 lg:flex" aria-label="Main">
          <div
            ref={featuresRef}
            className="relative"
            onMouseEnter={openFeatures}
            onMouseLeave={scheduleClose}
          >
            <button
              type="button"
              onClick={() => setFeaturesOpen((open) => !open)}
              aria-expanded={featuresOpen}
              aria-haspopup="true"
              className={cn(
                "flex items-center gap-1 rounded-lg px-3 py-2 text-[14.5px] font-medium transition",
                pathname.startsWith("/features")
                  ? "text-brand"
                  : "text-ink-soft hover:text-ink",
              )}
            >
              Features
              <ChevronDown
                className={cn("size-4 transition-transform", featuresOpen && "rotate-180")}
              />
            </button>

            {featuresOpen ? (
              <div className="animate-in absolute top-full left-0 pt-2">
                <div className="w-[26rem] overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-float)]">
                  <ul className="p-2">
                    {PRIMARY_FEATURES.map((feature) => (
                      <li key={feature.slug}>
                        <Link
                          href={`/features/${feature.slug}`}
                          className="group flex items-start gap-3 rounded-xl px-3 py-2.5 transition hover:bg-surface-2"
                        >
                          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                            <Icon name={feature.icon} className="size-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[14px] font-semibold text-ink">
                              {feature.navLabel}
                            </span>
                            <span className="block truncate text-[12.5px] text-muted">
                              {feature.tagline}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/features"
                    className="flex items-center justify-between gap-2 border-t border-line bg-surface-2/60 px-5 py-3.5 transition hover:bg-surface-2"
                  >
                    <span>
                      <span className="block text-[14px] font-semibold text-brand">
                        All features
                      </span>
                      <span className="block text-[12.5px] text-muted">
                        Every module, one tour
                      </span>
                    </span>
                    <ArrowRight className="size-4 text-brand" />
                  </Link>
                </div>
              </div>
            ) : null}
          </div>

          {MAIN_NAV.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-lg px-3 py-2 text-[14.5px] font-medium transition",
                isActive(link.href) ? "text-brand" : "text-ink-soft hover:text-ink",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <a
            href={`tel:${PRIMARY_PHONE.replace(/[^+\d]/g, "")}`}
            className="hidden items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13.5px] font-medium text-ink-soft transition hover:text-ink xl:flex"
          >
            <Phone className="size-3.5 text-brand" />
            {PRIMARY_PHONE}
          </a>

          <ThemeToggle className="hidden sm:inline-flex" />

          <Link
            href="/login"
            className="hidden rounded-lg px-3 py-2 text-[14px] font-medium text-ink-soft transition hover:text-ink md:block"
          >
            Log in
          </Link>

          <ButtonLink
            href="/request-demo"
            size="sm"
            className="hidden sm:inline-flex"
            trailingIcon={<ArrowUpRight className="size-3.5" />}
          >
            Request a demo
          </ButtonLink>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="grid size-9.5 place-items-center rounded-lg border border-line text-ink-soft transition hover:bg-surface-2 lg:hidden"
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile sheet */}
      {menuOpen ? (
        <div className="fixed inset-0 top-17 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]"
            onClick={() => setMenuOpen(false)}
            aria-hidden
          />
          <div className="animate-in scroll-thin relative max-h-[calc(100vh-4.25rem)] overflow-y-auto border-b border-line bg-surface px-4 pt-4 pb-8 shadow-[var(--shadow-float)]">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11.5px] font-semibold tracking-[0.14em] text-muted uppercase">
                Features
              </p>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="rounded-lg p-1 text-muted hover:text-ink"
                aria-label="Close menu"
              >
                <X className="size-5" />
              </button>
            </div>

            <ul className="grid gap-1 sm:grid-cols-2">
              {PRIMARY_FEATURES.map((feature) => (
                <li key={feature.slug}>
                  <Link
                    href={`/features/${feature.slug}`}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-surface-2"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                      <Icon name={feature.icon} className="size-4" />
                    </span>
                    <span className="text-[14px] font-medium text-ink">{feature.navLabel}</span>
                  </Link>
                </li>
              ))}
            </ul>

            <Link
              href="/features"
              className="mt-2 flex items-center gap-2 rounded-xl bg-brand-soft px-3 py-2.5 text-[14px] font-semibold text-brand-ink"
            >
              All features
              <ArrowRight className="size-4" />
            </Link>

            <div className="mt-5 border-t border-line pt-4">
              <ul className="grid gap-0.5">
                {MAIN_NAV.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={cn(
                        "block rounded-lg px-3 py-2.5 text-[15px] font-medium transition",
                        isActive(link.href)
                          ? "bg-surface-2 text-brand"
                          : "text-ink-soft hover:bg-surface-2",
                      )}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-5 flex flex-col gap-2.5 border-t border-line pt-4">
              <ButtonLink href="/request-demo" size="lg" className="w-full">
                Request a demo
              </ButtonLink>
              <ButtonLink href="/login" variant="secondary" size="lg" className="w-full">
                Log in
              </ButtonLink>
              <div className="flex items-center justify-between pt-2">
                <a
                  href={`tel:${PRIMARY_PHONE.replace(/[^+\d]/g, "")}`}
                  className="flex items-center gap-1.5 text-[13.5px] font-medium text-ink-soft"
                >
                  <Phone className="size-3.5 text-brand" />
                  {PRIMARY_PHONE}
                </a>
                <ThemeToggle />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
