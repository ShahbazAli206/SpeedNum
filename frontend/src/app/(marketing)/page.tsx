import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleCheck,
  Globe,
  Lock,
  MapPin,
  Palette,
  Quote,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";
import Link from "next/link";

import { Icon } from "@/components/icon";
import { HeroMockup } from "@/components/marketing/hero-mockup";
import {
  CtaBand,
  Eyebrow,
  Section,
  SectionHeading,
} from "@/components/marketing/section";
import { CountUp, Reveal } from "@/components/reveal";
import { ButtonLink } from "@/components/ui";
import { FEATURES } from "@/lib/content/features";
import { PRICING, TRUST_POINTS } from "@/lib/site";

export default function HomePage() {
  return (
    <>
      <Hero />
      <TrustBar />
      <Modules />
      <Deadlines />
      <Letters />
      <WhiteLabel />
      <Stats />
      <Testimonial />
      <Pricing />
      <Security />
      <CtaBand />
    </>
  );
}

/* -------------------------------------------------------------------------- */

function Hero() {
  return (
    <section className="hero-wash relative overflow-hidden">
      <div className="grid-lines pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative mx-auto max-w-7xl px-4 pt-16 pb-24 sm:px-6 lg:px-8 lg:pt-24 lg:pb-32">
        <div className="grid items-center gap-16 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
          <div>
            <Reveal>
              <Eyebrow>
                <Sparkles className="size-3" />
                Practice management for accounting firms
              </Eyebrow>
            </Reveal>

            <Reveal delay={80}>
              <h1 className="mt-6 text-[2.65rem] leading-[1.05] font-extrabold tracking-tight text-balance text-ink sm:text-6xl">
                Run your whole firm — without{" "}
                <span className="text-brand">missing a deadline.</span>
              </h1>
            </Reveal>

            <Reveal delay={150}>
              <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-pretty text-muted">
                One home for every client, every task and every CRA deadline. Colour-coded
                reminders, e-signed engagement letters and a live SLA dashboard — so nothing slips
                and everything is on record.
              </p>
            </Reveal>

            <Reveal delay={220}>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <ButtonLink
                  href="/signup"
                  size="xl"
                  trailingIcon={<ArrowRight className="size-4" />}
                >
                  Start free trial
                </ButtonLink>
                <ButtonLink href="/request-demo" variant="secondary" size="xl">
                  Request a demo
                </ButtonLink>
              </div>
            </Reveal>

            <Reveal delay={290}>
              <ul className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2.5">
                {[
                  "Built for Canadian firms",
                  "CRA-aware deadlines",
                  "White-label ready",
                ].map((point) => (
                  <li key={point} className="flex items-center gap-2 text-[14px] text-ink-soft">
                    <Check className="size-4 shrink-0 text-brand" />
                    {point}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>

          <Reveal delay={200} className="mt-8 lg:mt-0">
            <HeroMockup />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function TrustBar() {
  return (
    <section className="border-y border-line bg-surface-2/50 py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <p className="text-center text-[11.5px] font-bold tracking-[0.14em] text-muted uppercase">
            The practice operating system trusted to keep firms compliant
          </p>
        </Reveal>

        <Reveal delay={80}>
          <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {TRUST_POINTS.map((point) => (
              <li
                key={point.label}
                className="flex items-center gap-2 text-[14px] font-medium text-ink-soft"
              >
                <Icon name={point.icon} className="size-4 text-brand" />
                {point.label}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={140}>
          <div className="marquee mt-10 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
            <ul className="marquee-track flex w-max items-center gap-4">
              {[...ACCREDITATIONS, ...ACCREDITATIONS].map((item, index) => (
                <li
                  key={`${item.abbr}-${index}`}
                  className="flex h-20 w-56 shrink-0 flex-col items-center justify-center rounded-xl border border-line bg-surface px-4"
                >
                  <span className="font-display text-lg font-extrabold tracking-tight text-ink">
                    {item.abbr}
                  </span>
                  <span className="mt-0.5 text-[10px] tracking-[0.1em] text-muted uppercase">
                    {item.name}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const ACCREDITATIONS = [
  { abbr: "CPA Canada", name: "Chartered Professional Accountants" },
  { abbr: "CPA Alberta", name: "Provincial body" },
  { abbr: "CPA Ontario", name: "Provincial body" },
  { abbr: "PIPEDA", name: "Privacy aligned" },
  { abbr: "ca-central-1", name: "Canadian data residency" },
  { abbr: "SOC 2 practices", name: "Controls modelled on" },
];

/* -------------------------------------------------------------------------- */

function Modules() {
  const [crm, tasks, ...rest] = [
    FEATURES.find((f) => f.slug === "client-management")!,
    FEATURES.find((f) => f.slug === "workflow")!,
    FEATURES.find((f) => f.slug === "reporting")!,
    FEATURES.find((f) => f.slug === "services-catalogue")!,
    FEATURES.find((f) => f.slug === "internal-team")!,
  ];

  return (
    <Section>
      <SectionHeading
        eyebrow="One platform"
        title="Everything your practice runs on, in"
        accent="one place."
        description="Fifteen modules built to work together — the CRM feeds the work, the work feeds the deadlines, the deadlines feed the dashboard."
      />

      <div className="mt-14 grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <Reveal>
          <article className="flex h-full flex-col rounded-2xl border border-line bg-brand-soft/40 p-7">
            <span className="grid size-11 place-items-center rounded-xl bg-surface text-brand shadow-sm">
              <Icon name={crm.icon} className="size-5" />
            </span>
            <h3 className="mt-5 text-xl font-bold text-ink">Client CRM</h3>
            <p className="mt-2.5 max-w-lg text-[14.5px] leading-relaxed text-muted">
              Legal name, address, fiscal year-end, officers and key contacts — searchable while
              you work a file. Import and export the whole book in CSV or XLSX.
            </p>
            <ClientTableMock />
            <Link
              href={`/features/${crm.slug}`}
              className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand hover:underline"
            >
              Explore the Client CRM
              <ArrowRight className="size-4" />
            </Link>
          </article>
        </Reveal>

        <Reveal delay={80}>
          <article className="flex h-full flex-col rounded-2xl border border-line bg-surface p-7">
            <span className="grid size-11 place-items-center rounded-xl bg-brand-soft text-brand">
              <Icon name={tasks.icon} className="size-5" />
            </span>
            <h3 className="mt-5 text-xl font-bold text-ink">Task Master</h3>
            <p className="mt-2.5 text-[14.5px] leading-relaxed text-muted">
              Per-client projects on annual, quarterly and monthly cadences — table or Kanban
              board, with assignees and due dates.
            </p>
            <KanbanMock />
            <Link
              href={`/features/${tasks.slug}`}
              className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand hover:underline"
            >
              Explore workflow
              <ArrowRight className="size-4" />
            </Link>
          </article>
        </Reveal>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[
          {
            title: "SLA dashboard",
            body: "Every deadline as a green, orange or red ticket, ranked by how close it is. The firm sees what needs attention at a glance.",
            icon: "calendar-clock",
            href: "/features/deadlines",
            tint: "bg-warn-soft/50",
          },
          {
            title: rest[1].navLabel,
            body: "Typed services — T4, T5, GST/HST, bookkeeping, year-end — each with its own reporting frequency that drives projects and reminders.",
            icon: rest[1].icon,
            href: `/features/${rest[1].slug}`,
            tint: "bg-brand-soft/40",
          },
          {
            title: "Your team",
            body: "A roster with live workload — clients handled and open tasks computed from real data. Assign clients and tasks, keep internal notes.",
            icon: rest[2].icon,
            href: `/features/${rest[2].slug}`,
            tint: "bg-info-soft/40",
          },
        ].map((card, index) => (
          <Reveal key={card.title} delay={index * 70}>
            <Link
              href={card.href}
              className={`group flex h-full flex-col rounded-2xl border border-line ${card.tint} p-7 transition hover:-translate-y-0.5 hover:border-brand/35 hover:shadow-[var(--shadow-lift)]`}
            >
              <span className="grid size-11 place-items-center rounded-xl bg-surface text-brand shadow-sm">
                <Icon name={card.icon} className="size-5" />
              </span>
              <h3 className="mt-5 text-lg font-bold text-ink group-hover:text-brand">
                {card.title}
              </h3>
              <p className="mt-2.5 flex-1 text-[14px] leading-relaxed text-muted">{card.body}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-brand">
                Learn more
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </Reveal>
        ))}
      </div>

      <Reveal delay={120}>
        <div className="mt-10 text-center">
          <ButtonLink
            href="/features"
            variant="secondary"
            size="lg"
            trailingIcon={<ArrowRight className="size-4" />}
          >
            See all fifteen modules
          </ButtonLink>
        </div>
      </Reveal>
    </Section>
  );
}

const MOCK_CLIENTS = [
  { name: "Maple Leaf Consulting Inc.", plan: "Growth", fee: "$1,250", owner: "Sarah Johnson", status: "Active" },
  { name: "BrightPath Logistics Ltd.", plan: "Professional", fee: "$950", owner: "Michael Chen", status: "Active" },
  { name: "Summit Retail Group", plan: "Starter", fee: "$650", owner: "Emily Carter", status: "Trial" },
  { name: "NorthCo Manufacturing", plan: "Growth", fee: "$1,450", owner: "David Thompson", status: "Active" },
  { name: "Clearwater Skyline Inc.", plan: "Professional", fee: "$910", owner: "Jessica Williams", status: "Active" },
];

function ClientTableMock() {
  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-line bg-surface" aria-hidden>
      <div className="grid grid-cols-4 gap-2 border-b border-line bg-surface-2/60 px-3 py-2 text-[10px] font-bold tracking-wide text-muted uppercase">
        <span className="col-span-2">Business name</span>
        <span>Monthly fee</span>
        <span className="text-right">Status</span>
      </div>
      <ul>
        {MOCK_CLIENTS.map((client) => (
          <li
            key={client.name}
            className="grid grid-cols-4 items-center gap-2 border-b border-line px-3 py-2.5 last:border-b-0"
          >
            <span className="col-span-2 flex min-w-0 items-center gap-2">
              <span className="grid size-5 shrink-0 place-items-center rounded bg-brand-soft text-[9px] font-bold text-brand">
                {client.name[0]}
              </span>
              <span className="truncate text-[11.5px] font-medium text-ink">{client.name}</span>
            </span>
            <span className="text-[11.5px] tabular-nums text-ink-soft">{client.fee}</span>
            <span className="text-right">
              <span
                className={`rounded-full px-2 py-0.5 text-[9.5px] font-semibold ${
                  client.status === "Active"
                    ? "bg-success-soft text-success"
                    : "bg-warn-soft text-warn"
                }`}
              >
                {client.status}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const KANBAN = [
  { column: "To do", tone: "bg-muted", cards: ["GST/HST — Q4", "Payroll journal", "T5 slips"] },
  { column: "In progress", tone: "bg-info", cards: ["Year-end working papers", "Bank reconciliation"] },
  { column: "Review", tone: "bg-warn", cards: ["T2 return — NorthCo", "Q3 bookkeeping"] },
  { column: "Complete", tone: "bg-success", cards: ["Engagement letter", "T4 summary", "PST return"] },
];

function KanbanMock() {
  return (
    <div className="mt-6 grid grid-cols-4 gap-2" aria-hidden>
      {KANBAN.map((column) => (
        <div key={column.column} className="rounded-lg border border-line bg-surface-2/50 p-1.5">
          <div className="mb-1.5 flex items-center gap-1 px-1">
            <span className={`size-1.5 rounded-full ${column.tone}`} />
            <span className="truncate text-[8.5px] font-semibold text-muted">{column.column}</span>
          </div>
          <ul className="space-y-1">
            {column.cards.map((card) => (
              <li
                key={card}
                className="rounded-md border border-line bg-surface px-1.5 py-1.5"
              >
                <span className="block truncate text-[8.5px] font-medium text-ink">{card}</span>
                <span className="mt-1 block h-1 w-2/3 rounded-full bg-surface-3" />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Deadlines() {
  return (
    <Section className="bg-surface-2/40">
      <div className="grid items-center gap-14 lg:grid-cols-2">
        <div>
          <Reveal>
            <Eyebrow>Never miss a deadline</Eyebrow>
          </Reveal>
          <Reveal delay={70}>
            <h2 className="mt-5 text-3xl leading-tight font-extrabold text-balance text-ink sm:text-4xl">
              Deadlines that chase <span className="text-brand">themselves.</span>
            </h2>
          </Reveal>
          <Reveal delay={130}>
            <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-muted">
              Personal tax in January, GST on each client&apos;s cadence, year-end one month before
              fiscal close — generated automatically and surfaced before they bite.
            </p>
          </Reveal>
          <ul className="mt-7 space-y-3.5">
            {[
              "Colour-coded red / orange / green by proximity",
              "Delivered on the dashboard and by email digest",
              "Snooze, mark done or dismiss — the firm stays in control",
              "Weekend and Canadian statutory holiday roll-forward",
            ].map((point, index) => (
              <Reveal key={point} delay={180 + index * 60}>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
                    <Check className="size-3" />
                  </span>
                  <span className="text-[15px] text-ink-soft">{point}</span>
                </li>
              </Reveal>
            ))}
          </ul>
          <Reveal delay={420}>
            <ButtonLink
              href="/features/deadlines"
              variant="secondary"
              className="mt-8"
              trailingIcon={<ArrowRight className="size-4" />}
            >
              How the deadline engine works
            </ButtonLink>
          </Reveal>
        </div>

        <Reveal delay={120}>
          <RemindersMock />
        </Reveal>
      </div>
    </Section>
  );
}

const REMINDER_GROUPS = [
  {
    label: "Overdue",
    count: 3,
    tone: "danger" as const,
    items: [
      ["GST/HST return", "Maple Leaf Consulting Inc.", "May 20"],
      ["T2 Corporation Tax Return", "BrightPath Logistics Ltd.", "May 24"],
      ["WSB Reconciliation", "Valley Construction Ltd.", "May 29"],
    ],
  },
  {
    label: "Due soon",
    count: 4,
    tone: "warn" as const,
    items: [
      ["PST Return", "Summit Retail Group", "May 23"],
      ["Payroll Remittance", "NorthCo Manufacturing", "May 25"],
      ["Q2 Bookkeeping", "Clearwater Studios Inc.", "May 27"],
      ["T4 Slips", "BrightPath Logistics Ltd.", "May 28"],
    ],
  },
  {
    label: "Upcoming",
    count: 5,
    tone: "success" as const,
    items: [
      ["Year End Adjustment", "Oceanview Services", "May 27"],
      ["T2 Corporation Tax Return", "Pinnacle Enterprises", "May 30"],
      ["GST/HST Return", "Summit Retail Group", "Jun 03"],
      ["Q1 Bookkeeping", "NorthCo Manufacturing", "Jun 05"],
      ["Q2 Review Meeting", "Maple Leaf Consulting Inc.", "Jun 10"],
    ],
  },
];

const REMINDER_TONE = {
  danger: { bar: "bg-danger", chip: "bg-danger-soft text-danger", date: "text-danger" },
  warn: { bar: "bg-warn", chip: "bg-warn-soft text-warn", date: "text-warn" },
  success: { bar: "bg-success", chip: "bg-success-soft text-success", date: "text-success" },
};

function RemindersMock() {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-lift)]"
      aria-hidden
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <p className="text-[14px] font-bold text-ink">Reminders</p>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success px-2 py-0.5 text-[10px] font-bold text-white">
          Email digest ON
        </span>
      </div>
      <p className="px-5 pt-2 pb-1 text-[11px] text-muted">Stay on top of important deadlines.</p>

      <div className="space-y-4 p-4">
        {REMINDER_GROUPS.map((group) => {
          const tone = REMINDER_TONE[group.tone];
          return (
            <div key={group.label} className="flex gap-3">
              <span className={`w-1 shrink-0 rounded-full ${tone.bar}`} />
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tone.chip}`}>
                    {group.label}
                  </span>
                  <span className="text-[10px] text-muted">{group.count}</span>
                  <span className="ml-auto text-[10px] text-brand">View all</span>
                </div>
                <ul className="space-y-1">
                  {group.items.map(([service, client, date]) => (
                    <li key={service + client} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-ink">
                        {service}
                      </span>
                      <span className="hidden min-w-0 flex-1 truncate text-[11px] text-muted sm:block">
                        {client}
                      </span>
                      <span className={`shrink-0 text-[10px] font-semibold ${tone.date}`}>
                        {date}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Letters() {
  return (
    <Section>
      <div className="grid items-center gap-14 lg:grid-cols-2">
        <Reveal className="order-2 lg:order-1">
          <LetterMock />
        </Reveal>

        <div className="order-1 lg:order-2">
          <Reveal>
            <Eyebrow>Engagement letters</Eyebrow>
          </Reveal>
          <Reveal delay={70}>
            <h2 className="mt-5 text-3xl leading-tight font-extrabold text-balance text-ink sm:text-4xl">
              Letters that sign <span className="text-brand">themselves.</span>
            </h2>
          </Reveal>
          <Reveal delay={130}>
            <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-muted">
              Build a priced letter from your services, load scope from history, then send a
              branded link. Clients sign by type, draw or upload — and download the PDF.
            </p>
          </Reveal>
          <ul className="mt-7 space-y-3.5">
            {[
              "Services-based pricing with custom lines",
              "Client e-signature on a no-login branded portal",
              "Every letter and signature kept on the client record",
              "Draft, sent, viewed, signed and declined — each timestamped",
            ].map((point, index) => (
              <Reveal key={point} delay={180 + index * 60}>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
                    <Check className="size-3" />
                  </span>
                  <span className="text-[15px] text-ink-soft">{point}</span>
                </li>
              </Reveal>
            ))}
          </ul>
          <Reveal delay={420}>
            <ButtonLink
              href="/features/engagements"
              variant="secondary"
              className="mt-8"
              trailingIcon={<ArrowRight className="size-4" />}
            >
              See engagement letters
            </ButtonLink>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}

const LETTER_LINES = [
  ["Accounting & Bookkeeping", "$825.00"],
  ["Corporate Tax Return (T2)", "$1,250.00"],
  ["GST/HST Returns (Quarterly)", "$300.00"],
  ["Payroll Processing (Monthly)", "$120.00"],
];

function LetterMock() {
  return (
    <div
      className="relative rounded-2xl border border-line bg-surface-2/60 p-8 sm:p-12"
      aria-hidden
    >
      <div className="mx-auto max-w-sm -rotate-2 rounded-lg bg-white p-6 shadow-[var(--shadow-float)] transition-transform duration-500 hover:rotate-0">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded bg-[#12224a] text-[10px] font-bold text-white">
              MC
            </span>
            <span>
              <span className="block text-[11px] font-bold text-[#12224a]">Maple &amp; Co.</span>
              <span className="block text-[7px] tracking-wide text-slate-500 uppercase">
                Chartered Professional Accountants
              </span>
            </span>
          </div>
          <span className="text-[8px] font-bold tracking-wide text-[#12224a] uppercase">
            Engagement letter
          </span>
        </div>

        <p className="mt-4 text-[7.5px] text-slate-400">May 15, 2026</p>
        <p className="mt-3 text-[7.5px] text-slate-400">Prepared for:</p>
        <p className="text-[9px] font-semibold text-[#12224a]">BrightPath Logistics Ltd.</p>
        <p className="text-[7.5px] text-slate-400">456 Business Ave, Toronto, ON M4J 1A1</p>

        <p className="mt-4 border-b border-slate-200 pb-1 text-[8px] font-bold tracking-wide text-[#12224a] uppercase">
          Scope of services &amp; fees
        </p>
        <ul className="mt-2 space-y-1.5">
          {LETTER_LINES.map(([service, fee]) => (
            <li key={service} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-[8px] text-slate-600">
                <CircleCheck className="size-2.5 text-[#0a8f4e]" />
                {service}
              </span>
              <span className="text-[8px] font-semibold tabular-nums text-[#12224a]">{fee}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2">
          <span className="text-[8.5px] font-bold text-[#12224a]">Total (CAD)</span>
          <span className="text-[9px] font-bold tabular-nums text-[#12224a]">$2,495.00</span>
        </div>

        <p className="mt-5 text-[7.5px] text-slate-400">Agreed and accepted by:</p>
        <div className="mt-1 flex items-end justify-between">
          <div>
            <p className="font-display text-base text-[#12224a] italic">Sarah Johnson</p>
            <p className="border-t border-slate-300 pt-1 text-[7px] text-slate-500">
              Sarah Johnson, CPA · May 15, 2026
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#e4f6ec] px-2 py-0.5 text-[7.5px] font-bold text-[#0a8f4e]">
            <CircleCheck className="size-2.5" />
            Signed
          </span>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function WhiteLabel() {
  return (
    <section className="navy-band relative overflow-hidden py-20 sm:py-28">
      <div className="grid-lines-dark pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <div>
            <Reveal>
              <Eyebrow tone="onDark">
                <Palette className="size-3" />
                White-label &amp; multi-tenant
              </Eyebrow>
            </Reveal>
            <Reveal delay={70}>
              <h2 className="mt-5 text-3xl leading-tight font-extrabold text-balance text-white sm:text-4xl">
                Your logo. Your colours.{" "}
                <span className="text-brand">Your platform.</span>
              </h2>
            </Reveal>
            <Reveal delay={130}>
              <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-white/70">
                One deployment hosts many firms — each fully isolated and fully branded. Your
                clients see your name on the app, the emails and the engagement letters. They never
                see ours.
              </p>
            </Reveal>

            <div className="mt-9 grid gap-6 sm:grid-cols-2">
              {[
                { icon: Lock, title: "Every firm isolated", body: "Cryptographically scoped data — a firm can never see another firm's records." },
                { icon: Palette, title: "Branded end to end", body: "Name, logo, colours and letterhead resolve per tenant at runtime." },
                { icon: ShieldCheck, title: "Super-admin console", body: "Provision firms, set plans and limits, and audit every action." },
                { icon: Sparkles, title: "Resell it as your own", body: "Run it for one firm — or a hundred — from a single platform." },
              ].map((item, index) => (
                <Reveal key={item.title} delay={180 + index * 70}>
                  <div className="flex gap-3">
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-white/15 bg-white/8 text-brand-on-dark">
                      <item.icon className="size-4" />
                    </span>
                    <div>
                      <p className="text-[14.5px] font-bold text-white">{item.title}</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-white/60">{item.body}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>

          <Reveal delay={140}>
            <div className="grid grid-cols-2 gap-4">
              <TenantCard name="Cedar & Co." accent="#0a8f4e" initial="C" />
              <TenantCard name="Aurora Tax" accent="#4c6ef5" initial="A" className="mt-8" />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function TenantCard({
  name,
  accent,
  initial,
  className = "",
}: {
  name: string;
  accent: string;
  initial: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm ${className}`}
      aria-hidden
    >
      <div className="flex items-center gap-2.5 border-b border-white/10 pb-3">
        <span
          className="grid size-6 place-items-center rounded-md text-[10px] font-bold text-white"
          style={{ background: accent }}
        >
          {initial}
        </span>
        <span className="text-[12px] font-semibold text-white">{name}</span>
        <span className="ml-auto h-1.5 w-10 rounded-full bg-white/15" />
      </div>
      <div className="mt-3 space-y-2">
        <span className="block size-8 rounded-lg" style={{ background: accent }} />
        {[70, 88, 62, 80].map((width, index) => (
          <span key={index} className="flex items-center gap-2">
            <span className="size-1.5 rounded-full" style={{ background: accent }} />
            <span
              className="h-1.5 rounded-full bg-white/12"
              style={{ width: `${width}%` }}
            />
          </span>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Stats() {
  const stats = [
    { value: 15, suffix: "", label: "modules, built to work as one" },
    { value: 100, suffix: "%", label: "white-label, down to the email footer" },
    { value: 3, suffix: "-colour", label: "SLA so nothing slips unseen" },
    { value: 24, suffix: "/7", label: "availability, hosted in Canada" },
  ];

  return (
    <Section className="py-14 sm:py-16">
      <Reveal>
        <dl className="grid gap-8 rounded-2xl border border-line bg-surface px-6 py-10 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <dt className="sr-only">{stat.label}</dt>
              <dd>
                <span className="font-display text-4xl font-extrabold text-brand">
                  <CountUp value={stat.value} suffix={stat.suffix} />
                </span>
                <span className="mt-2 block text-[13.5px] leading-relaxed text-muted">
                  {stat.label}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </Reveal>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */

function Testimonial() {
  return (
    <Section className="pt-0">
      <Reveal>
        <figure className="grid overflow-hidden rounded-2xl border border-line bg-surface lg:grid-cols-[minmax(0,22rem)_1fr]">
          <div className="navy-band relative flex min-h-64 items-end p-8">
            <div className="grid-lines-dark absolute inset-0 opacity-40" aria-hidden />
            <div className="relative">
              <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-lg bg-brand text-sm font-extrabold text-white">
                  H
                </span>
                <div>
                  <p className="font-display text-base font-extrabold tracking-wide text-white">
                    HARRISON
                  </p>
                  <p className="text-[10px] tracking-[0.2em] text-white/50">CPA</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-center p-8 sm:p-12">
            <div className="flex items-center gap-0.5" aria-label="Rated 5 out of 5">
              {Array.from({ length: 5 }).map((_, index) => (
                <Star key={index} className="size-4 fill-warn text-warn" aria-hidden />
              ))}
            </div>
            <Quote className="mt-5 size-7 text-brand/35" aria-hidden />
            <blockquote className="mt-3 text-xl leading-snug font-bold text-balance text-ink sm:text-2xl">
              We stopped chasing deadlines in spreadsheets. Now the whole firm sees what&apos;s due,
              what&apos;s late, and what&apos;s done — in one place, under our own brand.
            </blockquote>
            <figcaption className="mt-6">
              <p className="text-[14px] font-bold text-ink">Managing Partner</p>
              <p className="text-[13px] text-muted">Mid-size CPA firm · Ontario</p>
            </figcaption>
          </div>
        </figure>
      </Reveal>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */

function Pricing() {
  return (
    <Section className="bg-surface-2/40">
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
            <h3 className="text-lg font-bold text-ink">SpidNums — full platform</h3>
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
            Reselling SpidNums to many firms under your own brand?{" "}
            <Link
              href="/request-demo"
              className="font-semibold text-brand hover:underline"
            >
              Talk to us about white-label
            </Link>
          </p>
        </div>
      </Reveal>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */

function Security() {
  const cards = [
    {
      icon: Lock,
      title: "Locked-down access",
      body: "No public data access — every read runs through authenticated, tenant-scoped server actions.",
    },
    {
      icon: MapPin,
      title: "Data residency",
      body: "Hosted on Postgres in ca-central-1, aligned with PIPEDA and provincial privacy law.",
    },
    {
      icon: ShieldCheck,
      title: "Audited & isolated",
      body: "Signed tenant sessions, JWT-verified portals, and an append-only audit log.",
    },
    {
      icon: Globe,
      title: "Your own domain",
      body: "An instant firm subdomain, or point your own domain — branding follows the hostname.",
    },
  ];

  return (
    <Section>
      <SectionHeading
        eyebrow="Security"
        title="Built to be trusted with client"
        accent="data."
        description="Accounting firms hold the most sensitive data a business has. The security model is designed around that, not bolted on after."
      />

      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, index) => (
          <Reveal key={card.title} delay={index * 70}>
            <div className="h-full rounded-2xl border border-line bg-surface p-6">
              <span className="grid size-10 place-items-center rounded-full bg-brand-soft text-brand">
                <card.icon className="size-4.5" />
              </span>
              <h3 className="mt-4 text-[15.5px] font-bold text-ink">{card.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{card.body}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={200}>
        <div className="mt-8 text-center">
          <Link
            href="/features/security"
            className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand hover:underline"
          >
            Read the full security model
            <ArrowUpRight className="size-4" />
          </Link>
        </div>
      </Reveal>
    </Section>
  );
}
