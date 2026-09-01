import type { Metadata } from "next";

import { toTeamRow } from "@/lib/adapt";
import { apiServer } from "@/lib/api-server";
import { getTeam } from "@/lib/firm-demo";
import type { TeamMember } from "@/lib/types";

import { TeamClient } from "./team-client";

export const metadata: Metadata = { title: "Staff" };

export default async function TeamPage() {
  const live = await apiServer<TeamMember[]>("/team");
  // The Owner isn't a staff member serving clients — they own the firm — so
  // keep them off this roster (and out of its KPI tiles / member count).
  const team = live ? live.filter((m) => m.role !== "owner").map(toTeamRow) : getTeam();

  return <TeamClient initialTeam={team} isLive={Boolean(live)} />;
}
