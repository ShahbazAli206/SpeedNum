import type { Metadata } from "next";

import { fetchLiveClientEngagements } from "@/lib/portal-live";

import { EngagementsListClient } from "./engagements-list-client";

export const metadata: Metadata = { title: "Agreements" };

export default async function ClientEngagementsPage() {
  const letters = (await fetchLiveClientEngagements()) ?? [];
  return <EngagementsListClient letters={letters} />;
}
