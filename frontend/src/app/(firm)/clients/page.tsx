import type { Metadata } from "next";

import { getClients } from "@/lib/firm-demo";

import { ClientsClient } from "./clients-client";

export const metadata: Metadata = { title: "Clients" };

export default function ClientsPage() {
  const clients = getClients();
  const owners = [...new Set(clients.map((client) => client.owner_name))].sort();

  return <ClientsClient clients={clients} owners={owners} />;
}
