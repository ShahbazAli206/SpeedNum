import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { toClientRow, toDemoTask, toTeamRow } from "@/lib/adapt";
import { apiServer } from "@/lib/api-server";
import { getClients, getTasks, getTeamMember, getTeamNotes } from "@/lib/firm-demo";
import { formatDate } from "@/lib/format";
import type { Client, Task, TeamMember, TeamNoteApi } from "@/lib/types";

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
  const [clients, tasks, notes] = await Promise.all([
    apiServer<Client[]>("/clients"),
    apiServer<Task[]>("/tasks"),
    apiServer<TeamNoteApi[]>(`/team/${id}/notes`),
  ]);
  return { member, clients: clients ?? [], tasks: tasks ?? [], notes: notes ?? [] };
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
        initialNotes={live.notes.map((note) => ({
          id: note.id,
          member_id: note.profile_id,
          body: note.body,
          when: formatDate(note.created_at, "long"),
        }))}
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
