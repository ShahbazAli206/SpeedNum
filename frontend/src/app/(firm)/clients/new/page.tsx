import type { Metadata } from "next";

import { toDemoCustomField, toTeamRow } from "@/lib/adapt";
import { apiServer } from "@/lib/api-server";
import { getCustomFields, getTeam } from "@/lib/firm-demo";
import type { CustomField, TeamMember } from "@/lib/types";

import { NewClientClient } from "./new-client-client";

export const metadata: Metadata = { title: "Add client" };

/**
 * Was demo-only regardless of API state, so the "Assigned accountant"
 * dropdown always listed fixture staff (non-UUID ids the client component's
 * UUID_RE then silently drops) and the custom-field section always showed
 * fixture fields — never this tenant's real team or fields. Same live/demo
 * fallback as clients/[id]/page.tsx.
 */
export default async function NewClientPage() {
  const [liveFields, liveTeam] = await Promise.all([
    apiServer<CustomField[]>("/custom-fields"),
    apiServer<TeamMember[]>("/team"),
  ]);

  const customFields = (liveFields ? liveFields.map(toDemoCustomField) : getCustomFields()).filter(
    (field) => field.entity === "client",
  );
  const team = (liveTeam ? liveTeam.map(toTeamRow) : getTeam()).filter((member) => member.is_active);

  return <NewClientClient customFields={customFields} team={team} />;
}
