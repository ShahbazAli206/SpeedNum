import type { Metadata } from "next";

import { apiServer } from "@/lib/api-server";
import { getClients, getPlatformUsers, type PlatformRole, type PlatformUser } from "@/lib/firm-demo";
import type { Client, PlatformAccount } from "@/lib/types";

import { UsersClient } from "./users-client";

export const metadata: Metadata = { title: "Users" };

/**
 * The demo's `role` column folds "client" in with the four firm roles, because
 * that is the distinction an administrator actually scans for. Live rows keep
 * the two apart on the wire — `role` is the firm role, `source` says whether the
 * login is staff or a client portal — so they are recombined here for display.
 */
function toRow(account: PlatformAccount): PlatformUser {
  const role: PlatformRole = account.source === "client" ? "client" : account.role;
  return {
    id: account.id,
    full_name: account.full_name || account.email,
    email: account.email,
    role,
    created_at: account.created_at?.slice(0, 10) ?? "",
    last_sign_in: account.last_sign_in?.slice(0, 10) ?? null,
    must_change_password: account.must_change_password,
    source: account.source,
    source_id: account.client_id ?? account.id,
  };
}

export default async function UsersPage() {
  const [liveUsers, liveClients] = await Promise.all([
    apiServer<PlatformAccount[]>("/users"),
    apiServer<Client[]>("/clients"),
  ]);

  const users = liveUsers ? liveUsers.map(toRow) : getPlatformUsers();
  const clients = liveClients
    ? liveClients.map((client) => ({
        id: client.id,
        business_name: client.business_name || client.legal_name,
      }))
    : getClients().map((client) => ({ id: client.id, business_name: client.business_name }));

  return <UsersClient initialUsers={users} clients={clients} isLive={Boolean(liveUsers)} />;
}
