"use client";

import { ChartColumn, CircleCheck, Clock, Plus, Receipt } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ChartCard, KpiTile, StackedShare, type Slice } from "@/components/charts";
import { ExpenseStatusBadge } from "@/components/dashboard/badges";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { DashboardHeader, KpiRow } from "@/components/dashboard/page-shell";
import { useToast } from "@/components/toast";
import { Button, Drawer, Field, Input, Modal } from "@/components/ui";
import { ApiError, post } from "@/lib/api";
import { AUTH_CONFIGURED } from "@/lib/auth";
import type { Expense } from "@/lib/demo";
import { formatDate, formatMoney } from "@/lib/format";

export function ExpensesClient({
  expenses,
  totals,
  categories,
}: {
  expenses: Expense[];
  totals: {
    total: number;
    approved: number;
    pending: number;
    pendingValue: number;
    categories: number;
    gstPaid: number;
  };
  categories: { label: string; value: number }[];
}) {
  const toast = useToast();
  const router = useRouter();
  const [selected, setSelected] = useState<Expense | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [vendor, setVendor] = useState("");
  const [category, setCategory] = useState("");
  const [spentOn, setSpentOn] = useState("");
  const [amount, setAmount] = useState("");
  const [gst, setGst] = useState("0");
  const [method, setMethod] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const resetAddForm = () => {
    setVendor("");
    setCategory("");
    setSpentOn("");
    setAmount("");
    setGst("0");
    setMethod("");
  };

  const openAdd = () => {
    if (!AUTH_CONFIGURED) {
      toast.info("Demo mode", "Connect a backend to submit real expenses.");
      return;
    }
    setAddOpen(true);
  };

  const submitExpense = async () => {
    if (!vendor.trim() || !spentOn) return;
    setSubmitting(true);
    try {
      await post("/client-portal/expenses", {
        vendor: vendor.trim(),
        category: category.trim() || "General",
        spent_on: spentOn,
        amount: Number(amount) || 0,
        gst: Number(gst) || 0,
        method: method.trim() || null,
      });
      toast.success("Expense submitted", `${vendor.trim()} is now pending review.`);
      setAddOpen(false);
      resetAddForm();
      router.refresh();
    } catch (error) {
      toast.error("Couldn't submit that expense", error instanceof ApiError ? error.message : "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Top five categories keep their own colour slot; the tail folds into
  // "Other" rather than generating a sixth hue.
  const slices: Slice[] = categories.slice(0, 4).map((category, index) => ({
    label: category.label,
    value: category.value,
    slot: (index + 1) as Slice["slot"],
  }));
  const tail = categories.slice(4).reduce((sum, category) => sum + category.value, 0);
  if (tail > 0) slices.push({ label: "Other categories", value: tail, slot: 5 });

  const columns: Column<Expense>[] = [
    {
      key: "vendor",
      header: "Vendor",
      cell: (row) => <span className="font-medium text-ink">{row.vendor}</span>,
      sortValue: (row) => row.vendor,
    },
    {
      key: "category",
      header: "Category",
      cell: (row) => row.category,
      sortValue: (row) => row.category,
    },
    {
      key: "date",
      header: "Date",
      cell: (row) => formatDate(row.date),
      sortValue: (row) => row.date,
    },
    {
      key: "method",
      header: "Method",
      cell: (row) => <span className="text-[13px] text-muted">{row.method}</span>,
      sortValue: (row) => row.method,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      cell: (row) => <span className="font-medium text-ink">{formatMoney(row.amount)}</span>,
      sortValue: (row) => row.amount,
    },
    {
      key: "status",
      header: "Status",
      align: "right",
      cell: (row) => <ExpenseStatusBadge status={row.status} />,
      sortValue: (row) => row.status,
    },
  ];

  return (
    <>
      <DashboardHeader
        title="Expenses"
        subtitle="Your spending"
        actions={
          <Button icon={<Plus className="size-4" />} onClick={openAdd}>
            Add expense
          </Button>
        }
      />

      <KpiRow>
        <KpiTile
          tone="blue"
          value={formatMoney(totals.total)}
          label="Total"
          icon={<Receipt className="size-5" />}
        />
        <KpiTile
          tone="green"
          value={formatMoney(totals.approved)}
          label="Approved"
          hint={`${formatMoney(totals.gstPaid)} recoverable GST`}
          icon={<CircleCheck className="size-5" />}
        />
        <KpiTile
          tone="amber"
          value={`${totals.pending} items`}
          label="Pending"
          hint={formatMoney(totals.pendingValue)}
          icon={<Clock className="size-5" />}
        />
        <KpiTile
          tone="rose"
          value={String(totals.categories)}
          label="Categories"
          icon={<ChartColumn className="size-5" />}
        />
      </KpiRow>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <ChartCard
          title="Spending by category"
          subtitle="Approved and pending, this period"
        >
          <StackedShare slices={slices} format={(value) => formatMoney(value)} />
        </ChartCard>

        <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-semibold text-ink">Top vendors</h2>
            <p className="mt-0.5 text-[13px] text-muted">Where the money went</p>
          </div>
          <ul className="divide-y divide-line">
            {topVendors(expenses).map((vendor) => (
              <li key={vendor.name} className="flex items-center gap-3 px-5 py-3.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-[11px] font-bold text-ink-soft">
                  {vendor.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-ink">
                    {vendor.name}
                  </span>
                  <span className="block text-[12px] text-muted">
                    {vendor.count} transaction{vendor.count === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="shrink-0 text-[13.5px] font-semibold tabular-nums text-ink">
                  {formatMoney(vendor.total)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-6 rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">Recent expenses</h2>
          <p className="mt-0.5 text-[13px] text-muted">Your spending by category</p>
        </div>
        <DataTable
          rows={expenses}
          columns={columns}
          searchKeys={(row) => `${row.vendor} ${row.category} ${row.method}`}
          filters={[
            {
              label: "Status",
              options: [
                { value: "approved", label: "Approved" },
                { value: "pending", label: "Pending" },
                { value: "rejected", label: "Rejected" },
              ],
              predicate: (row, value) => row.status === value,
            },
            {
              label: "Categories",
              options: categories.map((category) => ({
                value: category.label,
                label: category.label,
              })),
              predicate: (row, value) => row.category === value,
            },
          ]}
          emptyTitle="No expenses match"
          emptyDescription="Try clearing the search or the filters above."
          onRowClick={setSelected}
          exportName="spidnums-expenses"
        />
      </section>

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.vendor ?? ""}
        subtitle={selected?.category}
        footer={
          <Button variant="secondary" onClick={() => setSelected(null)}>
            Close
          </Button>
        }
      >
        {selected ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <ExpenseStatusBadge status={selected.status} />
              <span className="font-display text-2xl font-bold text-ink">
                {formatMoney(selected.amount)}
              </span>
            </div>

            <dl className="space-y-3 rounded-xl border border-line p-4">
              <Row label="Date" value={formatDate(selected.date, "long")} />
              <Row label="Category" value={selected.category} />
              <Row label="Payment method" value={selected.method} />
              <Row label="GST/HST paid" value={formatMoney(selected.gst)} />
              <Row label="Receipt attached" value={selected.receipt ? "Yes" : "No"} />
            </dl>

            {!selected.receipt ? (
              <div className="rounded-xl border border-warn/25 bg-warn-soft/50 p-4">
                <p className="text-[13px] leading-relaxed text-ink-soft">
                  No receipt on file. Expenses without a receipt are harder to defend on review —
                  upload one from the Documents page.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </Drawer>

      <Modal
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          resetAddForm();
        }}
        title="Add expense"
        description="Submitted expenses start out pending your accountant's review."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setAddOpen(false);
                resetAddForm();
              }}
            >
              Cancel
            </Button>
            <Button
              icon={<Plus className="size-4" />}
              loading={submitting}
              disabled={!vendor.trim() || !spentOn}
              onClick={submitExpense}
            >
              Submit
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Vendor" required>
            <Input value={vendor} onChange={(event) => setVendor(event.target.value)} placeholder="e.g. Staples" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category">
              <Input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="General" />
            </Field>
            <Field label="Date" required>
              <Input type="date" value={spentOn} onChange={(event) => setSpentOn(event.target.value)} />
            </Field>
            <Field label="Amount ($)">
              <Input type="number" min={0} step={0.01} value={amount} onChange={(event) => setAmount(event.target.value)} />
            </Field>
            <Field label="GST/HST paid ($)">
              <Input type="number" min={0} step={0.01} value={gst} onChange={(event) => setGst(event.target.value)} />
            </Field>
            <Field label="Payment method" className="sm:col-span-2">
              <Input
                value={method}
                onChange={(event) => setMethod(event.target.value)}
                placeholder="e.g. Visa ••4821"
              />
            </Field>
          </div>
        </div>
      </Modal>
    </>
  );
}

function topVendors(expenses: Expense[]) {
  const totals = new Map<string, { total: number; count: number }>();
  for (const expense of expenses) {
    if (expense.status === "rejected") continue;
    const current = totals.get(expense.vendor) ?? { total: 0, count: 0 };
    totals.set(expense.vendor, {
      total: current.total + expense.amount,
      count: current.count + 1,
    });
  }
  return [...totals.entries()]
    .map(([name, value]) => ({ name, ...value }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="text-right text-[13.5px] text-ink">{value}</dd>
    </div>
  );
}
