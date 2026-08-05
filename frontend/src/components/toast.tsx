"use client";

import { TriangleAlert, CircleCheck, Info, X, CircleX } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ToastTone = "success" | "error" | "info" | "warn";

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
}

interface ToastApi {
  push: (toast: Omit<Toast, "id">) => void;
  success: (title: string, body?: string) => void;
  error: (title: string, body?: string) => void;
  info: (title: string, body?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONES: Record<ToastTone, { icon: ReactNode; ring: string; accent: string }> = {
  success: {
    icon: <CircleCheck className="size-4.5" />,
    ring: "border-l-success",
    accent: "text-success",
  },
  error: {
    icon: <CircleX className="size-4.5" />,
    ring: "border-l-danger",
    accent: "text-danger",
  },
  warn: {
    icon: <TriangleAlert className="size-4.5" />,
    ring: "border-l-warn",
    accent: "text-warn",
  },
  info: {
    icon: <Info className="size-4.5" />,
    ring: "border-l-info",
    accent: "text-info",
  },
};

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = nextId++;
      setToasts((current) => [...current.slice(-3), { ...toast, id }]);
      setTimeout(() => dismiss(id), 4600);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      push,
      success: (title, body) => push({ tone: "success", title, body }),
      error: (title, body) => push({ tone: "error", title, body }),
      info: (title, body) => push({ tone: "info", title, body }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed right-4 bottom-4 z-100 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const tone = TONES[toast.tone];
          return (
            <div
              key={toast.id}
              className={`animate-in pointer-events-auto flex items-start gap-3 rounded-xl border border-line border-l-4 bg-surface p-3.5 shadow-[var(--shadow-float)] ${tone.ring}`}
            >
              <span className={`mt-px shrink-0 ${tone.accent}`}>{tone.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{toast.title}</p>
                {toast.body ? (
                  <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{toast.body}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="-m-1 shrink-0 rounded-md p-1 text-muted transition hover:bg-surface-2 hover:text-ink"
                aria-label="Dismiss notification"
              >
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}
