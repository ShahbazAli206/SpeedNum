"use client";

/**
 * The dropdown system.
 *
 * Everything used to be a native `<select>` (see the old `Select` in `ui.tsx`).
 * Native selects can't be styled past the border box — the option list is drawn
 * by the OS, so it ignores our tokens, our dark mode and our type scale, and it
 * can't show a secondary line, an icon or a status dot. Three call sites had
 * also started fighting the primitive's fixed width/height with `!important`
 * overrides (`data-table.tsx`, `team-member-client.tsx`), which is the usual
 * sign that the primitive is too rigid.
 *
 * So: a real listbox.
 *
 *   - `Select` — single choice, the native `<select>` replacement.
 *   - `Menu`   — a button that opens a list of *actions* (Export ▾, row "…").
 *
 * Two implementation notes that are load-bearing:
 *
 * 1. The popover renders through a portal with `position: fixed`. Tables here
 *    live inside `overflow-x-auto` containers, which clip an absolutely
 *    positioned child — the menu would be cut off mid-list. Fixed + portal is
 *    the only thing that reliably escapes an ancestor's overflow.
 * 2. Coordinates are recomputed on scroll and resize while open, because fixed
 *    positioning doesn't follow the trigger on its own.
 *
 * Keyboard contract matches the WAI-ARIA listbox pattern, and is the same one
 * `command-palette.tsx` already established: Up/Down/Home/End to move, Enter or
 * Space to choose, Escape to close, printable characters to type-ahead.
 */

import { cn } from "@/lib/cn";
import { Check, ChevronDown, Search } from "lucide-react";
import {
  createPortal,
} from "react-dom";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */
export type SelectOption = {
  value: string;
  label: string;
  /** Second line under the label — assignee email, service cadence, etc. */
  description?: string;
  /** Small leading dot; use for status/priority colour coding. */
  dot?: string;
  icon?: ReactNode;
  disabled?: boolean;
};

export type SelectGroup = { label: string; options: SelectOption[] };

export type SelectItems = ReadonlyArray<SelectOption | SelectGroup>;

export type SelectSize = "xs" | "sm" | "md";
/** `unstyled` contributes no colour of its own — the caller's `className` owns
 *  the whole look. Used by the status pills, which are tinted by their value. */
export type SelectVariant = "control" | "pill" | "ghost" | "unstyled";

function isGroup(item: SelectOption | SelectGroup): item is SelectGroup {
  return Array.isArray((item as SelectGroup).options);
}

function flatten(items: SelectItems): SelectOption[] {
  const out: SelectOption[] = [];
  for (const item of items) {
    if (isGroup(item)) out.push(...item.options);
    else out.push(item);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Shared popover positioning                                                  */
/* -------------------------------------------------------------------------- */
type Coords = { top: number; left: number; width: number; maxHeight: number };

const GAP = 6;
const VIEWPORT_MARGIN = 12;

/**
 * Places a fixed-position panel against a trigger, flipping above it when the
 * space below is too tight, and clamping horizontally so it never leaves the
 * viewport. Returns null until the first measurement so we never paint the
 * panel at 0,0 for a frame.
 *
 * `measure` is returned rather than run from an effect on open: measuring is a
 * setState, and setState inside an effect body cascades a second render (and
 * trips `react-hooks/set-state-in-effect`). Callers measure in the same event
 * handler that opens the panel, so the first paint already has coordinates.
 * The effect below only subscribes to scroll/resize, which is what effects are
 * actually for.
 */
function usePopoverCoords(
  open: boolean,
  triggerRef: React.RefObject<HTMLElement | null>,
  { matchWidth = true, minWidth = 180, align = "start" }: {
    matchWidth?: boolean;
    minWidth?: number;
    align?: "start" | "end";
  } = {},
) {
  const [coords, setCoords] = useState<Coords | null>(null);

  const measure = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - GAP - VIEWPORT_MARGIN;
    const above = rect.top - GAP - VIEWPORT_MARGIN;
    // Flip up only when below is genuinely cramped *and* above is roomier —
    // otherwise a short list near the bottom would pointlessly jump upward.
    const flip = below < 200 && above > below;
    const maxHeight = Math.max(140, Math.min(flip ? above : below, 320));

    const width = matchWidth ? Math.max(rect.width, minWidth) : minWidth;
    let left = align === "end" ? rect.right - width : rect.left;
    left = Math.min(
      Math.max(VIEWPORT_MARGIN, left),
      Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN),
    );

    setCoords({
      top: flip ? rect.top - GAP - maxHeight : rect.bottom + GAP,
      left,
      width,
      maxHeight,
    });
  }, [triggerRef, matchWidth, minWidth, align]);

  useLayoutEffect(() => {
    if (!open) return;
    // `true` captures scrolls on any ancestor, not just the window — the panel
    // has to track a trigger inside a scrolling table too.
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, measure]);

  // Stale coordinates are harmless: nothing reads them while the panel is
  // closed, and opening always measures first.
  return { coords: open ? coords : null, measure };
}

/** Closes the panel on an outside pointer press or on Escape. */
function useDismiss(
  open: boolean,
  close: () => void,
  refs: Array<React.RefObject<HTMLElement | null>>,
) {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (refs.some((ref) => ref.current?.contains(target))) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, close]);
}

/**
 * `createPortal` needs a DOM target, which doesn't exist during SSR.
 *
 * `useSyncExternalStore` with a never-firing subscription is the sanctioned way
 * to ask "have we hydrated yet": the server snapshot is false, the client one
 * true. The older `useState` + `useEffect(() => setMounted(true))` does the same
 * job but sets state from an effect, which the compiler lint rejects.
 */
const NEVER_CHANGES = () => () => {};
function useMounted() {
  return useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  );
}

const PANEL =
  "z-[70] overflow-hidden rounded-xl border border-line bg-surface " +
  "shadow-[var(--shadow-float)] animate-scale";

const LIST = "max-h-full overflow-y-auto overscroll-contain scroll-thin py-1";

/* -------------------------------------------------------------------------- */
/* Select                                                                      */
/* -------------------------------------------------------------------------- */
const TRIGGER_BASE =
  "inline-flex items-center gap-2 rounded-lg text-left transition " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const TRIGGER_VARIANTS: Record<SelectVariant, string> = {
  control:
    "border border-line-strong bg-surface text-ink hover:border-brand/60 " +
    "data-[open=true]:border-brand disabled:bg-surface-2 disabled:text-muted",
  pill:
    "border border-transparent bg-surface-2 text-ink-soft hover:bg-surface-3 " +
    "data-[open=true]:border-brand",
  ghost:
    "border border-transparent text-ink-soft hover:bg-surface-2 hover:text-ink " +
    "data-[open=true]:bg-surface-2",
  unstyled: "",
};

const TRIGGER_SIZES: Record<SelectSize, string> = {
  xs: "h-7 px-2.5 text-[11.5px]",
  sm: "h-8 px-2.5 text-[13px]",
  md: "h-9.5 px-3 text-sm",
};

export type SelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectItems;
  placeholder?: string;
  size?: SelectSize;
  variant?: SelectVariant;
  /** Extra classes on the trigger. */
  className?: string;
  /**
   * Triggers stretch to their container by default, which is what a form field
   * wants. Pass `false` for a toolbar control and set the width in `className`.
   *
   * This is a prop rather than a `w-*` class in `className` because `cn` is
   * plain clsx with no tailwind-merge: emitting `w-full` here and `w-40` there
   * puts both in the stylesheet and lets source order decide the winner. That
   * exact conflict is what made the data-table filter row wrap.
   */
  fullWidth?: boolean;
  /** Class applied to the trigger label — lets a status pill tint its text. */
  labelClassName?: string;
  disabled?: boolean;
  /** Emits a hidden input so the value posts with a plain HTML form. */
  name?: string;
  id?: string;
  required?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** Filter box. Defaults on once the list is long enough to need one. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Right-align the panel with the trigger — for narrow triggers near an edge. */
  align?: "start" | "end";
  /** Rendered above the options; use for "Clear" style affordances. */
  footer?: ReactNode;
};

export function Select({
  value,
  onValueChange,
  options,
  placeholder = "Select…",
  size = "md",
  variant = "control",
  className,
  fullWidth = true,
  labelClassName,
  disabled,
  name,
  id,
  required,
  searchable,
  searchPlaceholder = "Search…",
  align = "start",
  footer,
  ...aria
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Stored raw and clamped at render: filtering can shrink the list under a
  // stored index, and clamping in an effect would cascade an extra render.
  const [activeRaw, setActiveIndex] = useState(-1);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const typeahead = useRef({ buffer: "", at: 0 });

  const reactId = useId();
  const listId = `${reactId}-listbox`;
  const mounted = useMounted();

  const all = useMemo(() => flatten(options), [options]);
  const selected = all.find((option) => option.value === value) ?? null;

  const withSearch = searchable ?? all.length >= 10;

  // Filtering keeps group structure so headings don't outlive their options.
  const visible = useMemo(() => {
    if (!withSearch || !query.trim()) return options;
    const needle = query.trim().toLowerCase();
    const match = (option: SelectOption) =>
      option.label.toLowerCase().includes(needle) ||
      (option.description?.toLowerCase().includes(needle) ?? false);

    const out: Array<SelectOption | SelectGroup> = [];
    for (const item of options) {
      if (isGroup(item)) {
        const kept = item.options.filter(match);
        if (kept.length) out.push({ label: item.label, options: kept });
      } else if (match(item)) {
        out.push(item);
      }
    }
    return out;
  }, [options, query, withSearch]);

  const visibleFlat = useMemo(() => flatten(visible), [visible]);
  const selectable = useMemo(
    () => visibleFlat.filter((option) => !option.disabled),
    [visibleFlat],
  );

  const activeIndex =
    selectable.length === 0 || activeRaw < 0
      ? -1
      : Math.min(activeRaw, selectable.length - 1);

  const { coords, measure } = usePopoverCoords(open, triggerRef, {
    matchWidth: true,
    align,
  });

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(-1);
  }, []);

  useDismiss(open, close, [triggerRef, panelRef]);

  // Return focus to the trigger when the panel closes, so Tab order survives.
  const closeAndFocus = useCallback(() => {
    close();
    triggerRef.current?.focus();
  }, [close]);

  const openPanel = useCallback(
    (startAt: "selected" | "first" | "last" = "selected") => {
      if (disabled) return;
      measure();
      setOpen(true);
      setQuery("");
      const fallback = startAt === "last" ? selectable.length - 1 : 0;
      const current = selectable.findIndex((option) => option.value === value);
      setActiveIndex(startAt === "selected" && current >= 0 ? current : fallback);
    },
    [disabled, selectable, value, measure],
  );

  const choose = useCallback(
    (option: SelectOption) => {
      if (option.disabled) return;
      onValueChange(option.value);
      closeAndFocus();
    },
    [onValueChange, closeAndFocus],
  );

  // Keep the active option in view as the user arrows past the fold.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`,
    );
    node?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  /**
   * Put focus where the keys are handled, once the open has actually committed.
   *
   * Keyboard handling hangs off the trigger (or off the search box when there
   * is one), and clicking a `<button>` does not focus it in every browser —
   * Safari notably, and any programmatic `.click()`. Focusing imperatively
   * inside the click handler is not enough either: that runs *before* React
   * re-renders for `setOpen(true)`, and the commit can put focus back where it
   * was — on a page whose first field carries `autoFocus`, it lands there and
   * every subsequent arrow key goes to that input instead. Opening the status
   * dropdown on /clients/new and pressing ArrowDown did nothing for exactly
   * that reason.
   *
   * An effect runs after the commit, so it wins regardless of what the render
   * pass did with focus.
   */
  useEffect(() => {
    if (!open) return;
    if (withSearch) searchRef.current?.focus();
    else triggerRef.current?.focus();
  }, [open, withSearch]);

  const move = useCallback(
    (delta: number) => {
      setActiveIndex((index) => {
        if (!selectable.length) return -1;
        const next = index < 0 ? (delta > 0 ? 0 : selectable.length - 1) : index + delta;
        return Math.min(Math.max(next, 0), selectable.length - 1);
      });
    },
    [selectable.length],
  );

  /** Jump to the next option starting with what the user typed. */
  const runTypeahead = useCallback(
    (char: string) => {
      const now = Date.now();
      const state = typeahead.current;
      state.buffer = now - state.at > 800 ? char : state.buffer + char;
      state.at = now;

      const needle = state.buffer.toLowerCase();
      const from = state.buffer.length === 1 ? activeIndex + 1 : activeIndex;
      const order = [
        ...selectable.slice(Math.max(from, 0)),
        ...selectable.slice(0, Math.max(from, 0)),
      ];
      const hit = order.find((option) => option.label.toLowerCase().startsWith(needle));
      if (!hit) return;
      const index = selectable.indexOf(hit);
      if (open) setActiveIndex(index);
      else onValueChange(hit.value);
    },
    [activeIndex, selectable, open, onValueChange],
  );

  const onTriggerKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (open) move(1);
        else openPanel("selected");
        break;
      case "ArrowUp":
        event.preventDefault();
        if (open) move(-1);
        else openPanel("last");
        break;
      case "Home":
        if (open) {
          event.preventDefault();
          setActiveIndex(0);
        }
        break;
      case "End":
        if (open) {
          event.preventDefault();
          setActiveIndex(selectable.length - 1);
        }
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (!open) openPanel("selected");
        else if (activeIndex >= 0) choose(selectable[activeIndex]);
        break;
      case "Escape":
        if (open) {
          event.preventDefault();
          closeAndFocus();
        }
        break;
      case "Tab":
        if (open) close();
        break;
      default:
        // Type-ahead only when there's no search box to receive the keystroke.
        if (!withSearch && event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          runTypeahead(event.key);
        }
    }
  };

  const onSearchKeyDown = (event: React.KeyboardEvent) => {
    if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", "Escape", "Tab"].includes(event.key)) {
      onTriggerKeyDown(event);
    }
  };

  // Position of each option within `selectable` (disabled options get -1).
  // Precomputed rather than incremented inside the JSX map: mutating a `let`
  // from a render callback is exactly what `react-hooks/immutability` forbids.
  const positions = useMemo(() => {
    const map = new Map<string, number>();
    let cursor = -1;
    for (const option of visibleFlat) {
      if (option.disabled) map.set(option.value, -1);
      else map.set(option.value, (cursor += 1));
    }
    return map;
  }, [visibleFlat]);

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        aria-required={required}
        aria-label={aria["aria-label"]}
        aria-labelledby={aria["aria-labelledby"]}
        disabled={disabled}
        data-open={open}
        onClick={() => (open ? closeAndFocus() : openPanel("selected"))}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          TRIGGER_BASE,
          TRIGGER_VARIANTS[variant],
          TRIGGER_SIZES[size],
          "justify-between",
          fullWidth && "w-full",
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected?.dot ? (
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: selected.dot }}
            />
          ) : null}
          {selected?.icon ? <span className="shrink-0">{selected.icon}</span> : null}
          <span
            className={cn(
              "truncate",
              selected ? "text-current" : "text-muted/80",
              labelClassName,
            )}
          >
            {selected?.label ?? placeholder}
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-muted transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {name ? <input type="hidden" name={name} value={value} /> : null}

      {mounted && open && coords
        ? createPortal(
            <div
              ref={panelRef}
              className={cn(PANEL, "flex flex-col")}
              style={{
                position: "fixed",
                top: coords.top,
                left: coords.left,
                width: coords.width,
                maxHeight: coords.maxHeight,
              }}
            >
              {withSearch ? (
                <div className="flex items-center gap-2 border-b border-line px-3">
                  <Search aria-hidden className="size-3.5 shrink-0 text-muted" />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={onSearchKeyDown}
                    placeholder={searchPlaceholder}
                    aria-label={searchPlaceholder}
                    aria-controls={listId}
                    className="h-9 w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-muted/70"
                  />
                </div>
              ) : null}

              <ul
                ref={listRef}
                id={listId}
                role="listbox"
                aria-activedescendant={
                  activeIndex >= 0 ? `${reactId}-option-${activeIndex}` : undefined
                }
                className={cn(LIST, "flex-1")}
              >
                {visible.length === 0 ? (
                  <li className="px-3.5 py-6 text-center text-[13px] text-muted">
                    No matches
                  </li>
                ) : null}

                {visible.map((item, itemIndex) => {
                  if (isGroup(item)) {
                    return (
                      <li key={`group-${itemIndex}`}>
                        <p className="px-3.5 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">
                          {item.label}
                        </p>
                        <ul role="none">
                          {item.options.map((option) =>
                            renderOption(option, positions.get(option.value) ?? -1),
                          )}
                        </ul>
                      </li>
                    );
                  }
                  return renderOption(item, positions.get(item.value) ?? -1);
                })}
              </ul>

              {footer ? <div className="border-t border-line p-1">{footer}</div> : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );

  function renderOption(option: SelectOption, index: number) {
    const isSelected = option.value === value;
    const isActive = index >= 0 && index === activeIndex;
    return (
      <li
        key={option.value}
        id={index >= 0 ? `${reactId}-option-${index}` : undefined}
        role="option"
        aria-selected={isSelected}
        aria-disabled={option.disabled || undefined}
        data-index={index >= 0 ? index : undefined}
        onPointerEnter={() => index >= 0 && setActiveIndex(index)}
        onClick={() => choose(option)}
        className={cn(
          "flex cursor-pointer items-center gap-2.5 px-3.5 py-2 text-[13px] transition-colors",
          option.disabled && "cursor-not-allowed opacity-45",
          isActive ? "bg-surface-2 text-ink" : "text-ink-soft",
          isSelected && "font-medium text-ink",
        )}
      >
        {option.dot ? (
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: option.dot }}
          />
        ) : null}
        {option.icon ? <span className="shrink-0 text-muted">{option.icon}</span> : null}
        <span className="min-w-0 flex-1">
          <span className="block truncate">{option.label}</span>
          {option.description ? (
            <span className="mt-0.5 block truncate text-[11.5px] text-muted">
              {option.description}
            </span>
          ) : null}
        </span>
        {isSelected ? (
          <Check aria-hidden className="size-4 shrink-0 text-brand" />
        ) : null}
      </li>
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Menu — a list of actions, not a value                                       */
/* -------------------------------------------------------------------------- */
export type MenuItem = {
  label: string;
  onSelect?: () => void;
  href?: string;
  icon?: ReactNode;
  description?: string;
  disabled?: boolean;
  danger?: boolean;
  /** Draws a hairline above this item. */
  separated?: boolean;
};

export function Menu({
  trigger,
  items,
  align = "end",
  minWidth = 200,
  className,
  label = "Open menu",
}: {
  /** Rendered inside the trigger button. */
  trigger: ReactNode;
  items: MenuItem[];
  align?: "start" | "end";
  minWidth?: number;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const reactId = useId();
  const mounted = useMounted();

  const enabled = useMemo(() => items.filter((item) => !item.disabled), [items]);
  const { coords, measure } = usePopoverCoords(open, triggerRef, {
    matchWidth: false,
    minWidth,
    align,
  });

  /** Position of each item within `enabled`; disabled items get -1. */
  const positions = useMemo(() => {
    const out: number[] = [];
    let cursor = -1;
    for (const item of items) out.push(item.disabled ? -1 : (cursor += 1));
    return out;
  }, [items]);

  const openPanel = useCallback(
    (index: number) => {
      measure();
      setOpen(true);
      setActiveIndex(index);
    },
    [measure],
  );

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  useDismiss(open, close, [triggerRef, panelRef]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const run = (item: MenuItem) => {
    if (item.disabled) return;
    close();
    triggerRef.current?.focus();
    item.onSelect?.();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) openPanel(0);
        else setActiveIndex((index) => Math.min(index + 1, enabled.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!open) openPanel(enabled.length - 1);
        else setActiveIndex((index) => Math.max(index - 1, 0));
        break;
      case "Home":
        if (open) {
          event.preventDefault();
          setActiveIndex(0);
        }
        break;
      case "End":
        if (open) {
          event.preventDefault();
          setActiveIndex(enabled.length - 1);
        }
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (!open) openPanel(0);
        else if (activeIndex >= 0) run(enabled[activeIndex]);
        break;
      case "Escape":
        if (open) {
          event.preventDefault();
          close();
          triggerRef.current?.focus();
        }
        break;
      case "Tab":
        if (open) close();
        break;
    }
  };

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        data-open={open}
        onClick={() => {
          if (open) close();
          else openPanel(-1);
        }}
        onKeyDown={onKeyDown}
        className={className}
      >
        {trigger}
      </button>

      {mounted && open && coords
        ? createPortal(
            <div
              ref={panelRef}
              className={PANEL}
              style={{
                position: "fixed",
                top: coords.top,
                left: coords.left,
                minWidth: coords.width,
                maxHeight: coords.maxHeight,
              }}
            >
              <div ref={listRef} role="menu" aria-label={label} className={LIST}>
                {items.map((item, index) => {
                  const position = positions[index];
                  const isActive = position >= 0 && position === activeIndex;
                  return (
                    <div key={`${item.label}-${index}`}>
                      {item.separated ? (
                        <div role="separator" className="my-1 h-px bg-line" />
                      ) : null}
                      <button
                        type="button"
                        role="menuitem"
                        id={position >= 0 ? `${reactId}-item-${position}` : undefined}
                        data-index={position >= 0 ? position : undefined}
                        disabled={item.disabled}
                        onPointerEnter={() => position >= 0 && setActiveIndex(position)}
                        onClick={() => run(item)}
                        className={cn(
                          "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] transition-colors",
                          // A disabled item here is only ever the static
                          // name/email identity header (the only two call
                          // sites in the app), never a real unavailable
                          // action — it must stay fully readable, just
                          // non-interactive, not dimmed like a disabled choice.
                          item.disabled
                            ? "cursor-default"
                            : item.danger
                              ? "text-danger hover:bg-danger-soft"
                              : isActive
                                ? "bg-surface-2 text-ink"
                                : "text-ink-soft",
                        )}
                      >
                        {item.icon ? (
                          <span className={cn("shrink-0", !item.danger && "text-muted")}>
                            {item.icon}
                          </span>
                        ) : null}
                        <span className="min-w-0 flex-1">
                          <span className={cn("block truncate", item.disabled ? "font-semibold text-ink" : undefined)}>
                            {item.label}
                          </span>
                          {item.description ? (
                            <span
                              className={cn(
                                "mt-0.5 block truncate text-[11.5px]",
                                item.disabled ? "text-ink-soft" : "text-muted",
                              )}
                            >
                              {item.description}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */
/** `["todo","done"]` → options, or `[["todo","To do"]]` for explicit labels. */
export function toOptions(
  values: ReadonlyArray<string | readonly [string, string]>,
): SelectOption[] {
  return values.map((entry) =>
    typeof entry === "string"
      ? { value: entry, label: entry }
      : { value: entry[0], label: entry[1] },
  );
}
