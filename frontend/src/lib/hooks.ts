"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, api } from "./api";

interface QueryState<T> {
  data: T | undefined;
  error: ApiError | null;
  isLoading: boolean;
}

/**
 * Minimal data-fetching hook: request on mount, refetch on demand, and a
 * local setter so optimistic updates don't need a round-trip.
 */
export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [state, setState] = useState<QueryState<T>>({
    data: undefined,
    error: null,
    isLoading: path !== null,
  });
  const requestId = useRef(0);

  // Callers pass a variable-length `deps`, but a hook dependency list has to be a
  // fixed-size array literal — React compares slot by slot and a changing length
  // is undefined behaviour. Collapse the caller's values into one stable key.
  const depsKey = JSON.stringify(deps);

  const load = useCallback(
    async (silent = false) => {
      if (path === null) {
        setState({ data: undefined, error: null, isLoading: false });
        return;
      }
      const id = ++requestId.current;
      if (!silent) setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const data = await api<T>(path);
        if (id === requestId.current) setState({ data, error: null, isLoading: false });
      } catch (error) {
        if (id !== requestId.current) return;
        setState({
          data: undefined,
          error: error instanceof ApiError ? error : new ApiError(0, String(error)),
          isLoading: false,
        });
      }
    },
    // depsKey stands in for the caller's `deps` values, so it is intentionally a
    // dependency the body never reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, depsKey],
  );

  useEffect(() => {
    // Issuing the HTTP request is exactly the external-system synchronisation
    // effects are for. `load` flips isLoading synchronously on the way out, which
    // trips set-state-in-effect; that transition is the point, so allow it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const setData = useCallback((updater: T | ((current: T | undefined) => T)) => {
    setState((prev) => ({
      ...prev,
      data: typeof updater === "function" ? (updater as (c: T | undefined) => T)(prev.data) : updater,
    }));
  }, []);

  return { ...state, refresh: () => load(true), reload: () => load(false), setData };
}

/** Debounce a rapidly changing value (search inputs). */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Run an async action while tracking pending state and surfacing errors. */
export function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    setPending(true);
    setError(null);
    try {
      return await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
      return undefined;
    } finally {
      setPending(false);
    }
  }, []);

  return { run, pending, error, setError };
}
