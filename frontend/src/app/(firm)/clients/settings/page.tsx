import type { Metadata } from "next";

import { getCustomFields } from "@/lib/firm-demo";

import { ClientSettingsClient } from "./client-settings-client";

export const metadata: Metadata = { title: "Client settings" };

export default function ClientSettingsPage() {
  const fields = getCustomFields().filter((field) => field.entity === "client");

  return <ClientSettingsClient initialFields={fields} />;
}
