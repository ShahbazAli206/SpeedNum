import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { apiServer } from "@/lib/api-server";
import type { PortalLetter } from "@/lib/types";

import { EngagementSignClient } from "./engagement-sign-client";

export async function generateMetadata({
  params,
}: PageProps<"/dashboard/engagements/[id]">): Promise<Metadata> {
  const { id } = await params;
  const letter = await apiServer<PortalLetter>(`/client-portal/engagements/${id}`);
  return { title: letter ? letter.title : "Agreement not found" };
}

export default async function ClientEngagementPage({ params }: PageProps<"/dashboard/engagements/[id]">) {
  const { id } = await params;
  const letter = await apiServer<PortalLetter>(`/client-portal/engagements/${id}`);
  if (!letter) notFound();

  return <EngagementSignClient id={id} initialLetter={letter} />;
}
