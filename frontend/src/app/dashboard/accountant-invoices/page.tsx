import type { Metadata } from "next";

import { apiServer } from "@/lib/api-server";
import { fetchLiveFirmInvoiceTotals, fetchLiveFirmInvoices } from "@/lib/portal-live";
import type { Me } from "@/lib/types";

import { AccountantInvoicesClient } from "./accountant-invoices-client";

export const metadata: Metadata = { title: "Accountant invoices" };

export default async function AccountantInvoicesPage() {
  const [invoices, totals, me] = await Promise.all([
    fetchLiveFirmInvoices(),
    fetchLiveFirmInvoiceTotals(),
    apiServer<Me>("/auth/me"),
  ]);

  return (
    <AccountantInvoicesClient
      invoices={invoices ?? []}
      totals={totals}
      firmName={me?.tenant?.name ?? "Your accountant"}
      firmLogoUrl={me?.tenant?.logo_url ?? null}
    />
  );
}
