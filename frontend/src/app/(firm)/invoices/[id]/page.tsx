import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { apiServer } from "@/lib/api-server";
import type { Client, FirmInvoice, Me, Service } from "@/lib/types";

import { InvoiceDetailClient } from "./invoice-detail-client";

export async function generateMetadata({
  params,
}: PageProps<"/invoices/[id]">): Promise<Metadata> {
  const { id } = await params;
  const invoice = await apiServer<FirmInvoice>(`/invoices/${id}`);
  return { title: invoice ? invoice.number : "Invoice not found" };
}

export default async function InvoiceDetailPage({ params }: PageProps<"/invoices/[id]">) {
  const { id } = await params;
  const [invoice, clients, services, me] = await Promise.all([
    apiServer<FirmInvoice>(`/invoices/${id}`),
    apiServer<Client[]>("/clients"),
    apiServer<Service[]>("/services"),
    apiServer<Me>("/auth/me"),
  ]);
  if (!invoice) notFound();

  return (
    <InvoiceDetailClient
      initialInvoice={invoice}
      clients={clients ?? []}
      services={services ?? []}
      firmName={me?.tenant?.name ?? "Your firm"}
      firmLogoUrl={me?.tenant?.logo_url ?? null}
    />
  );
}
