import type { Metadata } from "next";

import { DashboardHeader } from "@/components/dashboard/page-shell";

import { PlatformSettingsClient } from "./platform-settings-client";

export const metadata: Metadata = { title: "Platform settings" };

export default function PlatformSettingsPage() {
  return (
    <>
      <DashboardHeader
        title="Platform settings"
        subtitle="How the multi-tenant platform is configured"
      />
      <PlatformSettingsClient />
    </>
  );
}
