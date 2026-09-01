"use client";

import { Ban, CheckCircle2, Pencil, Plus, Receipt, ShieldCheck, Trash2, Wallet } from "lucide-react";
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
import { createBill, deleteBill, markBillPaid, markBillUnpaid, updateBill } from "@/lib/bills";
import { formatMoney } from "@/lib/format";
import { useAction, useApi } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { FirmBill, FirmBillTotals } from "@/lib/types";

const CATEGORIES = [
  { value: "software", label: "Software" },
  { value: "rent", label: "Rent" },
  { value: "salary", label: "Salary" },
  { value: "utilities", label: "Utilities" },
  { value: "subscription", label: "Subscription" },
  { value: "other", label: "Other" },
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function BillsClient() {
  const session = useSession();
  const toast = useToast();
  const bills = useApi<FirmBill[]>("/bills");
  const totals = useApi<FirmBillTotals>("/bills/totals");
  const mutate = useAction();

  const [modal, setModal] = useState<FirmBill | "new" | null>(null);
  const [removing, setRemoving] = useState<FirmBill | null>(null);

  const reload = () => Promise.all([bills.reload(), totals.reload()]);

  const save = (values: {
    category: string;
    vendor: string;
    amount: string;
    bill_date: string;
    due_date: string;
    is_recurring: boolean;
    notes: string;
  }) =>
    mutate.run(async () => {
      const body = {
        category: values.category,
        vendor: values.vendor || null,
        amount: Number(values.amount),
        bill_date: values.bill_date,
        due_date: values.due_date || null,
        is_recurring: values.is_recurring,
        notes: values.notes || null,
      };
      if (modal && modal !== "new") {
        await updateBill(modal.id, body);
      } else {
        await createBill(body);
      }
      toast.success("Bill saved");
      setModal(null);
      await reload();
    });

  const toggleStatus = (bill: FirmBill) =>
    mutate.run(async () => {
      await (bill.status === "paid" ? markBillUnpaid(bill.id) : markBillPaid(bill.id));
      await reload();
    });

  const confirmDelete = () =>
    mutate.run(async () => {
      if (!removing) return;
      await deleteBill(removing.id);
      toast.success("Bill deleted");
      setRemoving(null);
      await reload();
    });

  const forbidden = bills.error?.status === 403;
  const canManage = session.isAdmin;

  return (
    <>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <KpiTile
          tone="green"
          value={totals.data ? formatMoney(totals.data.paid) : "—"}
          label="Paid"
          icon={<CheckCircle2 className="size-5" />}
        />
        <KpiTile
          tone="amber"
          value={totals.data ? formatMoney(totals.data.unpaid) : "—"}
          label="Unpaid"
          icon={<Wallet className="size-5" />}
        />
        <KpiTile tone="blue" value={String(totals.data?.count ?? 0)} label="Bills logged" icon={<Receipt className="size-5" />} />
      </div>

      <section className="rounded-xl border border-line bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">All bills</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              Manual entries plus what you&apos;ve paid SpidNums, merged into one ledger
            </p>
          </div>
          {canManage ? (
            <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setModal("new")}>
              Log a bill
            </Button>
          ) : null}
        </div>

        {forbidden ? (
          <EmptyState
            icon={<ShieldCheck className="size-6" />}
            title="Owner or admin access required"
            description="Ask your firm's owner or an admin to view the firm's bills."
          />
        ) : bills.isLoading ? (
          <LoadingBlock />
        ) : !bills.data || bills.data.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-muted">No bills logged yet.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <TH>Date</TH>
                <TH>Category</TH>
                <TH>Vendor</TH>
                <TH align="right">Amount</TH>
                <TH>Status</TH>
                {canManage ? <TH align="right">Actions</TH> : null}
              </tr>
            </thead>
            <tbody>
              {bills.data.map((row) => {
                const isSubscription = row.source === "subscription";
                return (
                  <tr key={row.id}>
                    <TD>{row.bill_date}</TD>
                    <TD className="capitalize">{row.category}</TD>
                    <TD>{row.vendor ?? "—"}</TD>
                    <TD align="right">{formatMoney(row.amount, row.currency)}</TD>
                    <TD>
                      <button
                        type="button"
                        disabled={!canManage || isSubscription}
                        onClick={() => toggleStatus(row)}
                        className={
                          row.status === "paid"
                            ? "inline-flex items-center rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success disabled:cursor-default"
                            : "inline-flex items-center rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn disabled:cursor-default"
                        }
                      >
                        {row.status === "paid" ? "Paid" : "Unpaid"}
                      </button>
                    </TD>
                    {canManage ? (
                      <TD align="right">
                        {isSubscription ? (
                          <span className="text-[11.5px] text-muted">SpidNums</span>
                        ) : (
                          <span className="inline-flex gap-1">
                            <button
                              type="button"
                              onClick={() => setModal(row)}
                              className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink"
                              aria-label="Edit"
                            >
                              <Pencil className="size-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setRemoving(row)}
                              className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-danger-soft hover:text-danger"
                              aria-label="Delete"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </span>
                        )}
                      </TD>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </section>

      {modal ? (
        <BillModal
          initial={modal === "new" ? null : modal}
          pending={mutate.pending}
          onClose={() => setModal(null)}
          onSubmit={save}
        />
      ) : null}

      <Modal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Delete bill"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={mutate.pending} onClick={() => void confirmDelete()}>
              <Ban className="size-4" />
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

function BillModal({
  initial,
  pending,
  onClose,
  onSubmit,
}: {
  initial: FirmBill | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (values: {
    category: string;
    vendor: string;
    amount: string;
    bill_date: string;
    due_date: string;
    is_recurring: boolean;
    notes: string;
  }) => void;
}) {
  const [category, setCategory] = useState(initial?.category ?? "software");
  const [vendor, setVendor] = useState(initial?.vendor ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [billDate, setBillDate] = useState(initial?.bill_date ?? todayISO());
  const [dueDate, setDueDate] = useState(initial?.due_date ?? "");
  const [isRecurring, setIsRecurring] = useState(initial?.is_recurring ?? false);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? "Edit bill" : "Log a bill"}
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
              onSubmit({ category, vendor, amount, bill_date: billDate, due_date: dueDate, is_recurring: isRecurring, notes });
            }}
          >
            {initial ? "Save changes" : "Add bill"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            <Select value={category} onValueChange={setCategory} options={CATEGORIES} />
          </Field>
          <Field label="Vendor">
            <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Adobe, landlord, ..." />
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
              placeholder="99.00"
            />
          </Field>
          <Field label="Bill date">
            <Input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
          </Field>
          <Field label="Due date" hint="Optional">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
        <Checkbox label="Recurring bill" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
        <Field label="Notes">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </Field>
      </div>
    </Modal>
  );
}
