"use client";

import { UserPlus } from "lucide-react";
import { useState } from "react";

import { inviteParticipant } from "@/lib/calls-api";
import { Modal } from "@/components/ui";

import { CandidatePicker } from "./candidate-picker";

/**
 * Mid-call "add participant" (spec §21). Opens the same authorized-candidate
 * picker, then POSTs an invitation — the backend re-runs can_invite_to_call,
 * so a candidate list that's gone stale can never widen who gets pulled in.
 * `alreadyInCallProfileIds` hides people already present.
 */
export function InviteParticipant({
  callId,
  alreadyInCallProfileIds,
}: {
  callId: string;
  alreadyInCallProfileIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invite = async (ids: string[]) => {
    const id = ids[0];
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await inviteParticipant(callId, id);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not invite that person.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 py-2 text-sm text-white/80 hover:bg-white/10"
      >
        <UserPlus className="size-4" aria-hidden />
        Add participant
      </button>

      <Modal open={open} onClose={() => (busy ? undefined : setOpen(false))} title="Add to call" width="sm">
        {error ? <p className="mb-2 text-sm text-danger">{error}</p> : null}
        <CandidatePicker
          excludeProfileIds={alreadyInCallProfileIds}
          confirmLabel="Invite"
          onConfirm={(ids) => void invite(ids)}
        />
      </Modal>
    </>
  );
}
