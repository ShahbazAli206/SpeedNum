import type { Metadata } from "next";

import { DashboardHeader } from "@/components/dashboard/page-shell";

import { SettingsClient } from "./settings-client";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <DashboardHeader
        title="Settings"
        subtitle="Manage your business profile and preferences"
      />
      <SettingsClient />
    </>
  );
}
