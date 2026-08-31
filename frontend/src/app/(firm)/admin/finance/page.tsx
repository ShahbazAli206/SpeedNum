"use client";

import { Pencil, Plus, ShieldOff, TrendingDown, TrendingUp, Trash2, Wallet } from "lucide-react";
import { useState } from "react";

import { KpiTile } from "@/components/charts";
import { useToast } from "@/components/toast";
import {
  Button,
  Checkbox,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Select,
  Table,
  TD,
  TH,
} from "@/components/ui";
import { del, patch, post } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { useAction, useApi } from "@/lib/hooks";

import { AdminInvoicesSection } from "./admin-invoices-section";

/**
 * Real data only, like admin/backups — every call hits a superadmin-only
 * backend endpoint (backend/app/routers/platform_finance.py). A non-superadmin
 * gets a real 403, which is the actual enforcement boundary this page reflects
 * rather than duplicates. Manual ledger, no payment processor — see
 * PLATFORM_IMPLEMENTATION_LOG.md's Phase 2 notes for why.
 */

const EXPENSE_CATEGORIES = [
  { value: "hosting", label: "Hosting" },
  { value: "domains", label: "Domains" },
  { value: "development", label: "Development" },
  { value: "maintenance", label: "Maintenance" },
  { value: "other", label: "Other" },
];

interface Expense {
  id: string;
  category: string;
  vendor: string | null;
  amount: string;
  currency: string;
  expense_date: string;
  is_recurring: boolean;
  notes: string | null;
}

interface Income {
  id: string;
  tenant_id: string | null;
  tenant_name: string | null;
  amount: string;
  currency: string;
  received_date: string;
  method: string;
  notes: string | null;
}

interface Summary {
  total_income: string;
  total_expenses: string;
  profit: string;
  income_count: number;
  expense_count: number;
}

interface TenantOption {
  id: string;
  name: string;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function FinancePage() {
  const toast = useToast();
  const summary = useApi<Summary>("/admin/finance/summary");
  const expenses = useApi<Expense[]>("/admin/finance/expenses");
  const income = useApi<Income[]>("/admin/finance/income");
  const tenants = useApi<TenantOption[]>("/admin/tenants");
  const mutate = useAction();

  const [expenseModal, setExpenseModal] = useState<Expense | "new" | null>(null);
  const [incomeModal, setIncomeModal] = useState<Income | "new" | null>(null);
  const [removingExpense, setRemovingExpense] = useState<Expense | null>(null);
  const [removingIncome, setRemovingIncome] = useState<Income | null>(null);

  const forbidden = summary.error?.status === 403;
  if (forbidden) {
    return (
      <EmptyState
        icon={<ShieldOff className="size-6" />}
        title="Superadmin access required"
        description="The provider finance ledger is restricted to the platform superadmin role."
      />
    );
  }

  const saveExpense = (values: {
    category: string;
    vendor: string;
    amount: string;
    expense_date: string;
    is_recurring: boolean;
    notes: string;
  }) =>
    mutate.run(async () => {
      const body = {
        category: values.category,
        vendor: values.vendor || null,
        amount: values.amount,
        expense_date: values.expense_date,
        is_recurring: values.is_recurring,
        notes: values.notes || null,
      };
      if (expenseModal && expenseModal !== "new") {
        await patch(`/admin/finance/expenses/${expenseModal.id}`, body);
      } else {
        await post("/admin/finance/expenses", body);
      }
      toast.success("Expense saved");
      setExpenseModal(null);
      await Promise.all([expenses.reload(), summary.reload()]);
    });

  const saveIncome = (values: {
    tenant_id: string;
    amount: string;
    received_date: string;
    method: string;
    notes: string;
  }) =>
    mutate.run(async () => {
      const body = {
        tenant_id: values.tenant_id || null,
        amount: values.amount,
        received_date: values.received_date,
        method: values.method,
        notes: values.notes || null,
      };
      if (incomeModal && incomeModal !== "new") {
        await patch(`/admin/finance/income/${incomeModal.id}`, body);
      } else {
        await post("/admin/finance/income", body);
      }
      toast.success("Income entry saved");
      setIncomeModal(null);
      await Promise.all([income.reload(), summary.reload()]);
    });

  const confirmDeleteExpense = () =>
    mutate.run(async () => {
      if (!removingExpense) return;
      await del(`/admin/finance/expenses/${removingExpense.id}`);
      toast.success("Expense deleted");
      setRemovingExpense(null);
      await Promise.all([expenses.reload(), summary.reload()]);
    });

  const confirmDeleteIncome = () =>
    mutate.run(async () => {
      if (!removingIncome) return;
      await del(`/admin/finance/income/${removingIncome.id}`);
      toast.success("Income entry deleted");
      setRemovingIncome(null);
      await Promise.all([income.reload(), summary.reload()]);
    });

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[1.6rem] font-bold tracking-tight text-ink">Finance</h1>
          <p className="mt-0.5 text-[14px] text-muted">
            What tenant firms pay you, what running the platform costs, and the margin between them.
            Logged by hand — no payment processor is wired up yet.
          </p>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <KpiTile
          tone="green"
          value={summary.data ? formatMoney(Number(summary.data.total_income)) : "—"}
          label={`Income (${summary.data?.income_count ?? 0} entries)`}
          icon={<TrendingUp className="size-5" />}
        />
        <KpiTile
          tone="rose"
          value={summary.data ? formatMoney(Number(summary.data.total_expenses)) : "—"}
          label={`Expenses (${summary.data?.expense_count ?? 0} entries)`}
          icon={<TrendingDown className="size-5" />}
        />
        <KpiTile
          tone="blue"
          value={summary.data ? formatMoney(Number(summary.data.profit)) : "—"}
          label="Profit"
          icon={<Wallet className="size-5" />}
        />
      </div>

      <AdminInvoicesSection tenants={tenants.data ?? []} />

      <section className="mb-6 rounded-xl border border-line bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Income</h2>
            <p className="mt-0.5 text-[13px] text-muted">Payments received from tenant firms</p>
          </div>
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setIncomeModal("new")}>
            Log income
          </Button>
        </div>
        {income.isLoading ? (
          <LoadingBlock />
        ) : !income.data || income.data.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-muted">No income logged yet.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <TH>Date</TH>
                <TH>Tenant</TH>
                <TH align="right">Amount</TH>
                <TH>Method</TH>
                <TH>Notes</TH>
                <TH align="right">Actions</TH>
              </tr>
            </thead>
            <tbody>
              {income.data.map((row) => (
                <tr key={row.id}>
                  <TD>{row.received_date}</TD>
                  <TD>{row.tenant_name ?? "—"}</TD>
                  <TD align="right">{formatMoney(Number(row.amount))}</TD>
                  <TD className="capitalize">{row.method}</TD>
                  <TD>{row.notes ?? "—"}</TD>
                  <TD align="right">
                    <span className="inline-flex gap-1">
                      <button
                        type="button"
                        onClick={() => setIncomeModal(row)}
                        className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink"
                        aria-label="Edit"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRemovingIncome(row)}
                        className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-danger-soft hover:text-danger"
                        aria-label="Delete"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </span>
                  </TD>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section className="rounded-xl border border-line bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Expenses</h2>
            <p className="mt-0.5 text-[13px] text-muted">What running the platform costs</p>
          </div>
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setExpenseModal("new")}>
            Log expense
          </Button>
        </div>
        {expenses.isLoading ? (
          <LoadingBlock />
        ) : !expenses.data || expenses.data.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-muted">No expenses logged yet.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <TH>Date</TH>
                <TH>Category</TH>
                <TH>Vendor</TH>
                <TH align="right">Amount</TH>
                <TH>Recurring</TH>
                <TH align="right">Actions</TH>
              </tr>
            </thead>
            <tbody>
              {expenses.data.map((row) => (
                <tr key={row.id}>
                  <TD>{row.expense_date}</TD>
                  <TD className="capitalize">{row.category}</TD>
                  <TD>{row.vendor ?? "—"}</TD>
                  <TD align="right">{formatMoney(Number(row.amount))}</TD>
                  <TD>{row.is_recurring ? "Yes" : "No"}</TD>
                  <TD align="right">
                    <span className="inline-flex gap-1">
                      <button
                        type="button"
                        onClick={() => setExpenseModal(row)}
                        className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink"
                        aria-label="Edit"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRemovingExpense(row)}
                        className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-danger-soft hover:text-danger"
                        aria-label="Delete"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </span>
                  </TD>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      {expenseModal ? (
        <ExpenseModal
          initial={expenseModal === "new" ? null : expenseModal}
          pending={mutate.pending}
          onClose={() => setExpenseModal(null)}
          onSubmit={saveExpense}
        />
      ) : null}

      {incomeModal ? (
        <IncomeModal
          initial={incomeModal === "new" ? null : incomeModal}
          tenants={tenants.data ?? []}
          pending={mutate.pending}
          onClose={() => setIncomeModal(null)}
          onSubmit={saveIncome}
        />
      ) : null}

      <Modal
        open={removingExpense !== null}
        onClose={() => setRemovingExpense(null)}
        title="Delete expense"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemovingExpense(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={mutate.pending} onClick={() => void confirmDeleteExpense()}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-[13.5px] text-ink-soft">This entry will be permanently removed.</p>
      </Modal>

      <Modal
        open={removingIncome !== null}
        onClose={() => setRemovingIncome(null)}
        title="Delete income entry"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemovingIncome(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={mutate.pending} onClick={() => void confirmDeleteIncome()}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-[13.5px] text-ink-soft">This entry will be permanently removed.</p>
      </Modal>
    </>
  );
}

function ExpenseModal({
  initial,
  pending,
  onClose,
  onSubmit,
}: {
  initial: Expense | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (values: {
    category: string;
    vendor: string;
    amount: string;
    expense_date: string;
    is_recurring: boolean;
    notes: string;
  }) => void;
}) {
  const [category, setCategory] = useState(initial?.category ?? "hosting");
  const [vendor, setVendor] = useState(initial?.vendor ?? "");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [expenseDate, setExpenseDate] = useState(initial?.expense_date ?? todayISO());
  const [isRecurring, setIsRecurring] = useState(initial?.is_recurring ?? false);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? "Edit expense" : "Log expense"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            icon={initial ? <Pencil className="size-4" /> : <Plus className="size-4" />}
            loading={pending}
            onClick={() => {
              if (!amount.trim() || Number(amount) <= 0) {
                setError("Enter an amount greater than 0.");
                return;
              }
              onSubmit({ category, vendor, amount, expense_date: expenseDate, is_recurring: isRecurring, notes });
            }}
          >
            {initial ? "Save changes" : "Add expense"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            <Select value={category} onValueChange={setCategory} options={EXPENSE_CATEGORIES} />
          </Field>
          <Field label="Vendor">
            <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Hostinger" />
          </Field>
          <Field label="Amount" required error={error}>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError(null);
              }}
              placeholder="12.00"
            />
          </Field>
          <Field label="Date">
            <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
          </Field>
        </div>
        <Checkbox
          label="Recurring expense"
          checked={isRecurring}
          onChange={(e) => setIsRecurring(e.target.checked)}
        />
        <Field label="Notes">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </Field>
      </div>
    </Modal>
  );
}

function IncomeModal({
  initial,
  tenants,
  pending,
  onClose,
  onSubmit,
}: {
  initial: Income | null;
  tenants: TenantOption[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (values: {
    tenant_id: string;
    amount: string;
    received_date: string;
    method: string;
    notes: string;
  }) => void;
}) {
  const [tenantId, setTenantId] = useState(initial?.tenant_id ?? "");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [receivedDate, setReceivedDate] = useState(initial?.received_date ?? todayISO());
  const [method, setMethod] = useState(initial?.method ?? "manual");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? "Edit income entry" : "Log income"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            icon={initial ? <Pencil className="size-4" /> : <Plus className="size-4" />}
            loading={pending}
            onClick={() => {
              if (!amount.trim() || Number(amount) <= 0) {
                setError("Enter an amount greater than 0.");
                return;
              }
              onSubmit({ tenant_id: tenantId, amount, received_date: receivedDate, method, notes });
            }}
          >
            {initial ? "Save changes" : "Add income"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tenant" hint="Optional — leave unset for platform-wide income.">
            <Select
              value={tenantId}
              onValueChange={setTenantId}
              options={[{ value: "", label: "Unassigned" }, ...tenants.map((t) => ({ value: t.id, label: t.name }))]}
            />
          </Field>
          <Field label="Amount" required error={error}>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError(null);
              }}
              placeholder="499.00"
            />
          </Field>
          <Field label="Date">
            <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
          </Field>
          <Field label="Method">
            <Select
              value={method}
              onValueChange={setMethod}
              options={[
                { value: "manual", label: "Manual" },
                { value: "stripe", label: "Stripe" },
              ]}
            />
          </Field>
        </div>
        <Field label="Notes">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </Field>
      </div>
    </Modal>
  );
}
