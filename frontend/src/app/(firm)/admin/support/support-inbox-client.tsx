"use client";

import { Building2, MessageSquare, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, EmptyState, Input, Modal } from "@/components/ui";
import { get } from "@/lib/api";
import { cn } from "@/lib/cn";
import { relativeTime } from "@/lib/format";
import type { SupportCompanyOption, SupportThreadSummary } from "@/lib/types";

export function SupportInboxClient({ threads }: { threads: SupportThreadSummary[] }) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  // null = not fetched yet (shows "Loading"); [] = fetched, none available.
  const [companies, setCompanies] = useState<SupportCompanyOption[] | null>(null);
  const [query, setQuery] = useState("");

  const openPicker = () => {
    setPickerOpen(true);
    if (companies === null) {
      get<SupportCompanyOption[]>("/admin/support/companies")
        .then(setCompanies)
        .catch(() => setCompanies([]));
    }
  };

  const needle = query.trim().toLowerCase();
  const filtered = (companies ?? []).filter((company) => company.name.toLowerCase().includes(needle));

  return (
    <>
      <div className="mb-4 flex items-center justify-end">
        <Button icon={<Plus className="size-4" />} onClick={openPicker}>
          New message
        </Button>
      </div>

      {threads.length === 0 ? (
        <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
          <EmptyState
            icon={<MessageSquare className="size-6" />}
            title="No messages yet"
            description="When a company owner messages the platform from their portal, their conversation shows up here — or start one yourself with “New message”."
          />
        </section>
      ) : (
        <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
          <ul className="divide-y divide-line">
            {threads.map((thread) => {
              const unread = thread.unread > 0;
              return (
                <li key={thread.tenant_id}>
                  <Link
                    href={`/admin/support/${thread.tenant_id}`}
                    className={cn(
                      "flex items-start gap-3.5 px-5 py-4 transition hover:bg-surface-2",
                      unread && "bg-brand-soft/25",
                    )}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-info-soft text-info">
                      <MessageSquare className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[13.5px] font-semibold text-ink">{thread.tenant_name}</span>
                        {unread ? (
                          <span className="rounded-full bg-danger px-1.5 py-0.5 text-[10.5px] font-bold text-white tabular-nums">
                            {thread.unread}
                          </span>
                        ) : null}
                      </span>
                      {thread.last_message_preview ? (
                        <span className="mt-0.5 block truncate text-[13px] text-muted">
                          {thread.last_from_platform ? <span className="text-ink-soft">You: </span> : null}
                          {thread.last_message_preview}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-[11.5px] text-muted">{relativeTime(thread.last_message_at)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="New message"
        description="Pick a company to open a support conversation with."
      >
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search companies…"
              className="pl-9"
              autoFocus
            />
          </div>
          {companies === null ? (
            <p className="py-8 text-center text-[13px] text-muted">Loading companies…</p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-muted">
              {companies.length === 0 ? "No companies yet." : "No companies match that search."}
            </p>
          ) : (
            <div className="scroll-thin max-h-80 overflow-y-auto rounded-lg border border-line">
              <ul className="divide-y divide-line">
                {filtered.map((company) => (
                  <li key={company.tenant_id}>
                    <button
                      type="button"
                      onClick={() => router.push(`/admin/support/${company.tenant_id}`)}
                      className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-surface-2"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted">
                        <Building2 className="size-4" />
                      </span>
                      <span className="truncate text-[13.5px] font-medium text-ink">{company.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
