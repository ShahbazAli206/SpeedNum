import type { Metadata } from "next";

import { getTeam } from "@/lib/firm-demo";

import { TeamClient } from "./team-client";

export const metadata: Metadata = { title: "Accountants" };

export default function TeamPage() {
  const team = getTeam();
  return <TeamClient initialTeam={team} />;
}
