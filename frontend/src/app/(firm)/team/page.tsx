import type { Metadata } from "next";

import { toTeamRow } from "@/lib/adapt";
import { apiServer } from "@/lib/api-server";
import { getTeam } from "@/lib/firm-demo";
import type { TeamMember } from "@/lib/types";

import { TeamClient } from "./team-client";

export const metadata: Metadata = { title: "Accountants" };

export default async function TeamPage() {
  const live = await apiServer<TeamMember[]>("/team");
  const team = live ? live.map(toTeamRow) : getTeam();

  return <TeamClient initialTeam={team} isLive={Boolean(live)} />;
}
