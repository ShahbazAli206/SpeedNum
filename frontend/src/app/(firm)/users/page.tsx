import type { Metadata } from "next";

import { getClients, getPlatformUsers } from "@/lib/firm-demo";

import { UsersClient } from "./users-client";

export const metadata: Metadata = { title: "Users" };

export default function UsersPage() {
  const users = getPlatformUsers();
  const clients = getClients().map((client) => ({ id: client.id, business_name: client.business_name }));

  return <UsersClient initialUsers={users} clients={clients} />;
}
