"use client";

import { CircleCheck, ShieldCheck } from "lucide-react";
import { usePathname } from "next/navigation";

/**
 * The pitch panel beside the auth form. Login and signup share one layout but
 * carry different copy, and a layout cannot receive props from its page — so
 * the panel picks its content from the route.
 */
const PANELS = {
  "/signup": {
    eyebrow: null,
    title: (
      <>
        Smart Numbers.
        <br />
        Stronger Business.
      </>
    ),
    lead: "The intelligent platform that automates taxation, accounting, payroll and compliance for Canadian businesses — all from one dashboard.",
    points: [
      "Automated GST/HST & corporate tax",
      "Real-time bookkeeping & reconciliation",
      "Payroll & compliance on autopilot",
      "Deadline alerts before they bite",
    ],
  },
  // The firm/staff login — distinct from `default` below, which is the
  // client-portal pitch. Before this entry existed, `/login` fell through to
  // `default` and showed a "Client portal" badge and portal-oriented bullets
  // to accountants signing into their own firm's dashboard.
  "/login": {
    eyebrow: "Practice management",
    title: (
      <>
        Welcome back
        <br />
        to your practice.
      </>
    ),
    lead: "Clients, deadlines, engagement letters and your whole team's workload — right where you left them.",
    points: [
      "Full client roster & task board",
      "CRA deadlines tracked automatically",
      "Engagement letters & e-signatures",
      "Team workload at a glance",
    ],
  },
  default: {
    eyebrow: "Client portal",
    title: (
      <>
        Everything for
        <br />
        your business.
      </>
    ),
    lead: "Track your documents, CRA deadlines, invoices and engagement letters — all in one secure portal.",
    points: [
      "View documents & engagement letters",
      "Track CRA & filing deadlines",
      "Follow invoices and payments",
      "Secure, bank-grade access",
    ],
  },
} as const;

export function AuthAside() {
  const pathname = usePathname();
  const panel = pathname && pathname in PANELS ? PANELS[pathname as keyof typeof PANELS] : PANELS.default;

  return (
    <div className="relative my-auto hidden max-w-lg py-16 lg:block">
      {panel.eyebrow ? (
        <span className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/12 px-3 py-1 text-[11.5px] font-bold tracking-[0.12em] text-brand-on-dark uppercase">
          <ShieldCheck className="size-3" />
          {panel.eyebrow}
        </span>
      ) : null}

      <h2 className="mt-6 text-4xl leading-[1.1] font-extrabold tracking-tight text-balance text-white xl:text-5xl">
        {panel.title}
      </h2>
      <p className="mt-5 text-[16.5px] leading-relaxed text-white/70">{panel.lead}</p>

      <ul className="mt-8 space-y-3.5">
        {panel.points.map((point) => (
          <li key={point} className="flex items-center gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand/20 text-brand-on-dark">
              <CircleCheck className="size-3.5" />
            </span>
            <span className="text-[15px] text-white/85">{point}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
