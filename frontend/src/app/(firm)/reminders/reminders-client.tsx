"use client";

import {
  BellRing,
  CalendarClock,
  Check,
  CheckCheck,
  CircleCheck,
  Clock,
  Kanban,
  RefreshCw,
  Signature,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ComponentType } from "react";

import { KpiTile } from "@/components/charts";
import { DashboardHeader, KpiRow } from "@/components/dashboard/page-shell";
import { useToast } from "@/components/toast";
import { Alert, Button, EmptyState, Modal, Field, Input } from "@/components/ui";
import { post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import type {
  Reminder,
  ReminderBoard,
  ReminderCounts,
  ReminderKind,
  ReminderSweepResult,
  ReminderUrgency,
} from "@/lib/types";

/**
 * Grouped by urgency, not by kind. The question a partner opens this page with
 * is "what is about to be late", and a deadline 2 days out and a task 2 days out
 * are the same problem — so the kind is a chip on the row rather than a section.
 *
 * Colour follows the same rule as /deadlines and the email digest: overdue red,
 * inside the lead time orange, beyond that green.
 */
const GROUPS: {
  urgency: ReminderUrgency;
  label: string;
  bar: string;
  chip: string;
  date: string;
  blurb: string;
}[] = [
  {
    urgency: "overdue",
    label: "Overdue",
    bar: "bg-danger",
    chip: "bg-danger-soft text-danger",
    date: "text-danger",
    blurb: "Past the due date — deal with these first",
  },
  {
    urgency: "due_today",
    label: "Due today",
    bar: "bg-danger/70",
    chip: "bg-danger-soft text-danger",
    date: "text-danger",
    blurb: "The filing date is today",
  },
  {
    urgency: "due_soon",
    label: "Due soon",
    bar: "bg-warn",
    chip: "bg-warn-soft text-warn",
    date: "text-warn",
    blurb: "Inside 10 days",
  },
  {
    urgency: "upcoming",
    label: "Upcoming",
    bar: "bg-success",
    chip: "bg-success-soft text-success",
    date: "text-success",
    blurb: "Flagged early — more than 10 days out",
  },
];

const KIND_META: Record<
  ReminderKind,
  { icon: ComponentType<{ className?: string }>; label: string; tone: string }
> = {
  deadline: { icon: CalendarClock, label: "Deadline", tone: "bg-danger-soft text-danger" },
  task: { icon: Kanban, label: "Task", tone: "bg-warn-soft text-warn" },
  letter: { icon: Signature, label: "Letter", tone: "bg-brand-soft text-brand" },
  portal: { icon: BellRing, label: "Portal", tone: "bg-info-soft text-info" },
};

const KIND_FILTERS: { value: "all" | ReminderKind; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "deadline", label: "Deadlines" },
  { value: "task", label: "Tasks" },
  { value: "letter", label: "Letters" },
];

/** "10 days left" / "3 days overdue" — the wording the email uses too. */
function countdown(days: number): string {
  if (days < -1) return `${Math.abs(days)} days overdue`;
  if (days === -1) return "1 day overdue";
  if (days === 0) return "Due today";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

function recount(rows: Reminder[]): ReminderCounts {
  const live = rows.filter((row) => row.status !== "done" && row.status !== "dismissed");
  return {
    open: live.length,
    unacknowledged: rows.filter((row) => row.status === "open").length,
    overdue: live.filter((row) => row.urgency === "overdue").length,
    due_today: live.filter((row) => row.urgency === "due_today").length,
    due_soon: live.filter((row) => row.urgency === "due_soon").length,
    upcoming: live.filter((row) => row.urgency === "upcoming").length,
  };
}

export function RemindersClient({
  board,
  isLive,
}: {
  board: ReminderBoard;
  isLive: boolean;
}) {
  const toast = useToast();
  const session = useSession();

  const [rows, setRows] = useState<Reminder[]>(board.reminders);
  const [kind, setKind] = useState<"all" | ReminderKind>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [snoozing, setSnoozing] = useState<Reminder | null>(null);
  const [snoozeDate, setSnoozeDate] = useState("");
  /** Earliest date the snooze picker accepts — stamped when the modal opens. */
  const [snoozeFloor, setSnoozeFloor] = useState("");

  const counts = useMemo(() => recount(rows), [rows]);

  const visible = useMemo(
    () =>
      rows.filter((row) => {
        const resolved = row.status === "done" || row.status === "dismissed";
        if (resolved !== showResolved) return false;
        if (kind !== "all" && row.kind !== kind) return false;
        if (unreadOnly && row.status !== "open") return false;
        return true;
      }),
    [rows, kind, unreadOnly, showResolved],
  );

  /**
   * Optimistic on purpose: acknowledging a reminder is a fast, low-stakes,
   * frequently repeated action, and waiting a round-trip per row makes clearing
   * a morning's list feel broken. A failure rolls the row back and says so.
   */
  const act = async (
    row: Reminder,
    path: string,
    patch: Partial<Reminder>,
    body?: unknown,
  ) => {
    const previous = rows;
    setRows((current) => current.map((item) => (item.id === row.id ? { ...item, ...patch } : item)));
    if (!isLive) return true;

    setBusy(row.id);
    try {
      await post(`/reminders/${row.id}/${path}`, body);
      session.refresh();
      return true;
    } catch (error) {
      setRows(previous);
      toast.error(
        "Could not update that reminder",
        error instanceof Error ? error.message : "Please try again.",
      );
      return false;
    } finally {
      setBusy(null);
    }
  };

  const acknowledge = (row: Reminder) =>
    void act(row, "acknowledge", {
      status: "acknowledged",
      acknowledged_at: new Date().toISOString(),
      snoozed_until: null,
    });

  const resolve = (row: Reminder) =>
    void act(row, "done", { status: "done" }).then((ok) => {
      if (ok) {
        toast.success(
          "Marked done",
          row.deadline_id
            ? "The underlying deadline has been filed too."
            : "It will stop appearing on the board.",
        );
      }
    });

  const dismiss = (row: Reminder) => void act(row, "dismiss", { status: "dismissed" });

  const reopen = (row: Reminder) =>
    void act(row, "reopen", { status: "open", acknowledged_at: null, snoozed_until: null });

  const confirmSnooze = () => {
    if (!snoozing || !snoozeDate) return;
    const row = snoozing;
    setSnoozing(null);
    void act(row, "snooze", { status: "snoozed", snoozed_until: snoozeDate }, { until: snoozeDate }).then(
      (ok) => {
        if (ok) toast.info("Snoozed", `Hidden from triage until ${formatDate(snoozeDate)}.`);
      },
    );
  };

  const acknowledgeAll = async () => {
    const stamp = new Date().toISOString();
    const previous = rows;
    setRows((current) =>
      current.map((item) =>
        item.status === "open" ? { ...item, status: "acknowledged", acknowledged_at: stamp } : item,
      ),
    );
    if (!isLive) {
      toast.success("All reminders acknowledged", `${counts.unacknowledged} marked as seen.`);
      return;
    }
    try {
      await post("/reminders/acknowledge-all");
      session.refresh();
      toast.success("All reminders acknowledged", `${counts.unacknowledged} marked as seen.`);
    } catch (error) {
      setRows(previous);
      toast.error(
        "Could not acknowledge them",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  };

  /** Runs the sweep now instead of waiting for the daily scheduled run. */
  const checkNow = async () => {
    if (!isLive) {
      toast.info(
        "Demo mode",
        "Connect the API and the sweep will raise real reminders and email your admins.",
      );
      return;
    }
    setChecking(true);
    try {
      const result = await post<ReminderSweepResult>("/reminders/run");
      session.refresh();
      if (result.created > 0) {
        toast.success(
          `${result.created} new reminder${result.created === 1 ? "" : "s"}`,
          result.emailed > 0
            ? `Emailed to ${result.emailed} administrator${result.emailed === 1 ? "" : "s"}. Reload to see them.`
            : "Reload to see them.",
        );
      } else {
        toast.info("Nothing new", result.message);
      }
    } catch (error) {
      toast.error(
        "Could not run the check",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
      <DashboardHeader
        title="Reminders"
        subtitle="Every client deadline, task and unsigned letter that has crossed a lead time — 30, 14, 10, 7, 3 and 1 days out, then daily once late"
        actions={
          <>
            {/* Admin-only server-side: a sweep emails every owner and admin
                of the firm, so POST /reminders/run is gated. Hide it rather
                than let a member click into a 403. The daily scheduler runs
                the sweep for everyone regardless of who is looking. */}
            {session.isAdmin ? (
              <Button
                variant="secondary"
                icon={<RefreshCw className={cn("size-4", checking && "animate-spin")} />}
                onClick={() => void checkNow()}
                loading={checking}
              >
                Check now
              </Button>
            ) : null}
            <Button
              icon={<CheckCheck className="size-4" />}
              onClick={() => void acknowledgeAll()}
              disabled={counts.unacknowledged === 0}
            >
              Acknowledge all
            </Button>
          </>
        }
      />

      {!isLive ? (
        <div className="mb-5">
          <Alert tone="info" title="Sample reminders">
            These are generated from the demo deadlines using the same lead-time ladder as the
            server. Once the API is reachable, this board shows your firm&apos;s real reminders and
            the daily sweep emails your owners and administrators.
          </Alert>
        </div>
      ) : null}

      <KpiRow>
        <KpiTile
          tone="rose"
          value={String(counts.overdue)}
          label="Overdue"
          hint="Past the due date"
          icon={<TriangleAlert className="size-5" />}
        />
        <KpiTile
          tone="amber"
          value={String(counts.due_today + counts.due_soon)}
          label="Due soon"
          hint={`${counts.due_today} today · ${counts.due_soon} within 10 days`}
          icon={<Clock className="size-5" />}
        />
        <KpiTile
          tone="blue"
          value={String(counts.unacknowledged)}
          label="Unacknowledged"
          hint="Nobody has looked at these yet"
          icon={<BellRing className="size-5" />}
        />
        <KpiTile
          tone="green"
          value={String(counts.upcoming)}
          label="Flagged early"
          hint="More than 10 days out"
          icon={<CircleCheck className="size-5" />}
        />
      </KpiRow>

      <div className="mt-6 mb-5 flex flex-wrap items-center gap-2">
        {KIND_FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setKind(option.value)}
            aria-pressed={kind === option.value}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition",
              kind === option.value
                ? "border-brand bg-brand text-white"
                : "border-line text-muted hover:bg-surface-2 hover:text-ink",
            )}
          >
            {option.label}
            <span
              className={cn(
                "rounded-full px-1.5 text-[11px] tabular-nums",
                kind === option.value ? "bg-white/20" : "bg-surface-2",
              )}
            >
              {option.value === "all"
                ? rows.filter((row) => row.status !== "done" && row.status !== "dismissed").length
                : rows.filter(
                    (row) =>
                      row.kind === option.value &&
                      row.status !== "done" &&
                      row.status !== "dismissed",
                  ).length}
            </span>
          </button>
        ))}

        <span className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden />

        <button
          type="button"
          onClick={() => setUnreadOnly((value) => !value)}
          aria-pressed={unreadOnly}
          className={cn(
            "rounded-full border px-3 py-1.5 text-[13px] font-medium transition",
            unreadOnly
              ? "border-brand bg-brand text-white"
              : "border-line text-muted hover:bg-surface-2 hover:text-ink",
          )}
        >
          Unacknowledged only
        </button>
        <button
          type="button"
          onClick={() => setShowResolved((value) => !value)}
          aria-pressed={showResolved}
          className={cn(
            "rounded-full border px-3 py-1.5 text-[13px] font-medium transition",
            showResolved
              ? "border-brand bg-brand text-white"
              : "border-line text-muted hover:bg-surface-2 hover:text-ink",
          )}
        >
          {showResolved ? "Showing resolved" : "Show resolved"}
        </button>
      </div>

      {visible.length === 0 ? (
        <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
          <EmptyState
            title={showResolved ? "Nothing resolved yet" : "Nothing needs chasing"}
            description={
              showResolved
                ? "Reminders you mark done or dismiss will collect here."
                : "No client deadline, task or letter has crossed a reminder threshold. Run “Check now” to look again."
            }
          />
        </section>
      ) : (
        <div className="space-y-5">
          {GROUPS.map((group) => {
            const groupRows = visible
              .filter((row) => row.urgency === group.urgency)
              .sort((a, b) => a.days_remaining - b.days_remaining);
            if (groupRows.length === 0) return null;

            return (
              <section
                key={group.urgency}
                className="overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]"
              >
                <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
                  <span className={cn("h-6 w-1 shrink-0 rounded-full", group.bar)} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-[14.5px] font-bold text-ink">{group.label}</h2>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums",
                          group.chip,
                        )}
                      >
                        {groupRows.length}
                      </span>
                    </div>
                    <p className="text-[12.5px] text-muted">{group.blurb}</p>
                  </div>
                </div>

                <ul className="divide-y divide-line">
                  {groupRows.map((row) => {
                    const meta = KIND_META[row.kind];
                    const KindIcon = meta.icon;
                    const isOpen = row.status === "open";
                    const resolved = row.status === "done" || row.status === "dismissed";

                    return (
                      <li
                        key={row.id}
                        className={cn(
                          "flex flex-wrap items-center gap-x-4 gap-y-2.5 px-5 py-3.5 transition",
                          isOpen && "bg-brand-soft/20",
                          busy === row.id && "opacity-60",
                        )}
                      >
                        <span
                          className={cn(
                            "grid size-9 shrink-0 place-items-center rounded-lg",
                            meta.tone,
                          )}
                          title={meta.label}
                        >
                          <KindIcon className="size-4" />
                        </span>

                        <span className="min-w-0 flex-1 basis-64">
                          <span className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                "text-[13.5px] text-ink",
                                isOpen ? "font-semibold" : "font-medium",
                              )}
                            >
                              {row.link ? (
                                <Link href={row.link} className="transition hover:text-brand hover:underline">
                                  {row.title}
                                </Link>
                              ) : (
                                row.title
                              )}
                            </span>
                            {isOpen ? (
                              <span
                                className="size-1.5 shrink-0 rounded-full bg-brand"
                                aria-label="Not yet acknowledged"
                              />
                            ) : null}
                            {row.status === "snoozed" && row.snoozed_until ? (
                              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-semibold text-muted">
                                Snoozed to {formatDate(row.snoozed_until)}
                              </span>
                            ) : null}
                            {resolved ? (
                              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-semibold text-muted capitalize">
                                {row.status}
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block truncate text-[12.5px] text-muted">
                            {row.client_name ? (
                              row.client_id ? (
                                <Link
                                  href={`/clients/${row.client_id}`}
                                  className="transition hover:text-brand hover:underline"
                                >
                                  {row.client_name}
                                </Link>
                              ) : (
                                row.client_name
                              )
                            ) : (
                              "Firm-wide"
                            )}
                            {" · "}
                            {meta.label}
                            {row.assignee_name ? ` · ${row.assignee_name}` : ""}
                            {row.emailed_at ? " · emailed" : ""}
                          </span>
                        </span>

                        <span className="w-32 shrink-0 text-right">
                          <span className={cn("block text-[12.5px] font-semibold", group.date)}>
                            {countdown(row.days_remaining)}
                          </span>
                          <span className="block text-[11.5px] text-muted">
                            {formatDate(row.due_date)}
                          </span>
                        </span>

                        <span className="flex shrink-0 items-center gap-1">
                          {resolved ? (
                            <IconAction
                              label="Reopen"
                              onClick={() => reopen(row)}
                              icon={<Undo2 className="size-4" />}
                            />
                          ) : (
                            <>
                              {isOpen ? (
                                <IconAction
                                  label="Acknowledge"
                                  onClick={() => acknowledge(row)}
                                  icon={<Check className="size-4" />}
                                />
                              ) : null}
                              <IconAction
                                label="Snooze"
                                onClick={() => {
                                  setSnoozing(row);
                                  setSnoozeDate("");
                                  // Captured on open, not during render: reading
                                  // the clock while rendering is impure and can
                                  // disagree between renders.
                                  setSnoozeFloor(
                                    new Date(Date.now() + 86_400_000)
                                      .toISOString()
                                      .slice(0, 10),
                                  );
                                }}
                                icon={<Clock className="size-4" />}
                              />
                              <IconAction
                                label={row.deadline_id ? "Mark done and file" : "Mark done"}
                                onClick={() => resolve(row)}
                                icon={<CircleCheck className="size-4" />}
                                tone="success"
                              />
                              <IconAction
                                label="Dismiss"
                                onClick={() => dismiss(row)}
                                icon={<X className="size-4" />}
                                tone="danger"
                              />
                            </>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <p className="mt-5 rounded-xl border border-line bg-surface-2/50 p-5 text-[13px] leading-relaxed text-muted">
        Each reminder fires once per lead time, so the same deadline warns you at 10 days, again at
        3, and again once it is late — never the same warning every morning. Owners and
        administrators also receive one email per sweep covering everything new, and the bell in the
        top bar blinks while anything is unread.
      </p>

      <Modal
        open={snoozing !== null}
        onClose={() => setSnoozing(null)}
        title="Snooze this reminder"
        description="It disappears from triage until the date you pick, then comes back."
        footer={
          <>
            <Button variant="secondary" onClick={() => setSnoozing(null)}>
              Cancel
            </Button>
            <Button
              icon={<Clock className="size-4" />}
              onClick={confirmSnooze}
              disabled={!snoozeDate}
            >
              Snooze
            </Button>
          </>
        }
      >
        {snoozing ? (
          <>
            <p className="mb-4 text-[13.5px] text-ink-soft">{snoozing.title}</p>
            <Field
              label="Wake it up on"
              hint="Must be in the future. The underlying deadline is untouched."
            >
              <Input
                type="date"
                value={snoozeDate}
                min={snoozeFloor}
                onChange={(event) => setSnoozeDate(event.target.value)}
              />
            </Field>
          </>
        ) : null}
      </Modal>
    </>
  );
}

function IconAction({
  label,
  onClick,
  icon,
  tone = "neutral",
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  tone?: "neutral" | "success" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-8 place-items-center rounded-lg text-muted transition",
        tone === "success" && "hover:bg-success-soft hover:text-success",
        tone === "danger" && "hover:bg-danger-soft hover:text-danger",
        tone === "neutral" && "hover:bg-surface-2 hover:text-ink",
      )}
    >
      {icon}
    </button>
  );
}
