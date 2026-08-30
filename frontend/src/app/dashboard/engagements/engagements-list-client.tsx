"use client";

import { FileSignature, PenLine } from "lucide-react";
import Link from "next/link";

import { KpiTile } from "@/components/charts";
import { DashboardHeader, KpiRow } from "@/components/dashboard/page-shell";
import { Badge, EmptyState, type Tone } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import type { LetterStatus, PortalLetter } from "@/lib/types";

const STATUS_TONE: Record<LetterStatus, Tone> = {
  draft: "neutral",
  sent: "info",
  viewed: "warn",
  signed: "success",
  declined: "danger",
  void: "neutral",
};

const STATUS_LABEL: Record<LetterStatus, string> = {
  draft: "Draft",
  sent: "Awaiting your review",
  viewed: "Awaiting your signature",
  signed: "Signed",
  declined: "Declined",
  void: "Withdrawn",
};

export function EngagementsListClient({ letters }: { letters: PortalLetter[] }) {
  const awaitingCount = letters.filter((l) => l.status === "sent" || l.status === "viewed").length;
  const signedCount = letters.filter((l) => l.status === "signed").length;

  return (
    <>
      <DashboardHeader
        title="Agreements"
        subtitle="Engagement letters from your accountant — review, sign or revisit what you've already signed"
      />

      <KpiRow>
        <KpiTile
          tone="blue"
          value={String(letters.length)}
          label="Total letters"
          icon={<FileSignature className="size-5" />}
        />
        <KpiTile
          tone="amber"
          value={String(awaitingCount)}
          label="Awaiting your signature"
          icon={<PenLine className="size-5" />}
        />
        <KpiTile
          tone="green"
          value={String(signedCount)}
          label="Signed"
          icon={<FileSignature className="size-5" />}
        />
      </KpiRow>

      <section className="mt-6 rounded-xl border border-line bg-surface shadow-card">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">Letters</h2>
          <p className="mt-0.5 text-[13px] text-muted">Every letter your accountant has shared with you</p>
        </div>
        {letters.length === 0 ? (
          <EmptyState
            icon={<FileSignature className="size-6" />}
            title="Nothing here yet"
            description="When your accountant sends a service agreement or engagement letter, it will show up here for you to review and sign."
          />
        ) : (
          <ul className="divide-y divide-line">
            {letters.map((letter) => (
              <li key={letter.id}>
                <Link
                  href={`/dashboard/engagements/${letter.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 text-[13.5px] transition hover:bg-surface-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{letter.title}</span>
                    <span className="text-[12px] text-muted">
                      {formatMoney(letter.total, letter.currency)}
                      {letter.signed_at ? ` · signed ${formatDate(letter.signed_at)}` : ""}
                    </span>
                  </span>
                  <Badge tone={STATUS_TONE[letter.status]}>{STATUS_LABEL[letter.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
