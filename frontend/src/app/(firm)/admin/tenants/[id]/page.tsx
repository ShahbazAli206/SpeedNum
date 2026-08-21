import type { Metadata } from "next";

import { DashboardHeader } from "@/components/dashboard/page-shell";

import { TenantDetailClient } from "./tenant-detail-client";

export const metadata: Metadata = { title: "Tenant" };

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <DashboardHeader
        title="Tenant"
        subtitle="Firm profile, usage and admin access — the platform superadmin's view of one firm"
      />
      <TenantDetailClient tenantId={id} />
    </>
  );
}
