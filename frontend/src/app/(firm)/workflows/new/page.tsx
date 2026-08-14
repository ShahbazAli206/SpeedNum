import type { Metadata } from "next";

import { getClients, getTeam } from "@/lib/firm-demo";

import { NewTaskClient } from "./new-task-client";

export const metadata: Metadata = { title: "New task" };

export default function NewTaskPage() {
  return <NewTaskClient clients={getClients()} team={getTeam().filter((member) => member.is_active)} />;
}
