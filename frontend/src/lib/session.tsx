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
import { AUTH_CONFIGURED } from "./auth";
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
 * Falls back to the demo identity when no backend is configured or the API is
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
  /** True for the company Owner (or a platform superadmin). Task creation and
   *  assignment are Owner-only. Defaults to true in demo mode and before `me`
   *  loads, matching `isAdmin`: a page shows the fuller view until the real
   *  answer arrives rather than flashing controls away. */
  isOwner: boolean;
  /** True only for a real platform superadmin, straight off `profile.is_superadmin`
   *  — never optimistic before load or in demo mode (unlike isAdmin/isOwner
   *  above), since this is what gates the cross-tenant admin console (see
   *  (firm)/admin/layout.tsx and proxy.ts's /admin edge check). A page that
   *  needs to know "can this account reach /admin" should read this, not
   *  string-match `portalRoleLabel`. */
  isSuperadmin: boolean;
  /** True when a platform superadmin is viewing this firm via impersonation. */
  isImpersonating: boolean;
  /** Which portal this login belongs to, for the role chip in the rail —
   *  distinct from `displayTitle`, which prefers the person's job title over
   *  their role. Superadmin outranks everything else since an owner account
   *  can also carry `is_superadmin`. */
  portalRoleLabel: string;
  /** Server-resolved permission check (backend/app/permissions.py) — e.g.
   *  `session.hasPermission("clients.view_all")`. Defaults to true in demo
   *  mode and while `me` hasn't loaded yet, matching `isAdmin`'s default
   *  above: a page never breaks or flashes "denied" before the real answer
   *  arrives, it just shows the fuller demo view until then. */
  hasPermission: (key: string) => boolean;
  /** Re-read /auth/me and the reminder counts now — call after an action that
   *  changes either (marking notifications read, acknowledging a reminder). */
  refresh: () => void;
  /** Adjust the unread count locally so the badge reacts without a round-trip. */
  setUnread: (next: number | ((current: number) => number)) => void;
  /** Same idea as `setUnread`, for the Reminders badge's unacknowledged count —
   *  set optimistically after an acknowledge action, before `refresh()` confirms it. */
  setRemindersUnacknowledged: (next: number | ((current: number) => number)) => void;
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
  const [isLoading, setIsLoading] = useState(AUTH_CONFIGURED);
  const [unreadOverride, setUnreadOverride] = useState<number | null>(null);
  const [remindersUnacknowledgedOverride, setRemindersUnacknowledgedOverride] = useState<
    number | null
  >(null);

  // A ref, not state: the poll only needs to know whether a fetch is already in
  // flight, and writing that to state would re-render every tick for nothing.
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (!AUTH_CONFIGURED || inFlight.current) return;
    inFlight.current = true;
    try {
      const profile = await get<Me>("/auth/me");
      setMe(profile);
      setIsLive(true);
      setUnreadOverride(null);
      setRemindersUnacknowledgedOverride(null);

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
    if (!AUTH_CONFIGURED) return;
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
    const displayTitle = profile?.title || (isLive ? roleLabel(profile) : FIRM.signedInAs.title);
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
      // demo board's real shape rather than a flat zero. The unacknowledged
      // field can be optimistically overridden the same way `unread` is, so
      // the sidebar badge clears immediately after an acknowledge action
      // instead of waiting on the next poll.
      reminders: isLive
        ? {
            ...reminders,
            unacknowledged: remindersUnacknowledgedOverride ?? reminders.unacknowledged,
          }
        : getReminderCounts(),
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
      isAdmin: profile
        ? profile.role === "owner" || profile.role === "admin" || profile.is_superadmin
        : true,
      isOwner: profile ? profile.role === "owner" || Boolean(profile.is_superadmin) : true,
      isSuperadmin: isLive && Boolean(profile?.is_superadmin),
      isImpersonating: isLive ? (me?.is_impersonating ?? false) : false,
      portalRoleLabel: isLive ? portalRoleLabelOf(profile) : "Admin",
      hasPermission: (key) => (isLive ? (me?.permissions?.[key] ?? false) : true),
      refresh: () => void load(),
      setUnread: (next) =>
        setUnreadOverride((current) =>
          typeof next === "function" ? next(current ?? serverUnread) : next,
        ),
      setRemindersUnacknowledged: (next) =>
        setRemindersUnacknowledgedOverride((current) =>
          typeof next === "function" ? next(current ?? reminders.unacknowledged) : next,
        ),
    };
  }, [me, reminders, isLive, isLoading, unreadOverride, remindersUnacknowledgedOverride, load]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/**
 * Shown under the person's name when they have no job title set. Checked
 * ahead of the firm-internal owner/admin/viewer role for the same reason
 * `portalRoleLabelOf` below does: a platform superadmin's `role` column is
 * still just "owner" or "admin" of their own tenant, so without this check
 * this fell back to "Administrator" for a superadmin exactly like it would
 * for an ordinary firm admin — the two are indistinguishable here otherwise.
 */
function roleLabel(profile: Me["profile"] | null | undefined): string {
  if (profile?.is_superadmin) return "Super Admin";
  switch (profile?.role) {
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

/** Superadmin outranks the firm role (an owner account can also carry
 *  `is_superadmin`); a portal login is `Clients` regardless of its `role`
 *  value, since client accounts share the same role column as staff. Staff
 *  below owner show their actual tenant-defined role name (e.g. "Manager")
 *  when one is assigned, falling back to a humanised legacy bucket otherwise.
 *  "Super Admin" is kept verbatim — shell.tsx gates the admin console on it. */
function portalRoleLabelOf(profile: Me["profile"] | null): string {
  if (!profile) return "Admin";
  if (profile.is_superadmin) return "Super Admin";
  if (profile.client_id) return "Clients";
  if (profile.role === "owner") return "Company Owner";
  if (profile.role_name) return profile.role_name;
  if (profile.role === "admin") return "Admin";
  if (profile.role === "viewer") return "Viewer";
  return "Team member";
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
    isOwner: true,
    isSuperadmin: false,
    isImpersonating: false,
    portalRoleLabel: "Admin",
    hasPermission: () => true,
    refresh: () => {},
    setUnread: () => {},
    setRemindersUnacknowledged: () => {},
  };
}
