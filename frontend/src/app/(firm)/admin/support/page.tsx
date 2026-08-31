import type { Metadata } from "next";

import { DashboardHeader } from "@/components/dashboard/page-shell";
import { apiServer } from "@/lib/api-server";
import type { SupportThreadSummary } from "@/lib/types";

import { SupportInboxClient } from "./support-inbox-client";

export const metadata: Metadata = { title: "Support inbox" };

export default async function SupportInboxPage() {
  const threads = await apiServer<SupportThreadSummary[]>("/admin/support/threads");
  return (
    <>
      <DashboardHeader
        title="Support"
        subtitle="Messages from company owners across every firm — open a company to read and reply"
      />
      <SupportInboxClient threads={threads ?? []} />
    </>
  );
}
