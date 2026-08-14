import type { Metadata } from "next";

import { apiServer } from "@/lib/api-server";
import type { Client, Service } from "@/lib/types";

import { NewEngagementClient } from "./new-engagement-client";

export const metadata: Metadata = { title: "New engagement letter" };

export default async function NewEngagementPage() {
  const [clients, services] = await Promise.all([
    apiServer<Client[]>("/clients"),
    apiServer<Service[]>("/services"),
  ]);

  return <NewEngagementClient clients={clients ?? []} services={services ?? []} />;
}
