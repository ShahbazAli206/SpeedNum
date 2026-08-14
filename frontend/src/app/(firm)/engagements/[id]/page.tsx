import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { apiServer } from "@/lib/api-server";
import type { Client, Letter, Me, Service } from "@/lib/types";

import { EngagementDetailClient } from "./engagement-detail-client";

export async function generateMetadata({
  params,
}: PageProps<"/engagements/[id]">): Promise<Metadata> {
  const { id } = await params;
  const letter = await apiServer<Letter>(`/engagements/${id}`);
  return { title: letter ? letter.title : "Engagement letter not found" };
}

export default async function EngagementDetailPage({ params }: PageProps<"/engagements/[id]">) {
  const { id } = await params;
  const [letter, clients, services, me] = await Promise.all([
    apiServer<Letter>(`/engagements/${id}`),
    apiServer<Client[]>("/clients"),
    apiServer<Service[]>("/services"),
    apiServer<Me>("/auth/me"),
  ]);
  if (!letter) notFound();

  return (
    <EngagementDetailClient
      initialLetter={letter}
      clients={clients ?? []}
      services={services ?? []}
      firmName={me?.tenant?.name ?? "Your firm"}
      firmLogoUrl={me?.tenant?.logo_url ?? null}
    />
  );
}
