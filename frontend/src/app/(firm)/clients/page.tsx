import type { Metadata } from "next";

import { toClientRow } from "@/lib/adapt";
import { apiServer } from "@/lib/api-server";
import { getClients } from "@/lib/firm-demo";
import type { Client } from "@/lib/types";

import { ClientsClient } from "./clients-client";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage() {
  // Was demo-only, so the book — and everything exported from it — was sample
  // data even with the API up. `toClientRow` maps the wire shape onto the row
  // shape the table was built against (lib/adapt.ts).
  const live = await apiServer<Client[]>("/clients");
  const clients = live ? live.map(toClientRow) : getClients();
  const owners = [...new Set(clients.map((client) => client.owner_name))].sort();

  return <ClientsClient clients={clients} owners={owners} isLive={Boolean(live)} />;
}
