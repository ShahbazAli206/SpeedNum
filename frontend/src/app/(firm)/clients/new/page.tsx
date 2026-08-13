import type { Metadata } from "next";

import { getCustomFields, getTeam } from "@/lib/firm-demo";

import { NewClientClient } from "./new-client-client";

export const metadata: Metadata = { title: "Add client" };

export default function NewClientPage() {
  const customFields = getCustomFields().filter((field) => field.entity === "client");
  const team = getTeam().filter((member) => member.is_active);

  return <NewClientClient customFields={customFields} team={team} />;
}
