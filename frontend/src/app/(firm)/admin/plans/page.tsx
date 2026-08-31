import type { Metadata } from "next";

import { DashboardHeader } from "@/components/dashboard/page-shell";

import { PlansClient } from "./plans-client";

export const metadata: Metadata = { title: "Plans" };

export default function PlansPage() {
  return (
    <>
      <DashboardHeader
        title="Plans"
        subtitle="Edit plan names, prices and seat caps, add new plans, or deactivate ones you no longer offer — company owners see the active plans on their billing page."
      />
      <PlansClient />
    </>
  );
}
