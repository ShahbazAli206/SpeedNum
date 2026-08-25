"use client";

import { TriangleAlert } from "lucide-react";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

import { Button, Modal } from "./ui";

export interface ConfirmOptions {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for a destructive action (delete, void). */
  danger?: boolean;
}

/** Resolves true on confirm, false on cancel/dismiss — the same shape as
 * `window.confirm`, so a call site swaps `window.confirm(x)` for
 * `await confirm(x)` and nothing else changes. */
export type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Replaces the native `window.confirm` — which renders as an unstyled,
 * browser-chrome dialog stamped with the site's own domain ("speed-num.
 * vercel.app says") and pinned to the top of the viewport rather than
 * centered — with a themed modal matching the rest of the app.
 *
 * Promise-based so existing call sites (`if (!window.confirm(msg)) return;`)
 * only need `window.confirm` swapped for `await confirm(...)`.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((input) => {
    const normalized = typeof input === "string" ? { description: input } : input;
    return new Promise<boolean>((resolve) => {
      // A confirm already open (shouldn't normally happen — dialogs are
      // modal) resolves false rather than being silently dropped, so no
      // caller is left awaiting a promise that never settles.
      resolver.current?.(false);
      resolver.current = resolve;
      setOptions(normalized);
    });
  }, []);

  const settle = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={options !== null}
        onClose={() => settle(false)}
        title={options?.title ?? "Are you sure?"}
        width="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => settle(false)}>
              {options?.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              variant={options?.danger ? "danger" : "primary"}
              onClick={() => settle(true)}
              autoFocus
            >
              {options?.confirmLabel ?? "Confirm"}
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          {options?.danger ? (
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-danger-soft text-danger">
              <TriangleAlert className="size-4" />
            </span>
          ) : null}
          <p className="text-[13.5px] leading-relaxed text-ink-soft">{options?.description}</p>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return context;
}
