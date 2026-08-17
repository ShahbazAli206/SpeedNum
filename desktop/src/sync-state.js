"use strict";

/**
 * Local sync/backup state, persisted as one JSON file. Every write is
 * atomic (write to a temp file, then rename over the real one) so a crash
 * or power loss mid-write can never leave a half-written, corrupt state
 * file behind — the rename is what the filesystem guarantees atomically,
 * the write itself is not.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function defaultState() {
  return {
    version: 1,
    lastSyncStartedAt: null,
    lastSyncCompletedAt: null,
    lastSyncStatus: null, // "ok" | "failed" | "partial"
    lastSyncError: null,
    lastSyncSnapshotId: null,
    lastSyncSnapshotSequence: null,
    syncIntervalMinutes: 60,
    snapshots: {}, // snapshotId -> { sequence, downloadedAt, sizeBytes, sha256Verified, encryptedPaths, drill: {...} }
  };
}

async function load(statePath) {
  try {
    const raw = await fs.promises.readFile(statePath, "utf8");
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch (err) {
    if (err.code === "ENOENT") return defaultState();
    throw err;
  }
}

async function save(statePath, state) {
  await fs.promises.mkdir(path.dirname(statePath), { recursive: true });
  const tmpPath = `${statePath}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  await fs.promises.writeFile(tmpPath, JSON.stringify(state, null, 2), "utf8");
  await fs.promises.rename(tmpPath, statePath); // atomic on the same filesystem
  return state;
}

module.exports = { defaultState, load, save };
