"use client";

/**
 * End-to-end encryption wiring for calls (spec §26, §33.10).
 *
 * ⚠️ STATUS: SCAFFOLDING, OFF BY DEFAULT, NOT INDEPENDENTLY VERIFIED. ⚠️
 *
 * This module builds LiveKit's insertable-streams E2EE (an
 * `ExternalE2EEKeyProvider` + the SDK's E2EE Web Worker) and can enable it on
 * a Room. What it deliberately does NOT do — and what the spec (§26) says must
 * exist and be *tested* before anything may be called "end-to-end encrypted" —
 * is solve KEY DISTRIBUTION: how every participant obtains the same passphrase
 * without the server ever seeing it. Until that is designed and tested, E2EE
 * is not wired into the call flow (no caller passes a passphrase), and no UI
 * claims calls are end-to-end encrypted. Media is still DTLS-SRTP encrypted in
 * transit by WebRTC regardless — but that is hop-by-hop through the SFU, which
 * is NOT E2EE. See VIDEO_CALL_E2EE.md for the threat model and the open
 * problem.
 *
 * This is imported dynamically (only when a passphrase is actually supplied)
 * so the E2EE worker is never bundled into the default, non-E2EE call path.
 */

import { ExternalE2EEKeyProvider, type E2EEOptions } from "livekit-client";

export interface E2EEBundle {
  options: E2EEOptions;
  keyProvider: ExternalE2EEKeyProvider;
}

/**
 * Build the E2EE key provider + worker and set the shared passphrase.
 * Returns the `e2ee` RoomOptions value and the key provider (kept so the
 * passphrase can be ratcheted/rotated later). The caller must still call
 * `room.setE2EEEnabled(true)` after connecting.
 *
 * `passphrase` is a shared secret. Where it comes from is the unsolved
 * distribution problem above — a server-delivered passphrase would mean the
 * server can decrypt, i.e. it would NOT be true E2EE.
 */
export async function buildE2EE(passphrase: string): Promise<E2EEBundle> {
  const keyProvider = new ExternalE2EEKeyProvider();
  await keyProvider.setKey(passphrase);
  const worker = new Worker(new URL("livekit-client/e2ee-worker", import.meta.url));
  return { options: { keyProvider, worker }, keyProvider };
}
