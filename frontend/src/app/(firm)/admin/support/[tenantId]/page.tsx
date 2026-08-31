import type { Metadata } from "next";

import { apiServer } from "@/lib/api-server";
import type { SupportThreadDetail } from "@/lib/types";

import { SupportThreadClient } from "./support-thread-client";

export const metadata: Metadata = { title: "Support conversation" };

export default async function SupportThreadPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const detail = await apiServer<SupportThreadDetail>(`/admin/support/threads/${tenantId}`);
  return (
    <SupportThreadClient
      tenantId={tenantId}
      detail={detail ?? { tenant_id: tenantId, tenant_name: "Company", messages: [] }}
      live={detail !== null}
    />
  );
}
