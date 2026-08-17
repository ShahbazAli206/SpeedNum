import type { Metadata } from "next";

import { DashboardHeader } from "@/components/dashboard/page-shell";

import { AdminClient } from "./admin-client";

export const metadata: Metadata = { title: "Admin console" };

export default function AdminPage() {
  return (
    <>
      <DashboardHeader
        title="Super-admin console"
        subtitle="Provision firms, set plans and limits, and audit every action across tenants"
      />
      <AdminClient />
    </>
  );
}
