"use client";

/**
 * Client for the firm's own accounts-receivable invoices (backend/app/routers/
 * firm_invoices.py, prefix /invoices). Any signed-in staff can read; writes are
 * gated server-side by the invoices.manage permission (app/permissions.py) —
 * the API is the real boundary, this just reflects it.
 */

import { del, get, patch, post } from "./api";
import type { FirmInvoice, FirmInvoiceTotals } from "./types";

export interface InvoiceItemInput {
  service_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
}

export interface InvoiceCreateInput {
  client_id: string;
  number: string;
  title?: string;
  description?: string | null;
  issued_on?: string | null;
  due_on: string;
  currency?: string;
  tax_rate?: number;
  recipient_name?: string | null;
  recipient_email?: string | null;
  notes?: string | null;
  items: InvoiceItemInput[];
}

export type InvoiceUpdateInput = Partial<Omit<InvoiceCreateInput, "client_id">>;

export const listInvoices = (params?: { client_id?: string; status?: string }) => {
  const search = new URLSearchParams();
  if (params?.client_id) search.set("client_id", params.client_id);
  if (params?.status) search.set("status", params.status);
  const qs = search.toString();
  return get<FirmInvoice[]>(`/invoices${qs ? `?${qs}` : ""}`);
};
export const getInvoiceTotals = () => get<FirmInvoiceTotals>("/invoices/totals");
export const getInvoice = (id: string) => get<FirmInvoice>(`/invoices/${id}`);
export const createInvoice = (input: InvoiceCreateInput) => post<FirmInvoice>("/invoices", input);
export const updateInvoice = (id: string, input: InvoiceUpdateInput) =>
  patch<FirmInvoice>(`/invoices/${id}`, input);
export const sendInvoice = (id: string, message?: string) =>
  post<FirmInvoice>(`/invoices/${id}/send`, { message: message?.trim() || null });
export const recordInvoicePayment = (
  id: string,
  input: { amount: number; paid_on?: string | null; method?: string | null; notes?: string | null },
) => post<FirmInvoice>(`/invoices/${id}/payments`, input);
export const deleteInvoicePayment = (invoiceId: string, paymentId: string) =>
  del<FirmInvoice>(`/invoices/${invoiceId}/payments/${paymentId}`);
export const voidInvoice = (id: string) => post<FirmInvoice>(`/invoices/${id}/void`);
export const duplicateInvoice = (id: string) => post<FirmInvoice>(`/invoices/${id}/duplicate`);
export const deleteInvoice = (id: string) => del<{ ok: boolean; message: string }>(`/invoices/${id}`);
