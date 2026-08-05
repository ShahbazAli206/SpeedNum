"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui";

const STORAGE_KEY = "speednum-cookie-consent";

/**
 * Consent banner for the analytics cookie category. Strictly-necessary cookies
 * are not gated by it, which is why the copy says "analyze site traffic" rather
 * than claiming the site sets nothing until you accept.
 *
 * Renders nothing until mounted so the server markup and the first client
 * render agree — the decision lives in localStorage, which the server cannot see.
 */
export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      // localStorage is an external store the server render cannot see; this
      // one-shot read is the intended use of an effect and cannot cascade.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      // Storage blocked — don't nag on every page load.
    }
  }, []);

  const decide = (choice: "accepted" | "declined") => {
    try {
      localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // Ignore: the banner still closes for this session.
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="animate-in fixed inset-x-0 bottom-0 z-90 border-t border-navy-line bg-navy px-4 py-4 text-white/85 shadow-[var(--shadow-float)] sm:px-6"
    >
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <p className="text-center text-[13.5px] leading-relaxed sm:text-left">
          We use cookies to improve your experience, analyze site traffic, and support our
          marketing. By clicking <strong className="font-semibold text-white">Accept</strong>, you
          consent to our use of cookies.{" "}
          <Link href="/privacy" className="font-medium text-brand-on-dark underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 items-center gap-2.5">
          <Button variant="onDark" onClick={() => decide("declined")}>
            Decline
          </Button>
          <Button onClick={() => decide("accepted")}>Accept</Button>
        </div>
      </div>
    </div>
  );
}
