import type { Metadata } from "next";

import { EngagementSignClient } from "./engagement-sign-client";

export const metadata: Metadata = {
  title: "Engagement letter",
  robots: { index: false, follow: false },
};

export default async function EngagementSignPage({
  params,
}: PageProps<"/engagement/[token]">) {
  const { token } = await params;
  return <EngagementSignClient token={token} />;
}
