"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "speednum-theme";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

/**
 * Three-way theme switch. `system` removes the attribute entirely so the
 * `prefers-color-scheme` block in globals.css takes back over.
 *
 * Renders a fixed-size placeholder until mounted — reading localStorage during
 * render would desync the server and client markup.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // localStorage is an external system the server cannot read, so adopting
    // its value after mount is exactly what an effect is for. It runs once and
    // cannot cascade.
    const stored = localStorage.getItem(STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored === "light" || stored === "dark") setTheme(stored);
    setMounted(true);
  }, []);

  const choose = (next: Theme) => {
    setTheme(next);
    apply(next);
    try {
      if (next === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private-browsing quota errors are not worth surfacing.
    }
  };

  if (!mounted) {
    return <div className={cn("h-8 w-[6.5rem]", className)} aria-hidden />;
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-line bg-surface-2 p-0.5",
        className,
      )}
      role="group"
      aria-label="Colour theme"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => choose(value)}
            aria-pressed={active}
            title={`${label} theme`}
            className={cn(
              "grid size-7 place-items-center rounded-full transition",
              active
                ? "bg-surface text-ink shadow-sm"
                : "text-muted hover:text-ink",
            )}
          >
            <Icon className="size-3.5" />
            <span className="sr-only">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
