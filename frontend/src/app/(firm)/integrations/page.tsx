import type { Metadata } from "next";

import { getRecentEmails } from "@/lib/firm-demo";

import { IntegrationsClient } from "./integrations-client";

export const metadata: Metadata = { title: "Integrations" };

export default function IntegrationsPage() {
  return <IntegrationsClient recentEmails={getRecentEmails()} />;
}
