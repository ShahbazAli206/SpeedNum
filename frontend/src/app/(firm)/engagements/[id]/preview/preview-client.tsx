"use client";

import { Download, FileSignature } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { LetterDocument } from "@/components/engagement/letter-document";
import { downloadLetterPdf } from "@/components/engagement/letter-pdf";
import { SignaturePad } from "@/components/engagement/signature-pad";
import { useToast } from "@/components/toast";
import { Button, Field, Input } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { firmSignEngagement } from "@/lib/engagements";
import type { Letter } from "@/lib/types";

export function EngagementPreviewClient({
  initialLetter,
  firmName,
  firmLogoUrl,
}: {
  initialLetter: Letter;
  firmName: string;
  firmLogoUrl: string | null;
}) {
  const toast = useToast();
  const [letter, setLetter] = useState(initialLetter);
  const [downloading, setDownloading] = useState(false);

  const [signature, setSignature] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [signerTitle, setSignerTitle] = useState("");
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyFirmSignature = async () => {
    if (!signature || !signerName.trim()) return;
    setSigning(true);
    setError(null);
    try {
      const updated = await firmSignEngagement(letter.id, {
        signer_name: signerName.trim(),
        signer_title: signerTitle.trim() || null,
        signature_data: signature,
      });
      setLetter(updated);
      toast.success("Firm signature applied");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSigning(false);
    }
  };

  const download = async () => {
    setDownloading(true);
    try {
      await downloadLetterPdf({
        firmName,
        firmLogoUrl,
        letter,
        filenameHint: `${letter.title}-${letter.client_name ?? "client"}`,
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link href={`/engagements/${letter.id}`} className="text-[12.5px] font-medium text-brand hover:underline">
          ← Back to engagement
        </Link>
        <Button icon={<Download className="size-4" />} loading={downloading} onClick={download}>
          Download PDF
        </Button>
      </div>

      <LetterDocument
        firmName={firmName}
        firmLogoUrl={firmLogoUrl}
        letter={letter}
        firmSignatureSlot={
          !letter.firm_signature_data ? (
            <div className="w-full max-w-xs space-y-2 text-left">
              <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted">
                <FileSignature className="size-3.5" /> Not yet signed
              </p>
              <Field label="Signer name">
                <Input value={signerName} onChange={(event) => setSignerName(event.target.value)} placeholder="Your full name" />
              </Field>
              <Field label="Signer title">
                <Input value={signerTitle} onChange={(event) => setSignerTitle(event.target.value)} placeholder="Title (optional)" />
              </Field>
              <SignaturePad value={signature} onChange={setSignature} label="Firm signature" />
              {error ? <p className="text-[12px] text-danger">{error}</p> : null}
              <Button size="sm" disabled={!signature || !signerName.trim()} loading={signing} onClick={applyFirmSignature}>
                Apply firm signature
              </Button>
            </div>
          ) : undefined
        }
      />
    </div>
  );
}
