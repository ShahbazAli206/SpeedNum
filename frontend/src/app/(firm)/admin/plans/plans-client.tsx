"use client";

import { Ban, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  Alert,
  Badge,
  Button,
  Checkbox,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Textarea,
} from "@/components/ui";
import { createPlan, deletePlan, updatePlan } from "@/lib/admin";
import { formatMoney } from "@/lib/format";
import { useAction, useApi } from "@/lib/hooks";
import type { PlanAdmin, PlanInput } from "@/lib/types";

const cap = (n: number | null) => (n === null ? "Unlimited" : String(n));
const priceLabel = (p: number | null) => (p === null ? "Custom" : p === 0 ? "Free" : `${formatMoney(p, "USD")}/mo`);

interface FormState {
  label: string;
  price: string; // "" = custom / quoted
  maxClients: string; // "" = unlimited
  maxStaff: string; // "" = unlimited
  blurb: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = { label: "", price: "", maxClients: "", maxStaff: "", blurb: "", isActive: true };

const toForm = (p: PlanAdmin): FormState => ({
  label: p.label,
  price: p.price === null ? "" : String(p.price),
  maxClients: p.max_clients === null ? "" : String(p.max_clients),
  maxStaff: p.max_staff === null ? "" : String(p.max_staff),
  blurb: p.blurb,
  isActive: p.is_active,
});

const toPayload = (f: FormState): PlanInput => {
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  return {
    label: f.label.trim(),
    price: num(f.price),
    max_clients: num(f.maxClients),
    max_staff: num(f.maxStaff),
    blurb: f.blurb.trim(),
    is_active: f.isActive,
  };
};

export function PlansClient() {
  const plans = useApi<PlanAdmin[]>("/admin/plans");
  const mutate = useAction();

  const [editing, setEditing] = useState<PlanAdmin | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleting, setDeleting] = useState<PlanAdmin | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  if (plans.error?.status === 403) {
    return (
      <EmptyState
        icon={<Ban className="size-6" />}
        title="Superadmin access required"
        description="Plan management is restricted to the platform superadmin role."
      />
    );
  }
  if (plans.error) {
    return (
      <EmptyState
        title="Couldn't load plans"
        description="Something went wrong reaching the API. Please try again."
        action={
          <Button variant="secondary" onClick={() => plans.reload()}>
            Try again
          </Button>
        }
      />
    );
  }

  const openNew = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setEditing("new");
  };
  const openEdit = (p: PlanAdmin) => {
    setForm(toForm(p));
    setFormError(null);
    setEditing(p);
  };
  const closeModal = () => {
    setEditing(null);
    setFormError(null);
  };

  const save = () =>
    mutate.run(async () => {
      if (!editing) return;
      if (!form.label.trim()) {
        setFormError("A plan name is required.");
        return;
      }
      setFormError(null);
      const payload = toPayload(form);
      try {
        if (editing === "new") await createPlan(payload);
        else await updatePlan(editing.id, payload);
      } catch (err) {
        setFormError(err instanceof Error ? err.message : String(err));
        return;
      }
      closeModal();
      await plans.reload();
    });

  const confirmDelete = () =>
    mutate.run(async () => {
      if (!deleting) return;
      setFormError(null);
      try {
        await deletePlan(deleting.id);
      } catch (err) {
        setFormError(err instanceof Error ? err.message : String(err));
        return;
      }
      setDeleting(null);
      await plans.reload();
    });

  const rows = plans.data ?? [];

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button icon={<Plus className="size-4" />} onClick={openNew}>
          Add plan
        </Button>
      </div>

      <section className="rounded-xl border border-line bg-surface shadow-card">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">Catalog</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {rows.length} {rows.length === 1 ? "plan" : "plans"} · inactive plans stay hidden from company owners
          </p>
        </div>

        {plans.isLoading ? (
          <LoadingBlock label="Loading plans…" />
        ) : rows.length === 0 ? (
          <EmptyState title="No plans yet" description="Add your first plan to show it on the billing page." />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-line text-[11.5px] tracking-wide text-muted uppercase">
                  <th className="px-5 py-2.5 text-left font-semibold">Plan</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Price</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Clients</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Staff</th>
                  <th className="px-5 py-2.5 text-center font-semibold">Status</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-b-0">
                    <td className="px-5 py-3">
                      <span className="font-medium text-ink">{p.label}</span>
                      <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted">
                        {p.key}
                      </span>
                      {p.blurb ? <p className="mt-0.5 text-[12px] text-muted">{p.blurb}</p> : null}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-ink-soft">{priceLabel(p.price)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-ink-soft">{cap(p.max_clients)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-ink-soft">{cap(p.max_staff)}</td>
                    <td className="px-5 py-3 text-center">
                      <Badge tone={p.is_active ? "success" : "neutral"}>{p.is_active ? "Active" : "Inactive"}</Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink"
                          aria-label={`Edit ${p.label}`}
                          title="Edit"
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFormError(null);
                            setDeleting(p);
                          }}
                          className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-danger-soft hover:text-danger"
                          aria-label={`Delete ${p.label}`}
                          title="Delete"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing ? (
        <Modal
          open
          onClose={closeModal}
          title={editing === "new" ? "Add plan" : `Edit ${editing.label}`}
          footer={
            <>
              <Button variant="secondary" onClick={closeModal} disabled={mutate.pending}>
                Cancel
              </Button>
              <Button icon={<Check className="size-4" />} loading={mutate.pending} onClick={() => void save()}>
                {editing === "new" ? "Create plan" : "Save changes"}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            {formError ? <Alert tone="danger">{formError}</Alert> : null}
            <Field label="Plan name" required>
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Growth"
                autoFocus
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Price (USD / month)" hint="Blank = custom">
                <Input
                  type="number"
                  min="0"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="Custom"
                />
              </Field>
              <Field label="Max clients" hint="Blank = unlimited">
                <Input
                  type="number"
                  min="0"
                  value={form.maxClients}
                  onChange={(e) => setForm({ ...form, maxClients: e.target.value })}
                  placeholder="Unlimited"
                />
              </Field>
              <Field label="Max staff seats" hint="Blank = unlimited">
                <Input
                  type="number"
                  min="0"
                  value={form.maxStaff}
                  onChange={(e) => setForm({ ...form, maxStaff: e.target.value })}
                  placeholder="Unlimited"
                />
              </Field>
            </div>
            <Field label="Short description" hint="Shown on the billing card">
              <Textarea
                rows={2}
                value={form.blurb}
                onChange={(e) => setForm({ ...form, blurb: e.target.value })}
                placeholder="Growing practices with several accountants."
              />
            </Field>
            <Checkbox
              label="Active — visible to company owners on their billing page"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            {editing !== "new" ? (
              <p className="text-[12px] text-muted">
                Plan key <span className="font-mono">{editing.key}</span> is fixed once created — firms are stored
                against it.
              </p>
            ) : null}
          </div>
        </Modal>
      ) : null}

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete plan"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)} disabled={mutate.pending}>
              Keep plan
            </Button>
            <Button
              variant="danger"
              icon={<Trash2 className="size-4" />}
              loading={mutate.pending}
              onClick={() => void confirmDelete()}
            >
              Delete
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {formError ? <Alert tone="danger">{formError}</Alert> : null}
          <p className="text-[13.5px] text-ink-soft">
            {deleting ? (
              <>
                Delete <strong className="font-semibold text-ink">{deleting.label}</strong>? If any firm is on this
                plan you&apos;ll be asked to move them first — deactivating instead keeps it out of the catalog
                without deleting it.
              </>
            ) : null}
          </p>
        </div>
      </Modal>
    </>
  );
}
