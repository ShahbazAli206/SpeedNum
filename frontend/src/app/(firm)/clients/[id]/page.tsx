import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  CLIENT_IDS,
  getClient,
  getContacts,
  getCustomFields,
  getDeadlines,
  getLetters,
  getServices,
  getTasks,
  getTeam,
} from "@/lib/firm-demo";

import { ClientDetailClient } from "./client-detail-client";

export function generateStaticParams() {
  return CLIENT_IDS.map((id) => ({ id }));
}

export async function generateMetadata({
  params,
}: PageProps<"/clients/[id]">): Promise<Metadata> {
  const { id } = await params;
  const client = getClient(id);
  return { title: client ? client.business_name : "Client not found" };
}

const TAB_IDS = ["overview", "contacts", "services", "tasks", "files"] as const;
type TabId = (typeof TAB_IDS)[number];

export default async function ClientDetailPage({
  params,
  searchParams,
}: PageProps<"/clients/[id]">) {
  const { id } = await params;
  const { tab } = await searchParams;
  const client = getClient(id);
  if (!client) notFound();

  const contacts = getContacts().filter((contact) => contact.client_id === client.id);
  const catalogue = getServices();
  const services = catalogue.filter((service) => client.service_ids.includes(service.id));
  const deadlines = getDeadlines()
    .filter((deadline) => deadline.client_id === client.id)
    .sort((a, b) => a.days_remaining - b.days_remaining);
  const tasks = getTasks().filter((task) => task.client_id === client.id);
  const letters = getLetters().filter((letter) => letter.client_id === client.id);
  const customFields = getCustomFields().filter((field) => field.entity === "client");
  const team = getTeam().filter((member) => member.is_active);
  const initialTab = TAB_IDS.find((candidate) => candidate === tab) as TabId | undefined;

  return (
    <ClientDetailClient
      client={client}
      contacts={contacts}
      services={services}
      catalogue={catalogue}
      deadlines={deadlines}
      tasks={tasks}
      letters={letters}
      customFields={customFields}
      team={team}
      initialTab={initialTab}
    />
  );
}
