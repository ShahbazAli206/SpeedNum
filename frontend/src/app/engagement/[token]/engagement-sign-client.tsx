"use client";

import { CircleCheck, CircleX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ExportMenu } from "@/components/engagement/export-menu";
import { LetterDocument } from "@/components/engagement/letter-document";
import { SignaturePad } from "@/components/engagement/signature-pad";
import { Button, Checkbox, Field, Input, LoadingBlock } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { declinePortalLetter, getPortalLetter, signPortalLetter } from "@/lib/engagements";
import type { PortalLetter } from "@/lib/types";

export function EngagementSignClient({ token }: { token: string }) {
  const [letter, setLetter] = useState<PortalLetter | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [signature, setSignature] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [signerTitle, setSignerTitle] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [signing, setSigning] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const documentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    getPortalLetter(token)
      .then((data) => {
        if (!cancelled) setLetter(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : "This link could not be opened.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const canSign = Boolean(signature && signerName.trim() && agreed);

  const accept = async () => {
    if (!canSign) return;
    setSigning(true);
    setActionError(null);
    try {
      const updated = await signPortalLetter(token, {
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
    const reason = window.prompt("Optional: let the firm know why you're declining.") ?? undefined;
    setDeclining(true);
    setActionError(null);
    try {
      const updated = await declinePortalLetter(token, { reason });
      setLetter(updated);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setDeclining(false);
    }
  };

  if (loadError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-12">
        <div className="max-w-sm rounded-xl border border-line bg-surface p-6 text-center shadow-[var(--shadow-card)]">
          <CircleX className="mx-auto size-8 text-danger" />
          <p className="mt-3 text-[14px] font-medium text-ink">{loadError}</p>
        </div>
      </main>
    );
  }

  if (!letter) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-12">
        <LoadingBlock label="Loading your engagement letter…" />
      </main>
    );
  }

  const signable = letter.status === "sent" || letter.status === "viewed" || letter.status === "declined";

  return (
    <main className="min-h-screen bg-canvas px-5 py-10">
      <div className="mx-auto max-w-3xl space-y-5">
        <div ref={documentRef}>
          <LetterDocument firmName={letter.brand.firm_name} firmLogoUrl={letter.brand.logo_url} letter={letter} />
        </div>

        {letter.status === "signed" ? (
          <section className="rounded-xl border border-line bg-surface p-5 text-center shadow-[var(--shadow-card)]">
            <CircleCheck className="mx-auto size-8 text-success" />
            <p className="mt-2 text-[14px] font-semibold text-ink">You&apos;ve signed this engagement letter</p>
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
        ) : letter.status === "void" ? (
          <section className="rounded-xl border border-line bg-surface p-5 text-center shadow-[var(--shadow-card)]">
            <p className="text-[14px] font-medium text-ink">This letter has been withdrawn by the firm.</p>
          </section>
        ) : signable ? (
          <section className="rounded-xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
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
                Accept & e-sign engagement
              </Button>
              <Button variant="ghost" loading={declining} onClick={decline}>
                Decline
              </Button>
            </div>
            <p className="mt-3 text-[12px] text-muted">Questions? Reply to the email that sent you this letter.</p>
          </section>
        ) : (
          <section className="rounded-xl border border-line bg-surface p-5 text-center shadow-[var(--shadow-card)]">
            <p className="text-[14px] text-muted">This letter isn&apos;t available for signature right now.</p>
          </section>
        )}
      </div>
    </main>
  );
}
