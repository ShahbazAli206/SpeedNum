/**
 * A hint that a support thread's unread state just changed on this client
 * (opened a thread → marked read, or sent a reply). The firm/admin shells
 * listen for it to refetch their support unread badge immediately, rather than
 * waiting for the next poll. Purely a UX nicety — the badge is still correct on
 * the next interval refetch without it.
 */
export const SUPPORT_UNREAD_EVENT = "support-unread-changed";

export function notifySupportUnreadChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SUPPORT_UNREAD_EVENT));
  }
}
