import type { Metadata } from "next";

import { ClientSettingsClient } from "./client-settings-client";

export const metadata: Metadata = { title: "Client settings" };

export default function ClientSettingsPage() {
  return <ClientSettingsClient />;
}
