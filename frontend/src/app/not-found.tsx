import { ArrowLeft, Search } from "lucide-react";

import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <main
      id="main"
      className="hero-wash relative flex flex-1 items-center justify-center overflow-hidden px-4 py-24"
    >
      <div className="grid-lines pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative text-center">
        <Logo size={36} className="mx-auto" />
        <p className="mt-10 font-display text-7xl font-extrabold text-brand">404</p>
        <h1 className="mt-4 text-2xl font-extrabold text-balance text-ink sm:text-3xl">
          We couldn&apos;t find that page.
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[15.5px] leading-relaxed text-muted">
          The link may be out of date, or the page may have moved. The features index is a good
          place to pick the thread back up.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <ButtonLink href="/" size="lg" icon={<ArrowLeft className="size-4" />}>
            Back to home
          </ButtonLink>
          <ButtonLink
            href="/features"
            variant="secondary"
            size="lg"
            icon={<Search className="size-4" />}
          >
            Browse features
          </ButtonLink>
        </div>
      </div>
    </main>
  );
}
