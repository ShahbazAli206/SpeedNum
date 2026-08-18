import type { Metadata } from "next";

import { toClientRow, toTeamRow } from "@/lib/adapt";
import { apiServer } from "@/lib/api-server";
import { getClients, getTeam } from "@/lib/firm-demo";
import type { Client, TeamMember } from "@/lib/types";

import { NewTaskClient } from "./new-task-client";

export const metadata: Metadata = { title: "New task" };

export default async function NewTaskPage() {
  // Same convention as workflows/[id]/page.tsx: prefer the tenant's real
  // clients/team for the dropdowns, falling back to demo fixtures only if
  // the API is unreachable. Without this, the dropdowns offered fixture ids
  // (e.g. "c3", "u1") that the real backend rejects with a 422.
  const [clients, team] = await Promise.all([
    apiServer<Client[]>("/clients"),
    apiServer<TeamMember[]>("/team"),
  ]);

  return (
    <NewTaskClient
      clients={clients ? clients.map(toClientRow) : getClients()}
      team={team ? team.filter((member) => member.is_active).map(toTeamRow) : getTeam().filter((member) => member.is_active)}
    />
  );
}
