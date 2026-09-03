"use client";

import { CornerDownLeft, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/icon";
import { cn } from "@/lib/cn";
import { DASHBOARD_NAV_FLAT } from "@/lib/site";

/**
 * Ctrl/⌘-K jump-to-page. Deliberately navigation-only: searching records needs
 * a real API, and a palette that half-searches is worse than one that is
 * honest about what it covers.
 */
export interface PaletteItem {
  label: string;
  href: string;
  icon: string;
  description: string;
  group: string;
}

export function CommandPalette({
  onClose,
  /** Defaults to the client-portal nav; the firm shell passes FIRM_NAV_FLAT. */
  items = DASHBOARD_NAV_FLAT,
}: {
  onClose: () => void;
  items?: PaletteItem[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(term) ||
        item.description.toLowerCase().includes(term) ||
        item.group.toLowerCase().includes(term),
    );
  }, [query, items]);

  // The parent mounts this only while the palette is open, so `useState` above
  // already gives a clean query on every open — no reset effect needed.
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 10);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = previous;
    };
  }, []);

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => (results.length ? (current + 1) % results.length : 0));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) =>
        results.length ? (current - 1 + results.length) % results.length : 0,
      );
    }
    if (event.key === "Enter" && results[active]) {
      event.preventDefault();
      go(results[active].href);
    }
  };

  return (
    <div className="fixed inset-0 z-100 flex items-start justify-center p-4 pt-[12vh]">
      <div
        className="animate-fade absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search pages"
        onKeyDown={onKeyDown}
        className="animate-in relative w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-float)]"
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-4 shrink-0 text-muted" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            placeholder="Jump to a page…"
            aria-label="Search pages"
            className="h-13 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted/70"
          />
          <kbd className="shrink-0 rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-medium text-muted">
            Esc
          </kbd>
        </div>

        <ul className="scroll-thin max-h-80 overflow-y-auto p-2" role="listbox">
          {results.length === 0 ? (
            <li className="px-3 py-8 text-center text-[13.5px] text-muted">
              No pages match “{query}”.
            </li>
          ) : (
            results.map((item, index) => (
              <li key={item.href} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  onClick={() => go(item.href)}
                  onPointerEnter={() => setActive(index)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition",
                    index === active ? "bg-surface-2" : "hover:bg-surface-2/60",
                  )}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                    <Icon name={item.icon} className="size-[18px] text-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold text-ink">{item.label}</span>
                    <span className="block truncate text-[12px] text-muted">
                      {item.description}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] text-muted">{item.group}</span>
                  {index === active ? (
                    <CornerDownLeft className="size-3.5 shrink-0 text-muted" aria-hidden />
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>

        <div className="flex items-center gap-4 border-t border-line bg-surface-2/50 px-4 py-2.5 text-[11.5px] text-muted">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-line bg-surface px-1 py-0.5">↑</kbd>
            <kbd className="rounded border border-line bg-surface px-1 py-0.5">↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-line bg-surface px-1 py-0.5">↵</kbd>
            open
          </span>
        </div>
      </div>
    </div>
  );
}
