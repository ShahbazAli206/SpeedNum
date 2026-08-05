import { CircleCheck, CircleX, Eye, Send, Signature } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { KpiTile } from "@/components/charts";
import { DashboardHeader, KpiRow } from "@/components/dashboard/page-shell";
import { cn } from "@/lib/cn";
import { getLetters } from "@/lib/firm-demo";
import { formatDate, formatMoney } from "@/lib/format";
import type { LetterStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Engagements" };

const STATUS: Record<
  LetterStatus,
  { label: string; tone: string; dot: string }
> = {
  draft: { label: "Draft", tone: "bg-surface-2 text-muted", dot: "bg-muted" },
  sent: { label: "Sent", tone: "bg-info-soft text-info", dot: "bg-info" },
  viewed: { label: "Viewed", tone: "bg-warn-soft text-warn", dot: "bg-warn" },
  signed: { label: "Signed", tone: "bg-success-soft text-success", dot: "bg-success" },
  declined: { label: "Declined", tone: "bg-danger-soft text-danger", dot: "bg-danger" },
  void: { label: "Void", tone: "bg-surface-2 text-muted", dot: "bg-muted" },
};

/** The pipeline a letter moves through, left to right. */
const PIPELINE: LetterStatus[] = ["draft", "sent", "viewed", "signed", "declined"];

export default function EngagementsPage() {
  const letters = getLetters();

  const total = (letter: (typeof letters)[number]) =>
    letter.subtotal * (1 + letter.tax_rate / 100);

  const signed = letters.filter((letter) => letter.status === "signed");
  const awaiting = letters.filter(
    (letter) => letter.status === "sent" || letter.status === "viewed",
  );
  const declined = letters.filter((letter) => letter.status === "declined");

  return (
    <>
      <DashboardHeader
        title="Engagement letters"
        subtitle="Priced from the services catalogue, signed on a branded no-login page, kept on the client record"
      />

      <KpiRow>
        <KpiTile
          tone="green"
          value={String(signed.length)}
          label="Signed"
          hint={formatMoney(signed.reduce((sum, letter) => sum + total(letter), 0))}
          icon={<CircleCheck className="size-5" />}
        />
        <KpiTile
          tone="amber"
          value={String(awaiting.length)}
          label="Awaiting signature"
          hint={formatMoney(awaiting.reduce((sum, letter) => sum + total(letter), 0))}
          icon={<Send className="size-5" />}
        />
        <KpiTile
          tone="rose"
          value={String(declined.length)}
          label="Declined"
          hint="Scope needs a conversation"
          icon={<CircleX className="size-5" />}
        />
        <KpiTile
          tone="blue"
          value={String(letters.filter((letter) => letter.status === "draft").length)}
          label="Drafts"
          icon={<Signature className="size-5" />}
        />
      </KpiRow>

      {/* Pipeline */}
      <section className="mt-6 rounded-xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-[15px] font-semibold text-ink">Pipeline</h2>
        <p className="mt-0.5 text-[13px] text-muted">
          Every letter, by the stage it has reached
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {PIPELINE.map((status) => {
            const count = letters.filter((letter) => letter.status === status).length;
            const entry = STATUS[status];
            return (
              <div key={status} className="rounded-xl border border-line px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className={cn("size-2 rounded-full", entry.dot)} />
                  <span className="text-[12.5px] font-medium text-muted">{entry.label}</span>
                </div>
                <p className="mt-1.5 font-display text-2xl font-bold text-ink">{count}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Letters */}
      <section className="mt-6 rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">All letters</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            Status history is timestamped — &quot;has this client signed?&quot; is a filter,
            not an email search
          </p>
        </div>

        <ul className="divide-y divide-line">
          {letters.map((letter) => {
            const entry = STATUS[letter.status];
            return (
              <li key={letter.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[14px] font-semibold text-ink">{letter.title}</p>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          entry.tone,
                        )}
                      >
                        {entry.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      <Link
                        href={`/clients/${letter.client_id}`}
                        className="transition hover:text-brand hover:underline"
                      >
                        {letter.client_name}
                      </Link>
                      {letter.recipient_name !== "—" ? ` · ${letter.recipient_name}` : ""}
                    </p>

                    {/* Timestamped trail */}
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted">
                      {letter.sent_at ? (
                        <span className="inline-flex items-center gap-1">
                          <Send className="size-3" /> Sent {formatDate(letter.sent_at)}
                        </span>
                      ) : null}
                      {letter.viewed_at ? (
                        <span className="inline-flex items-center gap-1">
                          <Eye className="size-3" /> Viewed {formatDate(letter.viewed_at)}
                        </span>
                      ) : null}
                      {letter.signed_at ? (
                        <span className="inline-flex items-center gap-1 font-medium text-success">
                          <CircleCheck className="size-3" /> Signed {formatDate(letter.signed_at)}{" "}
                          by {letter.signer_name}
                        </span>
                      ) : null}
                      {letter.status === "declined" ? (
                        <span className="inline-flex items-center gap-1 font-medium text-danger">
                          <CircleX className="size-3" /> Declined
                        </span>
                      ) : null}
                      {letter.status === "draft" ? (
                        <span>Not sent yet</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="font-display text-lg font-bold text-ink">
                      {formatMoney(total(letter))}
                    </p>
                    <p className="text-[11.5px] text-muted">
                      {formatMoney(letter.subtotal)} + {letter.tax_rate}% tax
                    </p>
                  </div>
                </div>

                {/* Line items priced from the catalogue */}
                <ul className="mt-3 grid gap-1 rounded-lg bg-surface-2/50 px-3.5 py-2.5 sm:grid-cols-2">
                  {letter.items.map((item) => (
                    <li
                      key={item.description}
                      className="flex items-center justify-between gap-3 text-[12.5px]"
                    >
                      <span className="truncate text-ink-soft">{item.description}</span>
                      <span className="shrink-0 tabular-nums text-muted">
                        {formatMoney(item.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
