import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getClients, getTasks, getTeamMember, getTeamNotes, TEAM_IDS } from "@/lib/firm-demo";

import { TeamMemberClient } from "./team-member-client";

export function generateStaticParams() {
  return TEAM_IDS.map((id) => ({ id }));
}

export async function generateMetadata({
  params,
}: PageProps<"/team/[id]">): Promise<Metadata> {
  const { id } = await params;
  const member = getTeamMember(id);
  return { title: member ? member.full_name : "Team member not found" };
}

export default async function TeamMemberPage({ params }: PageProps<"/team/[id]">) {
  const { id } = await params;
  const member = getTeamMember(id);
  if (!member) notFound();

  return (
    <TeamMemberClient
      member={member}
      allClients={getClients()}
      allTasks={getTasks()}
      initialNotes={getTeamNotes(id)}
    />
  );
}
