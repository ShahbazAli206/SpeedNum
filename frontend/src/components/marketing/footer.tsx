import { ArrowUpRight, MapPin, Phone } from "lucide-react";
import Link from "next/link";

import { SocialIcon } from "@/components/icon";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui";
import {
  ADDRESS_LINES,
  FOOTER_PRODUCT,
  FOOTER_RESOURCES,
  SITE,
} from "@/lib/site";

export function Footer() {
  return (
    <footer className="navy-band relative mt-auto overflow-hidden text-white/70">
      <div className="grid-lines-dark pointer-events-none absolute inset-0 opacity-60" aria-hidden />

      <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-18">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1.3fr]">
          <div>
            <div className="inline-flex rounded-xl bg-white px-3.5 py-2.5">
              <Logo href={null} size={30} />
            </div>
            <p className="mt-5 max-w-xs text-[14.5px] leading-relaxed">
              Practice-management software for Canadian accounting firms. Keep clients, work,
              documents and deadlines visible under your own brand.
            </p>
            <ul className="mt-6 flex items-center gap-2.5">
              {SITE.social.map((item) => (
                <li key={item.label}>
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={item.label}
                    className="grid size-9 place-items-center rounded-full border border-white/15 text-white/70 transition hover:border-white/35 hover:bg-white/10 hover:text-white"
                  >
                    <SocialIcon name={item.icon} className="size-4" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <FooterColumn title="Product" links={FOOTER_PRODUCT} />
          <FooterColumn title="Resources" links={FOOTER_RESOURCES} />

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[11.5px] font-semibold tracking-[0.16em] text-white/60 uppercase">
                Head office
              </p>
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand/20 text-brand-on-dark">
                <MapPin className="size-4" />
              </span>
            </div>
            <address className="mt-3 text-right text-[14.5px] leading-relaxed text-white/85 not-italic">
              {ADDRESS_LINES.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </address>
            <ul className="mt-4 space-y-1.5 text-right">
              {SITE.phones.map((phone) => (
                <li key={phone}>
                  <a
                    href={`tel:${phone.replace(/[^+\d]/g, "")}`}
                    className="inline-flex items-center gap-2 text-[14.5px] font-semibold text-white transition hover:text-brand-on-dark"
                  >
                    {phone}
                    <Phone className="size-3.5 text-brand-on-dark" />
                  </a>
                </li>
              ))}
            </ul>
            <ButtonLink
              href="/request-demo"
              className="mt-5 w-full"
              trailingIcon={<ArrowUpRight className="size-3.5" />}
            >
              Request a demo
            </ButtonLink>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center gap-3 border-t border-white/10 pt-6 text-[13px] md:flex-row md:justify-between">
          <p>
            © {SITE.founded} {SITE.legalName}
          </p>
          <p className="text-white/55">Canadian data hosting · PIPEDA-aligned</p>
          <p>
            Developed by{" "}
            <a
              href={SITE.developer.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-brand-on-dark hover:underline"
            >
              {SITE.developer.name}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <h2 className="text-[11.5px] font-semibold tracking-[0.16em] text-white/60 uppercase">
        {title}
      </h2>
      <ul className="mt-5 space-y-2.5">
        {links.map((link) => (
          <li key={link.href + link.label}>
            <Link
              href={link.href}
              className="text-[14.5px] transition hover:text-white"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
