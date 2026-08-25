import type { Metadata } from "next";

import { fetchLiveClientMessages } from "@/lib/portal-live";

import { MessagesClient } from "./messages-client";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  // No demo.ts equivalent exists for this — a client's real conversation with
  // its firm has no meaningful stand-in data, so this is an empty list (not a
  // demo fallback) until the backend is reachable.
  const messages = (await fetchLiveClientMessages()) ?? [];

  return <MessagesClient messages={messages} />;
}
