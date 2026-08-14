import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { toClientRow, toDemoTask, toTeamRow } from "@/lib/adapt";
import { apiServer } from "@/lib/api-server";
import { getClients, getTasks, getTeamMember, getTeamNotes } from "@/lib/firm-demo";
import type { Client, Task, TeamMember } from "@/lib/types";

import { TeamMemberClient } from "./team-member-client";

/**
 * No `generateStaticParams` here.
 *
 * It used to prerender the demo roster's ids, which meant a *real* member — whose
 * id is a UUID — 404'd before the page could even ask the API. Rendering on
 * demand costs one request and makes both cases work: live ids resolve against
 * `/team`, and the demo ids still fall through to the fixtures below.
 */
async function loadLive(id: string) {
  const team = await apiServer<TeamMember[]>("/team");
  if (!team) return null;
  const member = team.find((row) => row.id === id);
  if (!member) return null;

  // Clients and tasks drive the "assigned to them" tabs; both are firm-wide
  // lists the page filters in the browser, exactly as the demo does.
  const [clients, tasks] = await Promise.all([
    apiServer<Client[]>("/clients"),
    apiServer<Task[]>("/tasks"),
  ]);
  return { member, clients: clients ?? [], tasks: tasks ?? [] };
}

export async function generateMetadata({
  params,
}: PageProps<"/team/[id]">): Promise<Metadata> {
  const { id } = await params;
  const live = await loadLive(id);
  if (live) return { title: live.member.full_name || live.member.email };
  const member = getTeamMember(id);
  return { title: member ? member.full_name : "Team member not found" };
}

export default async function TeamMemberPage({ params }: PageProps<"/team/[id]">) {
  const { id } = await params;

  const live = await loadLive(id);
  if (live) {
    return (
      <TeamMemberClient
        member={toTeamRow(live.member)}
        allClients={live.clients.map(toClientRow)}
        allTasks={live.tasks.map(toDemoTask)}
        // Per-member notes have no table yet; the demo keeps a fixture so the
        // tab can be designed. Live accounts simply start empty.
        initialNotes={[]}
        isLive
      />
    );
  }

  const member = getTeamMember(id);
  if (!member) notFound();

  return (
    <TeamMemberClient
      member={member}
      allClients={getClients()}
      allTasks={getTasks()}
      initialNotes={getTeamNotes(id)}
      isLive={false}
    />
  );
}
