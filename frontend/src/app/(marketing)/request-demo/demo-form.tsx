"use client";

import { ArrowRight, CircleCheck } from "lucide-react";
import { useState } from "react";

import { useToast } from "@/components/toast";
import { Button, Field, Input, Select, Textarea, toOptions } from "@/components/ui";
import { ApiError, publicPost } from "@/lib/api";

const TEAM_SIZES = [
  "Just me",
  "2–5 people",
  "6–15 people",
  "16–40 people",
  "More than 40",
];

interface Errors {
  name?: string;
  email?: string;
  firm?: string;
}

/**
 * Demo request form.
 *
 * Posts to the public lead-capture endpoint (`POST /api/v1/public/leads`,
 * unauthenticated, backed by `public.leads`). That schema has no `teamSize`
 * field, so it is folded into `message` alongside the free-text notes.
 */
export function DemoForm() {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  // The listbox isn't a native control, so it can't be read by FormData on its
  // own — it emits a hidden input under this name. The state is what the
  // trigger renders; `data.get("teamSize")` below still does the reading.
  const [teamSize, setTeamSize] = useState("");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const firm = String(data.get("firm") ?? "").trim();
    const phone = String(data.get("phone") ?? "").trim();
    const teamSize = String(data.get("teamSize") ?? "").trim();
    const notes = String(data.get("notes") ?? "").trim();

    const next: Errors = {};
    if (!name) next.name = "Tell us who we're meeting.";
    if (!email) next.email = "We need somewhere to send the invite.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) next.email = "That doesn't look like an email address.";
    if (!firm) next.firm = "Which practice is this for?";

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const message = [teamSize && `Team size: ${teamSize}`, notes].filter(Boolean).join("\n\n");

    setPending(true);
    try {
      await publicPost("/public/leads", {
        name,
        email,
        firm_name: firm,
        phone: phone || null,
        message: message || null,
        source: "request-demo",
      });
      setDone(true);
      toast.success("Demo request received", "We'll be in touch within one business day.");
    } catch (error) {
      const detail = error instanceof ApiError ? error.message : "Please try again in a moment.";
      toast.error("Couldn't send your request", detail);
    } finally {
      setPending(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-[var(--shadow-lift)]">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-brand-soft text-brand">
          <CircleCheck className="size-7" />
        </span>
        <h2 className="mt-5 text-xl font-bold text-ink">Thanks — that&apos;s booked in.</h2>
        <p className="mx-auto mt-3 max-w-sm text-[14.5px] leading-relaxed text-muted">
          We&apos;ll email you within one business day to find a time. If it&apos;s urgent, call us
          and we&apos;ll pick a slot on the spot.
        </p>
        <Button variant="secondary" className="mt-6" onClick={() => setDone(false)}>
          Send another request
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-lift)] sm:p-8"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" required error={errors.name}>
          <Input name="name" autoComplete="name" placeholder="Emily Carter" />
        </Field>
        <Field label="Work email" required error={errors.email}>
          <Input name="email" type="email" autoComplete="email" placeholder="you@firm.ca" />
        </Field>
        <Field label="Firm name" required error={errors.firm}>
          <Input name="firm" autoComplete="organization" placeholder="Harrison CPA" />
        </Field>
        <Field label="Phone">
          <Input name="phone" type="tel" autoComplete="tel" placeholder="+1 780 555 0142" />
        </Field>
      </div>

      <Field label="Team size" className="mt-4">
        <Select
          name="teamSize"
          value={teamSize}
          onValueChange={setTeamSize}
          placeholder="Select team size"
          options={toOptions(TEAM_SIZES)}
        />
      </Field>

      <Field label="What would you like to improve?" className="mt-4">
        <Textarea
          name="notes"
          rows={4}
          placeholder="Deadline tracking across 80 corporate year-ends, and getting engagement letters signed before the work starts."
        />
      </Field>

      <Button
        type="submit"
        size="lg"
        loading={pending}
        className="mt-6 w-full"
        trailingIcon={<ArrowRight className="size-4" />}
      >
        Request my demo
      </Button>

      <p className="mt-3 text-center text-[12.5px] text-muted">
        We use these details only to arrange your demo and respond to your enquiry.
      </p>
    </form>
  );
}
