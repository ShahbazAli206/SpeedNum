import { cn } from "@/lib/cn";

type Tone = "success" | "info" | "warn" | "danger" | "neutral" | "brand";

const TONES: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  info: "bg-info-soft text-info",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-surface-2 text-muted",
  brand: "bg-brand-soft text-brand",
};

function Pill({ tone, children }: { tone: Tone; children: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

const INVOICE: Record<string, { tone: Tone; label: string }> = {
  paid: { tone: "success", label: "Paid" },
  sent: { tone: "info", label: "Sent" },
  overdue: { tone: "danger", label: "Overdue" },
  draft: { tone: "neutral", label: "Draft" },
  void: { tone: "neutral", label: "Void" },
};

export function InvoiceStatusBadge({ status }: { status: string }) {
  const entry = INVOICE[status] ?? INVOICE.draft;
  return <Pill tone={entry.tone}>{entry.label}</Pill>;
}

const EXPENSE: Record<string, { tone: Tone; label: string }> = {
  approved: { tone: "success", label: "Approved" },
  pending: { tone: "warn", label: "Pending" },
  rejected: { tone: "danger", label: "Rejected" },
};

export function ExpenseStatusBadge({ status }: { status: string }) {
  const entry = EXPENSE[status] ?? EXPENSE.pending;
  return <Pill tone={entry.tone}>{entry.label}</Pill>;
}

const TAX: Record<string, { tone: Tone; label: string }> = {
  filed: { tone: "success", label: "Filed" },
  open: { tone: "info", label: "Open" },
  overdue: { tone: "danger", label: "Overdue" },
};

export function TaxStatusBadge({ status }: { status: string }) {
  const entry = TAX[status] ?? TAX.open;
  return <Pill tone={entry.tone}>{entry.label}</Pill>;
}

const PAYRUN: Record<string, { tone: Tone; label: string }> = {
  processed: { tone: "success", label: "Processed" },
  scheduled: { tone: "info", label: "Scheduled" },
  draft: { tone: "neutral", label: "Draft" },
};

export function PayRunStatusBadge({ status }: { status: string }) {
  const entry = PAYRUN[status] ?? PAYRUN.draft;
  return <Pill tone={entry.tone}>{entry.label}</Pill>;
}
