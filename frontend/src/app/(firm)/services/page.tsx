import type { Metadata } from "next";

import { describeDueRule } from "@/lib/adapt";
import { apiServer } from "@/lib/api-server";
import { getServicesWithUsage } from "@/lib/firm-demo";
import type { Service } from "@/lib/types";

import { ServicesClient, type ServiceRow } from "./services-client";

export const metadata: Metadata = { title: "Services" };

/** Annualised value = price × cadence multiplier × clients assigned. */
const PER_YEAR: Record<string, number> = {
  monthly: 12,
  quarterly: 4,
  semi_annual: 2,
  annual: 1,
  one_time: 1,
};

export default async function ServicesPage() {
  const live = await apiServer<Service[]>("/services");

  const services: ServiceRow[] = live
    ? live.map((service) => ({
        id: service.id,
        code: service.code,
        name: service.name,
        description: service.description ?? "",
        category: service.category,
        frequency: service.frequency,
        default_price: service.default_price,
        lead_time_days: service.lead_time_days,
        is_active: service.is_active,
        due_rule: service.due_rule,
        due_rule_label: describeDueRule(service.due_rule),
        client_count: service.client_count,
        annual_value:
          service.client_count * service.default_price * (PER_YEAR[service.frequency] ?? 1),
      }))
    : getServicesWithUsage().map((service) => ({
        id: service.id,
        code: service.code,
        name: service.name,
        description: "",
        category: service.category,
        frequency: service.frequency,
        default_price: service.default_price,
        lead_time_days: service.lead_time_days,
        is_active: service.is_active,
        // The demo carries the rule pre-rendered as prose; live rows carry the
        // JSON grammar that backend/app/services/deadlines.py evaluates.
        due_rule: null,
        due_rule_label: service.due_rule,
        client_count: service.client_count,
        annual_value: service.annual_value,
      }));

  return <ServicesClient services={services} isLive={Boolean(live)} />;
}
