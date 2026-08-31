import type { Metadata } from "next";

import { apiServer } from "@/lib/api-server";
import type { SupportThread } from "@/lib/types";

import { SupportClient } from "./support-client";

export const metadata: Metadata = { title: "Support" };

export default async function SupportPage() {
  // No demo fixture: a firm's real support conversation has no meaningful
  // stand-in, so this is an empty thread until the backend is reachable.
  const thread = await apiServer<SupportThread>("/support/thread");
  return (
    <SupportClient thread={thread ?? { thread_id: "", messages: [] }} live={thread !== null} />
  );
}
