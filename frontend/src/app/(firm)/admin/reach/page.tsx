import type { Metadata } from "next";

import { DashboardHeader } from "@/components/dashboard/page-shell";

import { ReachClient } from "./reach-client";

export const metadata: Metadata = { title: "Reach" };

export default function ReachPage() {
  return (
    <>
      <DashboardHeader
        title="Reach"
        subtitle="How far the platform travels — site traffic, search footprint, and platform scale in one place"
      />
      <ReachClient />
    </>
  );
}
