import type { Metadata } from "next";

import { getExpenseByCategory, getExpenseTotals, getExpenses } from "@/lib/demo";
import {
  fetchLiveExpenseByCategory,
  fetchLiveExpenseTotals,
  fetchLiveExpenses,
} from "@/lib/portal-live";

import { ExpensesClient } from "./expenses-client";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage() {
  const [expenses, totals, categories] = await Promise.all([
    fetchLiveExpenses().then((live) => live ?? getExpenses()),
    fetchLiveExpenseTotals().then((live) => live ?? getExpenseTotals()),
    fetchLiveExpenseByCategory().then((live) => live ?? getExpenseByCategory()),
  ]);

  return <ExpensesClient expenses={expenses} totals={totals} categories={categories} />;
}
