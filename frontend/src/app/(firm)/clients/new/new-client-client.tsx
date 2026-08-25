"use client";

import {
  Building2,
  Mail,
  Plus,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CredentialsModal } from "@/components/dashboard/credentials-modal";
import { useToast } from "@/components/toast";
import { Button, Checkbox, Field, Input, Select, Textarea, toOptions } from "@/components/ui";
import { ApiError, post } from "@/lib/api";
import type { CustomField, TeamRow } from "@/lib/firm-demo";
import type { Client, CredentialResult, PortalInviteResult } from "@/lib/types";

interface ContactDraft {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
  isPrimary: boolean;
}

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "prospect", label: "Prospect" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archived" },
];

const PLAN_OPTIONS = toOptions(["Starter", "Professional", "Growth"]);

/**
 * The team list is demo rows when the API is unreachable, and those ids are
 * slugs rather than UUIDs — posting one back would 422. Only a real UUID is
 * sent as `owner_id`.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let contactSeq = 0;
function nextContactId() {
  contactSeq += 1;
  return `draft-${contactSeq}`;
}

export function NewClientClient({
  customFields,
  team,
}: {
  customFields: CustomField[];
  team: TeamRow[];
}) {
  const toast = useToast();
  const router = useRouter();

  const [businessName, setBusinessName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [status, setStatus] = useState("active");
  const [plan, setPlan] = useState("Starter");
  const [annualFee, setAnnualFee] = useState("0");
  const [ownerId, setOwnerId] = useState(team[0]?.id ?? "");

  const [primaryEmail, setPrimaryEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [businessNumber, setBusinessNumber] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("ON");
  const [fiscalYearEnd, setFiscalYearEnd] = useState("");
  const [mailingAddress, setMailingAddress] = useState("");

  const [contacts, setContacts] = useState<ContactDraft[]>([]);

  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [portalCredentials, setPortalCredentials] = useState<CredentialResult | null>(null);

  const addContact = () => {
    setContacts((current) => [
      ...current,
      {
        id: nextContactId(),
        fullName: "",
        email: "",
        phone: "",
        role: "",
        isPrimary: current.length === 0,
      },
    ]);
  };

  const updateContact = (id: string, patch: Partial<ContactDraft>) => {
    setContacts((current) =>
      current.map((contact) => (contact.id === id ? { ...contact, ...patch } : contact)),
    );
  };

  const removeContact = (id: string) => {
    setContacts((current) => current.filter((contact) => contact.id !== id));
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const trimmedName = businessName.trim();
    if (!trimmedName) {
      const message = "Business / trade name is required.";
      setError(message);
      toast.error("Could not add client", message);
      return;
    }

    const missingRequired = customFields.find(
      (field) => field.is_required && !customValues[field.id]?.trim(),
    );
    if (missingRequired) {
      // Previously this only set the inline red text below the form — easy to
      // miss on a long page, and unlike every other failure path here (which
      // all toast), it left a click on "Create client" looking like it did
      // nothing at all.
      const message = `"${missingRequired.label}" is required.`;
      setError(message);
      toast.error("Could not add client", message);
      return;
    }

    setError(null);
    setSubmitting(true);

    const willInvite = sendWelcomeEmail && Boolean(primaryEmail.trim());

    try {
      // Create the client for real, add its contacts, and — if checked — send
      // the portal welcome email.
      //
      // Only an *unreachable* API (ApiError.status === 0, i.e. demo mode with
      // no backend deployed) falls through to the demo acknowledgement. A real
      // rejection — duplicate code, validation failure, no permission — is
      // shown to the admin. Reporting a green "added" toast for a 422 used to
      // make a failed create indistinguishable from a successful one.
      const [, yearEndMonth, yearEndDay] = /^\d{4}-(\d{2})-(\d{2})/.exec(fiscalYearEnd) ?? [];
      const custom = Object.fromEntries(
        customFields
          .filter((field) => customValues[field.id]?.trim())
          .map((field) => [field.label, customValues[field.id]]),
      );

      const created = await post<Client>("/clients", {
        legal_name: legalName.trim() || trimmedName,
        business_name: trimmedName,
        status,
        email: primaryEmail.trim() || undefined,
        phone: telephone.trim() || undefined,
        business_number: businessNumber.trim() || undefined,
        city: city.trim() || undefined,
        province: province.trim() || undefined,
        address_line1: mailingAddress.trim() || undefined,
        year_end_month: yearEndMonth ? Number(yearEndMonth) : undefined,
        year_end_day: yearEndDay ? Number(yearEndDay) : undefined,
        annual_fee: Number(annualFee) || 0,
        // The plan lives in `tags` — there is no plan column; `lib/adapt.ts`
        // reads it back out of the same place.
        tags: plan ? [plan] : [],
        owner_id: UUID_RE.test(ownerId) ? ownerId : undefined,
        custom,
      });

      for (const contact of contacts) {
        if (!contact.fullName.trim()) continue;
        await post("/contacts", {
          client_id: created.id,
          full_name: contact.fullName.trim(),
          email: contact.email.trim() || undefined,
          phone: contact.phone.trim() || undefined,
          role: contact.role.trim() || undefined,
          is_primary: contact.isPrimary,
        });
      }

      let emailSent = false;
      if (willInvite) {
        const invite = await post<PortalInviteResult>(`/clients/${created.id}/portal-invite`);
        emailSent = invite.email_sent;
        if (!emailSent) {
          // Same reasoning as the client-detail page's invite flow: this
          // password is unrecoverable once hashed, and this page was about
          // to navigate away immediately after — guaranteed, not just
          // likely, to lose it. Hold the redirect until the modal closes.
          setPortalCredentials({
            profile_id: created.id,
            email: invite.email,
            full_name: trimmedName,
            role: "member",
            temp_password: invite.temp_password,
            login_url: invite.login_url,
            email_sent: invite.email_sent,
            message: invite.message,
          });
        }
      }

      toast.success(
        `${trimmedName} added`,
        willInvite
          ? emailSent
            ? "Client record created and the portal welcome email is on its way."
            : "Client record created — portal login ready, but email delivery isn't configured yet."
          : "Client record created — you'll find them in the client book.",
      );
      if (!willInvite || emailSent) router.push("/clients");
    } catch (caught) {
      const unreachable = caught instanceof ApiError && caught.status === 0;
      if (!unreachable) {
        const message =
          caught instanceof Error ? caught.message : "Something went wrong creating the client.";
        setError(message);
        toast.error("Could not add client", message);
        return;
      }
      // No backend deployed — demo mode. Acknowledge and move on.
      toast.info(
        `${trimmedName} added (demo)`,
        "No API is connected, so this record only exists in your browser.",
      );
      router.push("/clients");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Link
        href="/clients"
        className="text-[12.5px] font-medium text-brand transition hover:underline"
      >
        ← Back to clients
      </Link>

      <div className="mt-3 mb-6 flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
          <UserPlus className="size-5" />
        </span>
        <div>
          <h1 className="font-display text-[1.6rem] font-bold tracking-tight text-ink">
            Add client
          </h1>
          <p className="mt-0.5 text-[14px] text-muted">
            Create a new client record and optionally invite them to the portal.
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        <Section
          icon={<Building2 className="size-4.5" />}
          title="Business details"
          description="Legal identity and engagement summary."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business / trade name" required>
              <Input
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
                placeholder="Maple Retail Co."
                autoFocus
              />
            </Field>
            <Field label="Legal name">
              <Input
                value={legalName}
                onChange={(event) => setLegalName(event.target.value)}
                placeholder="Maple Retail Co. Inc."
              />
            </Field>
            <Field label="Status">
              <Select value={status} onValueChange={setStatus} options={STATUS_OPTIONS} />
            </Field>
            <Field label="Plan">
              <Select value={plan} onValueChange={setPlan} options={PLAN_OPTIONS} />
            </Field>
            <Field label="Annual fee ($)" hint="Shown on the client list as a monthly figure.">
              <Input
                type="number"
                min={0}
                step={100}
                value={annualFee}
                onChange={(event) => setAnnualFee(event.target.value)}
              />
            </Field>
            <Field label="Assigned accountant / manager">
              <Select
                value={ownerId}
                onValueChange={setOwnerId}
                placeholder="Unassigned"
                options={[
                  { value: "", label: "Unassigned" },
                  ...team.map((member) => ({
                    value: member.id,
                    label: member.full_name,
                    description: member.email,
                  })),
                ]}
              />
            </Field>
          </div>
        </Section>

        <Section
          icon={<Mail className="size-4.5" />}
          title="Contact & compliance"
          description="Details staff can pull up while working a file, plus the fiscal year-end that drives year-end reminders."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Primary email">
              <Input
                type="email"
                value={primaryEmail}
                onChange={(event) => setPrimaryEmail(event.target.value)}
                placeholder="accounts@company.ca"
              />
            </Field>
            <Field label="Telephone">
              <Input
                value={telephone}
                onChange={(event) => setTelephone(event.target.value)}
                placeholder="+1 (416) 555-0142"
              />
            </Field>
            <Field label="Business number">
              <Input
                value={businessNumber}
                onChange={(event) => setBusinessNumber(event.target.value)}
                placeholder="80112 3345 RC0001"
              />
            </Field>
            <Field label="City">
              <Input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Toronto" />
            </Field>
            <Field label="Province">
              <Input
                value={province}
                onChange={(event) => setProvince(event.target.value.toUpperCase().slice(0, 2))}
                placeholder="ON"
              />
            </Field>
            <Field label="Fiscal year-end" hint="Only the month and day drive filing deadlines.">
              <Input
                type="date"
                value={fiscalYearEnd}
                onChange={(event) => setFiscalYearEnd(event.target.value)}
              />
            </Field>
            <Field label="Mailing address" className="sm:col-span-2">
              <Textarea
                value={mailingAddress}
                onChange={(event) => setMailingAddress(event.target.value)}
                placeholder="123 King St W, Toronto, ON M5H 1A1"
                rows={2}
              />
            </Field>
          </div>
        </Section>

        <Section
          icon={<Users className="size-4.5" />}
          title="Key contacts"
          description="Officers and contacts — President, VP, controller, etc."
          action={
            <Button type="button" size="sm" variant="secondary" icon={<Plus className="size-3.5" />} onClick={addContact}>
              Add contact
            </Button>
          }
        >
          {contacts.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted">
              No contacts yet. Add the people you deal with at this client.
            </p>
          ) : (
            <div className="space-y-3">
              {contacts.map((contact, index) => (
                <div
                  key={contact.id}
                  className="grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-[1.2fr_1.2fr_1fr_1fr_auto]"
                >
                  <Input
                    value={contact.fullName}
                    onChange={(event) => updateContact(contact.id, { fullName: event.target.value })}
                    placeholder={`Contact ${index + 1} name`}
                    aria-label="Full name"
                  />
                  <Input
                    type="email"
                    value={contact.email}
                    onChange={(event) => updateContact(contact.id, { email: event.target.value })}
                    placeholder="Email"
                    aria-label="Email"
                  />
                  <Input
                    value={contact.phone}
                    onChange={(event) => updateContact(contact.id, { phone: event.target.value })}
                    placeholder="Phone"
                    aria-label="Phone"
                  />
                  <Input
                    value={contact.role}
                    onChange={(event) => updateContact(contact.id, { role: event.target.value })}
                    placeholder="Role"
                    aria-label="Role"
                  />
                  <button
                    type="button"
                    onClick={() => removeContact(contact.id)}
                    className="grid size-9.5 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-danger-soft hover:text-danger"
                    aria-label="Remove contact"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section
          icon={<ShieldCheck className="size-4.5" />}
          title="Additional information"
          description="Custom fields configured by your firm in Client settings."
        >
          {customFields.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted">
              No custom fields configured yet.{" "}
              <Link href="/clients/settings" className="font-medium text-brand hover:underline">
                Add one in Client settings
              </Link>
              .
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {customFields.map((field) => (
                <CustomFieldInput
                  key={field.id}
                  field={field}
                  value={customValues[field.id] ?? ""}
                  onChange={(value) =>
                    setCustomValues((current) => ({ ...current, [field.id]: value }))
                  }
                />
              ))}
            </div>
          )}
        </Section>

        <Section
          icon={<Mail className="size-4.5" />}
          title="Portal access"
          description="Onboard this client to their secure dashboard as soon as they're created."
        >
          <Checkbox
            label={
              <>
                Send a branded welcome email with portal access
                {!primaryEmail ? (
                  <span className="mt-0.5 block text-[12px] text-muted">
                    Add a primary email above to enable the welcome email.
                  </span>
                ) : null}
              </>
            }
            checked={sendWelcomeEmail}
            disabled={!primaryEmail}
            onChange={(event) => setSendWelcomeEmail(event.target.checked)}
          />
        </Section>

        {error ? (
          <p role="alert" className="text-[13px] font-medium text-danger">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2 pb-2">
          <Button type="button" variant="secondary" disabled={submitting} onClick={() => router.push("/clients")}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Create client
          </Button>
        </div>
      </form>

      <CredentialsModal
        result={portalCredentials}
        onClose={() => {
          setPortalCredentials(null);
          router.push("/clients");
        }}
        kind="client portal"
      />
    </>
  );
}

function Section({
  icon,
  title,
  description,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-soft">
            {icon}
          </span>
          <div>
            <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
            <p className="mt-0.5 text-[13px] text-muted">{description}</p>
          </div>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function CustomFieldInput({
  field,
  value,
  onChange,
}: {
  field: CustomField;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.field_type === "checkbox") {
    return (
      <Checkbox
        label={
          <>
            {field.label}
            {field.is_required ? <span className="ml-0.5 text-danger">*</span> : null}
          </>
        }
        checked={value === "true"}
        onChange={(event) => onChange(event.target.checked ? "true" : "")}
      />
    );
  }

  return (
    <Field label={field.label} required={field.is_required} hint={field.help_text}>
      {field.field_type === "select" ? (
        <Select value={value} onValueChange={onChange} options={toOptions(field.options)} />
      ) : (
        <Input
          type={field.field_type === "date" ? "date" : field.field_type === "number" ? "number" : "text"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}
