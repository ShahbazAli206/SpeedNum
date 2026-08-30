"use client";

import { ArrowLeft, CircleCheck } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { DashboardHeader } from "@/components/dashboard/page-shell";
import { ExportMenu } from "@/components/engagement/export-menu";
import { LetterDocument } from "@/components/engagement/letter-document";
import { SignaturePad } from "@/components/engagement/signature-pad";
import { Button, Checkbox, Field, Input } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { declineMyEngagement, signMyEngagement } from "@/lib/client-engagements";
import type { PortalLetter } from "@/lib/types";

export function EngagementSignClient({ id, initialLetter }: { id: string; initialLetter: PortalLetter }) {
  const [letter, setLetter] = useState(initialLetter);

  const [signature, setSignature] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [signerTitle, setSignerTitle] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [signing, setSigning] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const documentRef = useRef<HTMLDivElement>(null);

  const canSign = Boolean(signature && signerName.trim() && agreed);

  const accept = async () => {
    if (!canSign) return;
    setSigning(true);
    setActionError(null);
    try {
      const updated = await signMyEngagement(id, {
        signer_name: signerName.trim(),
        signer_title: signerTitle.trim() || null,
        signature_data: signature!,
        agreed: true,
      });
      setLetter(updated);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSigning(false);
    }
  };

  const decline = async () => {
    const reason = window.prompt("Optional: let your accountant know why you're declining.") ?? undefined;
    setDeclining(true);
    setActionError(null);
    try {
      const updated = await declineMyEngagement(id, { reason });
      setLetter(updated);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setDeclining(false);
    }
  };

  const signable = letter.status === "sent" || letter.status === "viewed" || letter.status === "declined";

  return (
    <>
      <Link
        href="/dashboard/engagements"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted transition hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        Back to agreements
      </Link>

      <DashboardHeader title={letter.title} subtitle={`From ${letter.brand.firm_name}`} />

      <div className="mx-auto max-w-3xl space-y-5">
        <div ref={documentRef}>
          <LetterDocument firmName={letter.brand.firm_name} firmLogoUrl={letter.brand.logo_url} letter={letter} />
        </div>

        {letter.status === "signed" ? (
          <section className="rounded-xl border border-line bg-surface p-5 text-center shadow-card">
            <CircleCheck className="mx-auto size-8 text-success" />
            <p className="mt-2 text-[14px] font-semibold text-ink">You&apos;ve signed this agreement</p>
            <p className="mt-0.5 text-[13px] text-muted">Keep a copy for your records.</p>
            <div className="mt-4 flex justify-center">
              <ExportMenu
                letter={letter}
                firmName={letter.brand.firm_name}
                firmLogoUrl={letter.brand.logo_url}
                filenameHint={`${letter.title}-${letter.client_name}`}
                documentRef={documentRef}
              />
            </div>
          </section>
        ) : signable ? (
          <section className="rounded-xl border border-line bg-surface p-5 shadow-card">
            <h2 className="text-[15px] font-semibold text-ink">Sign to accept</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              By accepting, you agree to the scope, fees and terms set out above.
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Your full name" required>
                <Input value={signerName} onChange={(event) => setSignerName(event.target.value)} placeholder="Jane Smith" />
              </Field>
              <Field label="Title (optional)">
                <Input value={signerTitle} onChange={(event) => setSignerTitle(event.target.value)} placeholder="e.g. Owner" />
              </Field>
            </div>

            <div className="mt-4">
              <SignaturePad value={signature} onChange={setSignature} label="Your signature" />
            </div>

            <div className="mt-4">
              <Checkbox
                label="I have read and agree to the scope, fees and terms above."
                checked={agreed}
                onChange={(event) => setAgreed(event.target.checked)}
              />
            </div>

            {actionError ? <p className="mt-3 text-[13px] font-medium text-danger">{actionError}</p> : null}

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button disabled={!canSign} loading={signing} onClick={accept}>
                Accept & e-sign
              </Button>
              <Button variant="ghost" loading={declining} onClick={decline}>
                Decline
              </Button>
            </div>
          </section>
        ) : (
          <section className="rounded-xl border border-line bg-surface p-5 text-center shadow-card">
            <p className="text-[14px] text-muted">This letter isn&apos;t available for signature right now.</p>
          </section>
        )}
      </div>
    </>
  );
}
