import type { Metadata } from "next";

import { apiServer } from "@/lib/api-server";
import type { PermissionInfo, RoleRow } from "@/lib/types";

import { RolesClient } from "./roles-client";

export const metadata: Metadata = { title: "Roles & Permissions" };

export default async function RolesPage() {
  const [roles, catalog] = await Promise.all([
    apiServer<RoleRow[]>("/roles"),
    apiServer<PermissionInfo[]>("/roles/permissions"),
  ]);

  return (
    <RolesClient
      initialRoles={roles ?? []}
      catalog={catalog ?? []}
      isLive={Boolean(roles && catalog)}
    />
  );
}
