import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { apiServer } from "@/lib/api-server";
import type { Letter, Me } from "@/lib/types";

import { EngagementPreviewClient } from "./preview-client";

export async function generateMetadata({
  params,
}: PageProps<"/engagements/[id]/preview">): Promise<Metadata> {
  const { id } = await params;
  const letter = await apiServer<Letter>(`/engagements/${id}`);
  return { title: letter ? `${letter.title} — preview` : "Engagement letter not found" };
}

export default async function EngagementPreviewPage({
  params,
}: PageProps<"/engagements/[id]/preview">) {
  const { id } = await params;
  const [letter, me] = await Promise.all([
    apiServer<Letter>(`/engagements/${id}`),
    apiServer<Me>("/auth/me"),
  ]);
  if (!letter) notFound();

  return (
    <EngagementPreviewClient
      initialLetter={letter}
      firmName={me?.tenant?.name ?? "Your firm"}
      firmLogoUrl={me?.tenant?.logo_url ?? null}
    />
  );
}
