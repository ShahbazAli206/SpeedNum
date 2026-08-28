"use client";

import { Pencil, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { Button, Checkbox, Field, Input, Modal } from "@/components/ui";
import type { PermissionInfo, PermissionKey, RoleRow } from "@/lib/types";

export interface RoleFormValues {
  name: string;
  description: string;
  permissions: Record<PermissionKey, boolean>;
}

function emptyGrants(catalog: PermissionInfo[]): Record<PermissionKey, boolean> {
  return Object.fromEntries(catalog.map((p) => [p.key, false])) as Record<PermissionKey, boolean>;
}

/** Add/edit modal for a tenant-defined role — the free-form name and its
 * per-permission grants (app/permissions.PERMISSION_CATALOG). */
export function RoleModal({
  open,
  onClose,
  initial,
  catalog,
  onSubmit,
  pending = false,
}: {
  open: boolean;
  onClose: () => void;
  /** Omit (or null) to create a new role; pass current values to edit in place. */
  initial?: RoleRow | null;
  catalog: PermissionInfo[];
  onSubmit: (values: RoleFormValues) => void;
  pending?: boolean;
}) {
  const isEdit = Boolean(initial);
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [grants, setGrants] = useState<Record<PermissionKey, boolean>>(
    { ...emptyGrants(catalog), ...(initial?.permissions ?? {}) } as Record<PermissionKey, boolean>,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(initial?.name ?? "");
    setDescription(initial?.description ?? "");
    setGrants({ ...emptyGrants(catalog), ...(initial?.permissions ?? {}) } as Record<PermissionKey, boolean>);
    setError(null);
  }, [open, initial, catalog]);

  const toggle = (key: PermissionKey) =>
    setGrants((current) => ({ ...current, [key]: !current[key] }));

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("A role name is required.");
      return;
    }
    onSubmit({ name: trimmed, description: description.trim(), permissions: grants });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit role" : "New role"}
      description="Name it whatever fits your firm — Clerk Admin, Junior Bookkeeper, anything. Toggle what it can see or do below."
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            icon={isEdit ? <Pencil className="size-4" /> : <Plus className="size-4" />}
            onClick={submit}
            loading={pending}
          >
            {isEdit ? "Save changes" : "Create role"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role name" required error={error}>
            <Input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              placeholder="Clerk Admin"
              autoFocus
            />
          </Field>
          <Field label="Description" hint="Shown to the owner when assigning staff to this role.">
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Handles intake and document collection"
            />
          </Field>
        </div>

        <div>
          <p className="mb-2 text-[12.5px] font-semibold uppercase tracking-wide text-muted">
            Permissions
          </p>
          <div className="space-y-3 rounded-lg border border-line bg-surface-2/50 p-4">
            {catalog.length === 0 ? (
              <p className="text-[13px] text-muted">
                Permission catalogue unavailable right now — connect the API to configure this
                role&rsquo;s access.
              </p>
            ) : (
              catalog.map((permission) => (
                <Checkbox
                  key={permission.key}
                  checked={grants[permission.key] ?? false}
                  onChange={() => toggle(permission.key)}
                  label={
                    <span>
                      <span className="block font-medium text-ink">{permission.label}</span>
                      <span className="block text-[12px] text-muted">{permission.description}</span>
                    </span>
                  }
                />
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
