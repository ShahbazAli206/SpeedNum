import type { Metadata } from "next";

import { apiServer } from "@/lib/api-server";
import type { Client, ClientMessage } from "@/lib/types";

import { MessagesClient } from "./messages-client";

export const metadata: Metadata = { title: "Messages" };

export default async function FirmMessagesPage() {
  // Messages drive the conversation list; the client list feeds the
  // "new message" picker so a firm can start a thread with a client who hasn't
  // written yet. Both are already owner-scoped server-side, so a restricted
  // staff member only ever sees the clients and threads assigned to them.
  const [live, clients] = await Promise.all([
    apiServer<ClientMessage[]>("/client-portal/messages"),
    apiServer<Client[]>("/clients"),
  ]);

  return <MessagesClient messages={live ?? []} clients={clients ?? []} isLive={live !== null} />;
}
