import type { Metadata } from "next";

import { getExpenseByCategory, getExpenseTotals, getExpenses } from "@/lib/demo";

import { ExpensesClient } from "./expenses-client";

export const metadata: Metadata = { title: "Expenses" };

export default function ExpensesPage() {
  return (
    <ExpensesClient
      expenses={getExpenses()}
      totals={getExpenseTotals()}
      categories={getExpenseByCategory()}
    />
  );
}
