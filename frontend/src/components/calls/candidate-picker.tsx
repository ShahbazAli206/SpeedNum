"use client";

import { Check, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { listCallCandidates, type CallCandidate } from "@/lib/calls-api";
import { cn } from "@/lib/cn";

/**
 * The authorized-candidate list used by both "start a call" and "invite to
 * call" (spec §21). The list comes from GET /calls/candidates, which the
 * server has already filtered with can_call — so anyone shown here is
 * callable, and the create/invite endpoints re-check regardless.
 *
 * `multiple` enables group-call selection; single mode returns as soon as one
 * is chosen. `excludeProfileIds` hides people already in a call (used by the
 * mid-call invite dialog).
 */
export function CandidatePicker({
  multiple = false,
  excludeProfileIds = [],
  onConfirm,
  confirmLabel = "Call",
}: {
  multiple?: boolean;
  excludeProfileIds?: string[];
  onConfirm: (profileIds: string[]) => void;
  confirmLabel?: string;
}) {
  const [candidates, setCandidates] = useState<CallCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    listCallCandidates()
      .then((rows) => {
        if (cancelled) return;
        setCandidates(rows.filter((r) => !excludeProfileIds.includes(r.profile_id)));
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Could not load contacts."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // excludeProfileIds is a fresh array each render; compare by content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excludeProfileIds.join(",")]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (c) => (c.full_name ?? "").toLowerCase().includes(q) || c.email.toLowerCase().includes(q),
    );
  }, [candidates, query]);

  const toggle = (id: string) => {
    if (!multiple) {
      onConfirm([id]);
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
        <Search className="size-4 text-ink-soft" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people"
          className="min-w-0 flex-1 bg-transparent text-sm focus:outline-none"
        />
      </label>

      {loading ? (
        <p className="py-6 text-center text-sm text-ink-soft">Loading…</p>
      ) : error ? (
        <p className="py-6 text-center text-sm text-danger">{error}</p>
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-soft">No one to call.</p>
      ) : (
        <ul className="max-h-72 divide-y divide-line overflow-y-auto">
          {filtered.map((c) => {
            const isSelected = selected.has(c.profile_id);
            return (
              <li key={c.profile_id}>
                <button
                  type="button"
                  onClick={() => toggle(c.profile_id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-1 py-2.5 text-left transition hover:bg-surface-2",
                    isSelected && "bg-surface-2",
                  )}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-semibold text-ink">
                    {(c.full_name || c.email).slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{c.full_name || c.email}</span>
                    <span className="block truncate text-xs text-ink-soft">{c.kind}</span>
                  </span>
                  {multiple && isSelected ? <Check className="size-4 text-brand" aria-hidden /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {multiple ? (
        <button
          type="button"
          disabled={selected.size === 0}
          onClick={() => onConfirm([...selected])}
          className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {confirmLabel}
          {selected.size > 0 ? ` (${selected.size})` : ""}
        </button>
      ) : null}
    </div>
  );
}
