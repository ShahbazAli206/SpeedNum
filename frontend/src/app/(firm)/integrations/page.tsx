import type { Metadata } from "next";

import { IntegrationsClient } from "./integrations-client";

export const metadata: Metadata = { title: "Integrations" };

export default function IntegrationsPage() {
  return <IntegrationsClient />;
}
