"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { get } from "./api";
import { SUPABASE_CONFIGURED } from "./auth";
import { FIRM, getFirmOverview, getReminderCounts } from "./firm-demo";
import type { Me, ReminderCounts } from "./types";

/**
 * Who is signed in, and what is waiting for them.
 *
 * Both shells (firm and client portal) render the identity chip and the alert
 * badges, and both used to read them from `lib/firm-demo`. Hoisting the state
 * here means one `GET /auth/me` per navigation instead of one per component, and
 * — the reason it matters — the sidebar badge, the bell and the reminders page
 * can never disagree about the unread count.
 *
 * Falls back to the demo identity when Supabase is unconfigured or the API is
 * unreachable, matching `lib/api-server.ts`: a page never breaks, it just shows
 * sample data with `isLive` false.
 */

const REFRESH_MS = 60_000;

export interface SessionValue {
  me: Me | null;
  /** Reminder counts, polled alongside the profile. Zeroed in demo mode. */
  reminders: ReminderCounts;
  /** True when the numbers came from the API rather than the demo fixtures. */
  isLive: boolean;
  isLoading: boolean;
  /** Display name and initials, resolved from whichever source is in play. */
  displayName: string;
  displayTitle: string;
  initials: string;
  /** Sign-in address, for the account menu. Null in demo mode. */
  email: string | null;
  unread: number;
  /** Firm staff (or demo mode). False only for a client-portal login. */
  isFirmStaff: boolean;
  isAdmin: boolean;
  /** Re-read /auth/me and the reminder counts now — call after an action that
   *  changes either (marking notifications read, acknowledging a reminder). */
  refresh: () => void;
  /** Adjust the unread count locally so the badge reacts without a round-trip. */
  setUnread: (next: number | ((current: number) => number)) => void;
}

const EMPTY_REMINDERS: ReminderCounts = {
  open: 0,
  overdue: 0,
  due_today: 0,
  due_soon: 0,
  upcoming: 0,
  unacknowledged: 0,
};

const SessionContext = createContext<SessionValue | null>(null);

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [reminders, setReminders] = useState<ReminderCounts>(EMPTY_REMINDERS);
  const [isLive, setIsLive] = useState(false);
  const [isLoading, setIsLoading] = useState(SUPABASE_CONFIGURED);
  const [unreadOverride, setUnreadOverride] = useState<number | null>(null);

  // A ref, not state: the poll only needs to know whether a fetch is already in
  // flight, and writing that to state would re-render every tick for nothing.
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (!SUPABASE_CONFIGURED || inFlight.current) return;
    inFlight.current = true;
    try {
      const profile = await get<Me>("/auth/me");
      setMe(profile);
      setIsLive(true);
      setUnreadOverride(null);

      // Reminder counts are firm-side only; a portal login has no access and
      // the 403 would be noise.
      if (profile.profile.client_id === null) {
        try {
          setReminders(await get<ReminderCounts>("/reminders/unread-count"));
        } catch {
          // Reminders table not migrated yet, or the sweep has never run.
          setReminders(EMPTY_REMINDERS);
        }
      }
    } catch {
      // Not signed in, or the API is asleep. Demo identity stands in.
      setIsLive(false);
    } finally {
      inFlight.current = false;
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // The lint rule guards against setState running synchronously inside an
    // effect body and cascading a second render. `load` reaches no setState
    // before its first `await` — it returns early or flips a ref, then suspends
    // on the network — so the first state write already happens in a later
    // task. The rule cannot see across the async boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    if (!SUPABASE_CONFIGURED) return;
    const timer = setInterval(() => void load(), REFRESH_MS);

    // Coming back to the tab is the moment a stale badge is most obvious.
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const value = useMemo<SessionValue>(() => {
    const profile = me?.profile ?? null;
    const displayName = profile?.full_name || profile?.email || FIRM.signedInAs.name;
    const displayTitle = profile?.title || (isLive ? roleLabel(profile?.role) : FIRM.signedInAs.title);
    // Demo mode has to show a *representative* unread count, not zero. The
    // badge and its blink are a behaviour the reviewer needs to see, and a
    // deployment without a backend yet (Vercel up, API not) would otherwise
    // look like the feature is missing rather than idle.
    const serverUnread = isLive
      ? (me?.unread_notifications ?? 0)
      : getFirmOverview().unread_notifications;

    return {
      me,
      // Same reasoning as `serverUnread`: the /reminders badge should show the
      // demo board's real shape rather than a flat zero.
      reminders: isLive ? reminders : getReminderCounts(),
      isLive,
      isLoading,
      displayName,
      displayTitle,
      initials: initialsOf(displayName),
      email: profile?.email ?? null,
      unread: unreadOverride ?? serverUnread,
      // In demo mode there is no portal login to distinguish, so the firm
      // surface stays browsable.
      isFirmStaff: profile ? profile.client_id === null : true,
      isAdmin: profile ? profile.role === "owner" || profile.role === "admin" : true,
      refresh: () => void load(),
      setUnread: (next) =>
        setUnreadOverride((current) =>
          typeof next === "function" ? next(current ?? serverUnread) : next,
        ),
    };
  }, [me, reminders, isLive, isLoading, unreadOverride, load]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

function roleLabel(role: string | undefined): string {
  switch (role) {
    case "owner":
      return "Owner";
    case "admin":
      return "Administrator";
    case "viewer":
      return "Viewer";
    default:
      return "Team member";
  }
}

/**
 * Read the session. Safe outside a provider — returns the demo defaults rather
 * than throwing, so a component can be dropped onto a marketing page without
 * dragging the provider along.
 */
export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (value !== null) return value;
  return {
    me: null,
    reminders: EMPTY_REMINDERS,
    isLive: false,
    isLoading: false,
    displayName: FIRM.signedInAs.name,
    displayTitle: FIRM.signedInAs.title,
    initials: initialsOf(FIRM.signedInAs.name),
    email: null,
    unread: 0,
    isFirmStaff: true,
    isAdmin: true,
    refresh: () => {},
    setUnread: () => {},
  };
}
