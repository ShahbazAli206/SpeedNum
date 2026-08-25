import type { Metadata } from "next";

import { apiServer } from "@/lib/api-server";
import type { ClientMessage } from "@/lib/types";

import { MessagesClient } from "./messages-client";

export const metadata: Metadata = { title: "Messages" };

export default async function FirmMessagesPage() {
  // No demo.ts equivalent exists — a firm's real client conversations have no
  // meaningful stand-in data, so this is an empty list (not a demo fallback)
  // until the backend is reachable.
  const live = await apiServer<ClientMessage[]>("/client-portal/messages");

  return <MessagesClient messages={live ?? []} isLive={live !== null} />;
}
