"use client";

import { ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { logout } from "@/lib/auth-client";
import { useSession } from "@/lib/session";

import { Button, Modal } from "./ui";

/** How long a tab can sit untouched before we warn, then actually sign it out.
 *  Picked to land in the "20-30 minutes" window a stale, still-open tab was
 *  reported showing stale/mismatched identity chrome in — signing out
 *  cleanly well before that point means there's no session left to go stale. */
const WARN_AFTER_MS = 20 * 60_000;
const LOGOUT_AFTER_MS = 25 * 60_000;
const TICK_MS = 1000;

/** Events that count as "still here" — deliberately broad and passive; any of
 *  these firing while the warning is up dismisses it, same as clicking "Stay
 *  signed in" would. */
const ACTIVITY_EVENTS = ["mousedown", "mousemove", "keydown", "touchstart", "wheel", "scroll"] as const;

/**
 * Proactively signs an idle tab out instead of letting it sit past its
 * session's real lifetime and show a confusing mix of stale identity chrome
 * over whatever page happened to be open (see lib/session.tsx's
 * hadLiveSession handling for the other half of this fix — a session that
 * dies mid-poll now hard-redirects the same way).
 *
 * Warns 5 minutes ahead of the actual sign-out with a dismissible modal, so
 * anyone genuinely mid-task gets a clear chance to notice, finish or save
 * what they're doing, and either interact (auto-dismisses, same as clicking
 * "Stay signed in") or explicitly stay. Only armed once a real session is
 * confirmed live — never in demo mode.
 */
export function SessionIdleGuard() {
  const session = useSession();
  const [warning, setWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  // 0, not Date.now(): a ref's initial value is computed during render, where
  // calling an impure function like Date.now() isn't allowed. Set for real in
  // the effect below, before anything reads it.
  const lastActivity = useRef(0);
  const loggingOut = useRef(false);

  const staysignedIn = useCallback(() => {
    lastActivity.current = Date.now();
    setWarning(false);
  }, []);

  useEffect(() => {
    if (!session.isLive) return;
    lastActivity.current = Date.now();

    const onActivity = () => {
      lastActivity.current = Date.now();
      // Functional update so this listener doesn't need `warning` in its own
      // deps and re-subscribe every time the warning toggles.
      setWarning((current) => (current ? false : current));
    };
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, onActivity, { passive: true }));

    const timer = setInterval(() => {
      if (loggingOut.current) return;
      const idleFor = Date.now() - lastActivity.current;
      if (idleFor >= LOGOUT_AFTER_MS) {
        loggingOut.current = true;
        void logout().finally(() => {
          // Hard navigation, not router.push — same reasoning as every other
          // identity-boundary transition in this app (sign-out, impersonation
          // start/exit): every piece of client-side state built on the dead
          // session needs to go, not just the route.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = "/login?reason=idle";
        });
        return;
      }
      if (idleFor >= WARN_AFTER_MS) {
        setWarning(true);
        setSecondsLeft(Math.max(0, Math.ceil((LOGOUT_AFTER_MS - idleFor) / 1000)));
      }
    }, TICK_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, onActivity));
      clearInterval(timer);
    };
  }, [session.isLive]);

  if (!session.isLive) return null;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <Modal
      open={warning}
      onClose={staysignedIn}
      title="Still there?"
      description="You've been inactive for a while. Finish or save anything you're working on — we'll sign you out soon to protect your session."
      footer={
        <Button variant="primary" icon={<ShieldAlert className="size-4" />} onClick={staysignedIn}>
          Stay signed in
        </Button>
      }
    >
      <p className="text-[13.5px] text-ink-soft">
        Signing out automatically in{" "}
        <strong className="font-semibold text-ink">
          {minutes}:{seconds.toString().padStart(2, "0")}
        </strong>
        .
      </p>
    </Modal>
  );
}
