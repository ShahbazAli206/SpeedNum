import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  toClientRow,
  toDemoContact,
  toDemoCustomField,
  toDemoDeadline,
  toDemoLetter,
  toDemoService,
  toDemoTask,
  toTeamRow,
} from "@/lib/adapt";
import { apiServer } from "@/lib/api-server";
import {
  getClient,
  getContacts,
  getCustomFields,
  getDeadlines,
  getLetters,
  getServices,
  getTasks,
  getTeam,
  type Service,
} from "@/lib/firm-demo";
import type {
  Client,
  ClientServiceLink,
  Contact,
  CustomField,
  Deadline,
  Letter,
  Service as ApiService,
  Task,
  TeamMember,
} from "@/lib/types";

import { ClientDetailClient } from "./client-detail-client";

const TAB_IDS = ["overview", "contacts", "services", "tasks", "files"] as const;
type TabId = (typeof TAB_IDS)[number];

/**
 * No `generateStaticParams` here — same fix as team/[id]/page.tsx and
 * workflows/[id]/page.tsx: a real client's id is a UUID that was never in
 * the demo `CLIENT_IDS` list, so prerendering only those ids 404'd every
 * real client before the page could even ask the API.
 */
async function loadLive(id: string) {
  const client = await apiServer<Client>(`/clients/${id}`);
  if (!client) return null;

  const [contactsRaw, catalogueRaw, assignments, tasksRaw, deadlinesRaw, lettersRaw, customFieldsRaw, teamRaw] =
    await Promise.all([
      apiServer<Contact[]>(`/clients/${id}/contacts`),
      apiServer<ApiService[]>("/services"),
      apiServer<ClientServiceLink[]>(`/clients/${id}/services`),
      apiServer<Task[]>("/tasks"),
      apiServer<Deadline[]>(`/deadlines?client_id=${encodeURIComponent(id)}`),
      apiServer<Letter[]>(`/engagements?client_id=${encodeURIComponent(id)}`),
      apiServer<CustomField[]>("/custom-fields"),
      apiServer<TeamMember[]>("/team"),
    ]);

  // The catalogue drives both the "Add service" dropdown and the join below —
  // an assignment (ClientServiceLink) only carries the service's id, name and
  // code, not its category/lead-time/due-rule, so those still come from here.
  const catalogue = (catalogueRaw ?? []).map(toDemoService);
  const catalogueById = new Map(catalogue.map((service) => [service.id, service]));
  const services = (assignments ?? [])
    .map((link) => {
      const base = catalogueById.get(link.service_id);
      if (!base) return null;
      return {
        ...base,
        frequency: link.frequency_override ?? base.frequency,
        default_price: link.price ?? base.default_price,
      };
    })
    .filter((service): service is Service => service !== null);

  return {
    client,
    contacts: (contactsRaw ?? []).map(toDemoContact),
    catalogue,
    services,
    tasks: (tasksRaw ?? []).filter((task) => task.client_id === id).map(toDemoTask),
    deadlines: (deadlinesRaw ?? []).map(toDemoDeadline).sort((a, b) => a.days_remaining - b.days_remaining),
    letters: (lettersRaw ?? []).map(toDemoLetter),
    customFields: (customFieldsRaw ?? []).filter((field) => field.entity === "client").map(toDemoCustomField),
    team: (teamRaw ?? []).filter((member) => member.is_active).map(toTeamRow),
  };
}

export async function generateMetadata({
  params,
}: PageProps<"/clients/[id]">): Promise<Metadata> {
  const { id } = await params;
  const live = await loadLive(id);
  if (live) return { title: live.client.business_name || live.client.legal_name };
  const client = getClient(id);
  return { title: client ? client.business_name : "Client not found" };
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: PageProps<"/clients/[id]">) {
  const { id } = await params;
  const { tab, edit } = await searchParams;
  const initialTab = TAB_IDS.find((candidate) => candidate === tab) as TabId | undefined;
  // The clients list's pencil icon deep-links here with ?edit=1 so editing
  // doesn't need a second click once the detail page has loaded.
  const openEditOnLoad = edit === "1";

  const live = await loadLive(id);
  if (live) {
    return (
      <ClientDetailClient
        client={toClientRow(live.client)}
        contacts={live.contacts}
        services={live.services}
        catalogue={live.catalogue}
        deadlines={live.deadlines}
        tasks={live.tasks}
        letters={live.letters}
        customFields={live.customFields}
        team={live.team}
        initialTab={initialTab}
        openEditOnLoad={openEditOnLoad}
        isLive
      />
    );
  }

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
      openEditOnLoad={openEditOnLoad}
      isLive={false}
    />
  );
}
