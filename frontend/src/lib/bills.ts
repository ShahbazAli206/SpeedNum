"use client";

/**
 * Client for the firm's own accounts-payable bills (backend/app/routers/
 * firm_bills.py, prefix /bills). Any signed-in staff can read, including the
 * read-only "subscription" rows merged in from what the firm paid SpidNums;
 * writes are Owner/Admin-only server-side (CurrentUser.is_admin).
 */

import { del, get, patch, post } from "./api";
import type { FirmBill, FirmBillTotals } from "./types";

export interface BillCreateInput {
  category: string;
  vendor?: string | null;
  amount: number;
  currency?: string;
  bill_date?: string | null;
  due_date?: string | null;
  is_recurring?: boolean;
  notes?: string | null;
}

export type BillUpdateInput = Partial<BillCreateInput>;

export const listBills = (status?: string) => get<FirmBill[]>(status ? `/bills?status=${status}` : "/bills");
export const getBillTotals = () => get<FirmBillTotals>("/bills/totals");
export const createBill = (input: BillCreateInput) => post<FirmBill>("/bills", input);
export const updateBill = (id: string, input: BillUpdateInput) => patch<FirmBill>(`/bills/${id}`, input);
export const markBillPaid = (id: string) => post<FirmBill>(`/bills/${id}/mark-paid`);
export const markBillUnpaid = (id: string) => post<FirmBill>(`/bills/${id}/mark-unpaid`);
export const deleteBill = (id: string) => del<{ ok: boolean; message: string }>(`/bills/${id}`);
