"use client";

import { cn } from "@/lib/cn";
import { TriangleAlert, Check, ChevronLeft, ChevronRight, Eye, EyeOff, Info, LoaderCircle, X } from "lucide-react";
import Link from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

export { cn };

/* -------------------------------------------------------------------------- */
/* Button                                                                      */
/* -------------------------------------------------------------------------- */
export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "soft"
  | "onDark";
export type ButtonSize = "sm" | "md" | "lg" | "xl";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "brand-gradient text-white shadow-sm hover:brightness-110 active:brightness-95 disabled:opacity-60",
  secondary:
    "bg-surface text-ink border border-line-strong hover:bg-surface-2 hover:border-line-strong disabled:text-muted",
  ghost: "text-ink-soft hover:bg-surface-2 hover:text-ink",
  danger: "bg-danger text-white hover:brightness-110",
  soft: "bg-brand-soft text-brand-ink hover:brightness-105",
  onDark: "bg-white/10 text-white border border-white/20 backdrop-blur hover:bg-white/18",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-9.5 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-[15px] gap-2",
  xl: "h-13 px-7 text-base gap-2.5",
};

export const BUTTON_BASE =
  "inline-flex items-center justify-center rounded-full font-semibold transition " +
  "disabled:cursor-not-allowed disabled:opacity-70";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Rendered before the label. Replaced by the spinner while loading. */
  icon?: ReactNode;
  /** Rendered after the label — use for the "→" affordance on CTAs. */
  trailingIcon?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  trailingIcon,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" /> : icon}
      {children}
      {loading ? null : trailingIcon}
    </button>
  );
}

/** Same visual language as <Button>, but renders a real anchor for navigation. */
export function ButtonLink({
  variant = "primary",
  size = "md",
  icon,
  trailingIcon,
  className,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  trailingIcon?: ReactNode;
}) {
  return (
    <Link
      {...props}
      href={props.href}
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
    >
      {icon}
      {children}
      {trailingIcon}
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                    */
/* -------------------------------------------------------------------------- */
export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn(
        "rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Form controls                                                               */
/* -------------------------------------------------------------------------- */
const CONTROL =
  "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink " +
  "placeholder:text-muted/70 transition focus:border-brand disabled:bg-surface-2 disabled:text-muted";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(CONTROL, "h-9.5", className)} />;
}

/**
 * Every password field in the app — login, signup, reset, the forced
 * temp-password change, account settings — should look and behave
 * identically, so this is the one place "show/hide" lives rather than each
 * page hand-rolling its own `reveal` state and eye button (three pages did,
 * independently, before this existed).
 */
export function PasswordInput({
  className,
  autoComplete = "current-password",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        type={revealed ? "text" : "password"}
        autoComplete={autoComplete}
        className={cn(CONTROL, "h-9.5 pr-10", className)}
      />
      <button
        type="button"
        onClick={() => setRevealed((value) => !value)}
        aria-label={revealed ? "Hide password" : "Show password"}
        aria-pressed={revealed}
        className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-lg text-muted transition hover:text-brand active:scale-90"
      >
        {/* Re-keying on `revealed` re-triggers the pop-in each toggle, rather
            than a static icon swap — `.animate-scale` already backs off under
            prefers-reduced-motion (globals.css), so this stays a no-op there. */}
        <span key={revealed ? "hide" : "show"} className="animate-scale inline-flex">
          {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </span>
      </button>
    </div>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(CONTROL, "min-h-24 resize-y leading-relaxed", className)} />;
}

/**
 * The styled native `<select>`. Kept only for the rare case where the OS
 * picker is genuinely wanted (very long unfiltered lists on mobile). Everything
 * else should use `Select` from `@/components/select`, re-exported below — it
 * renders a real listbox, so the options obey our tokens and dark mode.
 */
export function NativeSelect({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn(CONTROL, "h-9.5 pr-8", className)}>
      {children}
    </select>
  );
}

export { Select, Menu, toOptions } from "./select";
export type { SelectOption, SelectGroup, SelectProps, MenuItem } from "./select";

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <label className={cn("block", className)} htmlFor={id}>
      {label ? (
        <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">
          {label}
          {required ? <span className="ml-0.5 text-danger">*</span> : null}
        </span>
      ) : null}
      {children}
      {error ? (
        <span className="mt-1 block text-[12px] text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[12px] text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function Checkbox({
  label,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2.5 text-sm text-ink-soft", className)}>
      <input
        type="checkbox"
        {...props}
        className="mt-0.5 size-4 shrink-0 rounded border-line-strong accent-[var(--brand)]"
      />
      <span>{label}</span>
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* Badges & avatars                                                            */
/* -------------------------------------------------------------------------- */
export type Tone = "neutral" | "brand" | "success" | "warn" | "danger" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-soft border-line",
  brand: "bg-brand-soft text-brand-ink border-transparent",
  success: "bg-success-soft text-success border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
  info: "bg-info-soft text-info border-transparent",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ tone = "neutral" }: { tone?: Tone }) {
  const colours: Record<Tone, string> = {
    neutral: "bg-muted",
    brand: "bg-brand",
    success: "bg-success",
    warn: "bg-warn",
    danger: "bg-danger",
    info: "bg-info",
  };
  return <span className={cn("inline-block size-1.5 rounded-full", colours[tone])} />;
}

export function Avatar({
  name,
  size = 32,
  className,
}: {
  name: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const label = (name ?? "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand-ink",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      title={name ?? undefined}
    >
      {label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Table                                                                       */
/* -------------------------------------------------------------------------- */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("scroll-thin w-full overflow-x-auto", className)}>
      <table className="w-full min-w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function TH({
  children,
  className,
  align = "left",
}: {
  children?: ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      className={cn(
        "sticky top-0 z-10 border-b border-line bg-surface-2/80 px-4 py-2.5 text-[12px] font-semibold tracking-wide text-muted uppercase backdrop-blur",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function TD({
  children,
  className,
  align = "left",
}: {
  children?: ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
}) {
  return (
    <td
      className={cn(
        "border-b border-line px-4 py-3 align-middle text-ink-soft",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </td>
  );
}

/* -------------------------------------------------------------------------- */
/* State displays                                                              */
/* -------------------------------------------------------------------------- */
export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cn("size-4 animate-spin text-muted", className)} />;
}

export function LoadingBlock({ label = "Loading…", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="space-y-2 p-5" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="h-10 animate-pulse rounded-lg bg-surface-2"
          style={{ animationDelay: `${index * 90}ms` }}
        />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon ? <div className="rounded-full bg-surface-2 p-3 text-muted">{icon}</div> : null}
      <div>
        <p className="font-medium text-ink">{title}</p>
        {description ? (
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
  onDismiss,
  className,
}: {
  tone?: "info" | "success" | "warn" | "danger";
  title?: string;
  children?: ReactNode;
  onDismiss?: () => void;
  /** Layout only — spacing against neighbouring blocks. */
  className?: string;
}) {
  const icons = {
    info: <Info className="size-4" />,
    success: <Check className="size-4" />,
    warn: <TriangleAlert className="size-4" />,
    danger: <TriangleAlert className="size-4" />,
  };
  const tones = {
    info: "bg-info-soft text-info",
    success: "bg-success-soft text-success",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
  };
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg px-3.5 py-2.5 text-sm",
        tones[tone],
        className,
      )}
    >
      <span className="mt-0.5 shrink-0">{icons[tone]}</span>
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div> : null}
      </div>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} className="shrink-0 opacity-70 hover:opacity-100">
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
}) {
  const accents: Record<Tone, string> = {
    neutral: "text-ink",
    brand: "text-brand",
    success: "text-success",
    warn: "text-warn",
    danger: "text-danger",
    info: "text-info",
  };
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12.5px] font-medium tracking-wide text-muted uppercase">{label}</p>
        {icon ? <span className={cn("shrink-0", accents[tone])}>{icon}</span> : null}
      </div>
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums", accents[tone])}>{value}</p>
      {hint ? <p className="mt-1 text-[12.5px] text-muted">{hint}</p> : null}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal                                                                       */
/* -------------------------------------------------------------------------- */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "md",
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: "sm" | "md" | "lg" | "xl";
  /**
   * When false, Escape, the backdrop and the close button all stop working —
   * for the rare modal the user genuinely must complete, where the API will
   * refuse everything else anyway (see ForcePasswordModal). Escaping such a
   * dialog only produces a wall of errors with no way back to it.
   */
  dismissible?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dismissible) onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose, dismissible]);

  if (!open) return null;

  const widths = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-[2px] sm:p-8">
      <div className="absolute inset-0" onClick={dismissible ? onClose : undefined} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "animate-in relative my-auto w-full rounded-xl border border-line bg-surface shadow-xl",
          widths[width],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
          </div>
          {dismissible ? (
            <button
              type="button"
              onClick={onClose}
              className="-m-1 rounded-lg p-1 text-muted transition hover:bg-surface-2 hover:text-ink"
              aria-label="Close"
            >
              <X className="size-4.5" />
            </button>
          ) : null}
        </div>
        <div className="scroll-thin max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-2/50 px-5 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tabs                                                                        */
/* -------------------------------------------------------------------------- */
const TabsContext = createContext<{ value: string; onChange: (value: string) => void } | null>(null);

export function Tabs({
  value,
  onChange,
  children,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <TabsContext.Provider value={{ value, onChange }}>
      <div className={cn("flex flex-wrap gap-1 border-b border-line", className)} role="tablist">
        {children}
      </div>
    </TabsContext.Provider>
  );
}

/* -------------------------------------------------------------------------- */
/* Switch, progress, skeleton, pagination, drawer                              */
/* -------------------------------------------------------------------------- */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="text-sm text-ink-soft">{label}</p>
        {description ? <p className="mt-0.5 text-[12.5px] text-muted">{description}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={typeof label === "string" ? label : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50",
          checked ? "bg-brand" : "bg-line-strong",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform",
            checked && "translate-x-5",
          )}
        />
      </button>
    </div>
  );
}

export function Progress({
  value,
  tone = "brand",
  className,
  label,
}: {
  /** 0–100. Values outside the range are clamped. */
  value: number;
  tone?: Tone;
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const fills: Record<Tone, string> = {
    neutral: "bg-muted",
    brand: "bg-brand",
    success: "bg-success",
    warn: "bg-warn",
    danger: "bg-danger",
    info: "bg-info",
  };
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-2", className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-700 ease-out", fills[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-lg", className)} />;
}

export function Pagination({
  page,
  pageCount,
  onPage,
  summary,
}: {
  page: number;
  pageCount: number;
  onPage: (next: number) => void;
  summary?: string;
}) {
  if (pageCount <= 1) {
    return summary ? (
      <div className="flex items-center justify-between px-5 py-3 text-[12.5px] text-muted">
        <span>{summary}</span>
      </div>
    ) : null;
  }

  // Show at most 5 numbered buttons, centred on the current page.
  const start = Math.max(1, Math.min(page - 2, pageCount - 4));
  const pages = Array.from({ length: Math.min(5, pageCount) }, (_, i) => start + i);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
      <span className="text-[12.5px] text-muted">{summary}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="grid size-8 place-items-center rounded-lg border border-line text-muted transition hover:bg-surface-2 hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent"
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </button>
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPage(p)}
            aria-current={p === page ? "page" : undefined}
            className={cn(
              "size-8 rounded-lg text-[13px] font-medium tabular-nums transition",
              p === page
                ? "bg-brand text-white"
                : "border border-line text-ink-soft hover:bg-surface-2",
            )}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= pageCount}
          className="grid size-8 place-items-center rounded-lg border border-line text-muted transition hover:bg-surface-2 hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent"
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

/** Right-hand slide-over used for record details. */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-70 flex justify-end">
      <div
        className="animate-fade absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : "Details"}
        className="animate-in relative flex h-full w-[min(30rem,100vw)] flex-col border-l border-line bg-surface shadow-[var(--shadow-float)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-ink">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-m-1 rounded-lg p-1 text-muted transition hover:bg-surface-2 hover:text-ink"
            aria-label="Close panel"
          >
            <X className="size-4.5" />
          </button>
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-2/50 px-5 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Tab({ id, children, count }: { id: string; children: ReactNode; count?: number }) {
  const context = useContext(TabsContext);
  if (!context) throw new Error("<Tab> must be used inside <Tabs>");
  const active = context.value === id;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => context.onChange(id)}
      className={cn(
        "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition",
        active
          ? "border-brand text-brand"
          : "border-transparent text-muted hover:border-line-strong hover:text-ink",
      )}
    >
      {children}
      {count !== undefined ? (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[11px] tabular-nums",
            active ? "bg-brand-soft text-brand-ink" : "bg-surface-2 text-muted",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
