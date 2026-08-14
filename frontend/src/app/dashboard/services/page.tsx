import type { Metadata } from "next";

import { fetchLiveClientServices } from "@/lib/portal-live";

import { ServicesClient } from "./services-client";

export const metadata: Metadata = { title: "Services" };

export default async function ServicesPage() {
  // No demo.ts equivalent exists for this — a specific client's real service
  // assignments have no meaningful stand-in data, so this is an empty list
  // (not a demo fallback) until the backend is reachable.
  const services = (await fetchLiveClientServices()) ?? [];

  return <ServicesClient services={services} />;
}
