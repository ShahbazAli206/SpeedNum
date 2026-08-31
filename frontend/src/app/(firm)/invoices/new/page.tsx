import type { Metadata } from "next";

import { apiServer } from "@/lib/api-server";
import type { Client, Service } from "@/lib/types";

import { NewInvoiceClient } from "./new-invoice-client";

export const metadata: Metadata = { title: "New invoice" };

export default async function NewInvoicePage() {
  const [clients, services] = await Promise.all([
    apiServer<Client[]>("/clients"),
    apiServer<Service[]>("/services"),
  ]);

  return <NewInvoiceClient clients={clients ?? []} services={services ?? []} />;
}
