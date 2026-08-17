"use strict";

/**
 * The core VPS -> desktop sync loop. One sync run:
 *
 *   list snapshots -> pick the latest "ready" one not yet fully local
 *     -> for each component: presigned URL -> download to a *temp* path,
 *        verifying its sha256 against the manifest as it streams
 *        -> encrypt the verified plaintext into the real backup directory
 *        -> delete the temp plaintext
 *     -> once every component is down and verified: ack-download
 *
 * Atomicity/safety properties this relies on:
 *   - A snapshot's final directory is only ever written to once, for one
 *     snapshot id — nothing here ever overwrites an already-completed
 *     backup, so a later failed sync can't corrupt an earlier good one
 *     (Section 15/20's "never overwrite a valid backup with a failed one").
 *   - Downloads land in `<dir>.partial` and only get renamed to the real
 *     directory name after every component is verified+encrypted — a crash
 *     mid-download leaves an orphaned `.partial` directory, never a
 *     half-finished backup masquerading as complete.
 *   - Plaintext never touches disk outside the `.partial` staging
 *     directory, and is deleted the moment its encrypted copy exists.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const backupClient = require("./backup-client");
const cryptoEnvelope = require("./crypto-envelope");
const syncState = require("./sync-state");

const COMPONENTS = ["config", "storage_index", "postgres_dump", "storage_delta"];

async function runSync({ baseUrl, accessToken, deviceId, backupPassword, backupsDir, statePath, log = () => {} }) {
  const state = await syncState.load(statePath);
  state.lastSyncStartedAt = new Date().toISOString();
  await syncState.save(statePath, state);

  try {
    const snapshots = await backupClient.listSnapshots({ baseUrl, accessToken });
    const ready = snapshots.filter((s) => s.status === "ready");
    if (ready.length === 0) {
      state.lastSyncStatus = "ok";
      state.lastSyncCompletedAt = new Date().toISOString();
      state.lastSyncError = null;
      await syncState.save(statePath, state);
      return { ok: true, message: "No ready snapshots on the server yet." };
    }

    const latest = ready.reduce((a, b) => (a.sequence > b.sequence ? a : b));
    const alreadyDone = state.snapshots[latest.id]?.completedAt;
    if (alreadyDone) {
      state.lastSyncStatus = "ok";
      state.lastSyncCompletedAt = new Date().toISOString();
      state.lastSyncSnapshotId = latest.id;
      state.lastSyncSnapshotSequence = latest.sequence;
      await syncState.save(statePath, state);
      return { ok: true, message: `Snapshot #${latest.sequence} already downloaded.`, snapshotId: latest.id };
    }

    log(`Syncing snapshot #${latest.sequence} (${latest.id})...`);
    const manifest = await backupClient.getManifest({ baseUrl, accessToken, snapshotId: latest.id });

    const finalDir = path.join(backupsDir, latest.id);
    const stagingDir = `${finalDir}.partial`;
    await fs.promises.rm(stagingDir, { recursive: true, force: true });
    await fs.promises.mkdir(stagingDir, { recursive: true });

    const encryptedFiles = {};
    for (const component of COMPONENTS) {
      const manifestEntry = manifest.components?.[component];
      log(`  downloading ${component}...`);
      const { url } = await backupClient.getDownloadUrl({
        baseUrl,
        accessToken,
        snapshotId: latest.id,
        component,
        deviceId,
      });
      const plainPath = path.join(stagingDir, `${component}.plain`);
      await backupClient.downloadToFile({
        url,
        destPath: plainPath,
        expectedSha256: manifestEntry?.sha256,
      });

      const encPath = path.join(stagingDir, `${component}.snbk`);
      await cryptoEnvelope.encryptFile(plainPath, encPath, backupPassword);
      await fs.promises.rm(plainPath, { force: true }); // plaintext never survives past this point
      encryptedFiles[component] = path.relative(backupsDir, encPath);
    }

    // Every component verified and encrypted — now it's safe to publish
    // this snapshot's directory under its real name.
    await fs.promises.rm(finalDir, { recursive: true, force: true });
    await fs.promises.rename(stagingDir, finalDir);
    const renamedFiles = Object.fromEntries(
      Object.entries(encryptedFiles).map(([component, relPath]) => [
        component,
        relPath.replace(`${latest.id}.partial`, latest.id),
      ]),
    );

    await backupClient.ackDownload({ baseUrl, accessToken, snapshotId: latest.id, deviceId });

    state.snapshots[latest.id] = {
      sequence: latest.sequence,
      completedAt: new Date().toISOString(),
      encryptedFiles: renamedFiles,
      tenantsCount: latest.tenants_count,
      clientsCount: latest.clients_count,
      documentsCount: latest.documents_count,
      storageObjectsCount: latest.storage_objects_count,
      storageBytesTotal: latest.storage_bytes_total,
    };
    state.lastSyncStatus = "ok";
    state.lastSyncCompletedAt = new Date().toISOString();
    state.lastSyncError = null;
    state.lastSyncSnapshotId = latest.id;
    state.lastSyncSnapshotSequence = latest.sequence;
    await syncState.save(statePath, state);

    log(`Snapshot #${latest.sequence} fully synced and encrypted locally.`);
    return { ok: true, snapshotId: latest.id, sequence: latest.sequence };
  } catch (err) {
    // A failed sync updates its own status/error but never touches
    // `state.snapshots` for any prior, already-completed entry — whatever
    // was good before this run stays exactly as good after it.
    state.lastSyncStatus = "failed";
    state.lastSyncError = err.message;
    state.lastSyncCompletedAt = new Date().toISOString();
    await syncState.save(statePath, state);
    throw err;
  }
}

function scheduleSync(fn, intervalMinutes) {
  const ms = Math.max(1, intervalMinutes) * 60 * 1000;
  const timer = setInterval(() => {
    fn().catch(() => {
      /* runSync already records the failure in state; the scheduler
         just must not crash the process over a single missed sync. */
    });
  }, ms);
  return () => clearInterval(timer);
}

module.exports = { runSync, scheduleSync, COMPONENTS };
