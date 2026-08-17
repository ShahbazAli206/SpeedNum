"use strict";

/**
 * Exercises the full sync pipeline (list -> manifest -> download -> encrypt
 * -> ack) against a fake HTTP layer standing in for the real FastAPI
 * backend — this proves the *orchestration* logic (staging directories,
 * atomic rename, checksum verification, state persistence, idempotent
 * re-sync) without needing a live server. The real backend contract itself
 * (exact endpoint shapes) was read directly from
 * backend/app/routers/admin_backups.py and backup_snapshots.py to build
 * this fixture, and is exercised for real in the live VPS test recorded in
 * the 2026-08-17 session report.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const { runSync } = require("../src/sync");
const cryptoEnvelope = require("../src/crypto-envelope");
const syncState = require("../src/sync-state");

const SNAPSHOT_ID = "11111111-1111-1111-1111-111111111111";
const COMPONENT_BYTES = {
  config: Buffer.from('{"tenant":"qa"}'),
  storage_index: Buffer.from('{"objects":[]}'),
  postgres_dump: Buffer.from("fake pg_dump gzip bytes"),
  storage_delta: Buffer.from("fake tar.gz bytes"),
};

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function manifestFor(sequence) {
  const components = {};
  for (const [name, buf] of Object.entries(COMPONENT_BYTES)) {
    components[name] = { object_key: `${SNAPSHOT_ID}/${name}`, size_bytes: buf.length, sha256: sha256(buf) };
  }
  return { manifest_version: 1, snapshot_id: SNAPSHOT_ID, sequence, components, counts: {} };
}

function fakeBackend({ ackCalls, downloadUrlCalls }) {
  return async (url) => {
    const u = new URL(url);
    if (u.pathname.endsWith("/admin/backups")) {
      return jsonResponse([
        {
          id: SNAPSHOT_ID,
          sequence: 7,
          status: "ready",
          tenants_count: 1,
          clients_count: 2,
          documents_count: 0,
          storage_objects_count: 0,
          storage_bytes_total: 0,
        },
      ]);
    }
    if (u.pathname === `/api/v1/admin/backups/${SNAPSHOT_ID}`) {
      return jsonResponse(manifestFor(7));
    }
    if (u.pathname.endsWith("/download-url")) {
      const component = u.searchParams.get("component");
      downloadUrlCalls.push(component);
      return jsonResponse({ url: `https://fake-minio.example/${component}`, expires_in: 3600 });
    }
    if (u.pathname.endsWith("/ack-download")) {
      ackCalls.push(true);
      return jsonResponse({ ok: true });
    }
    if (u.hostname === "fake-minio.example") {
      const component = u.pathname.replace("/", "");
      return new Response(COMPONENT_BYTES[component], { status: 200 });
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  };
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

test("a full sync downloads, verifies, and encrypts every component, then acks", async (t) => {
  const backupsDir = fs.mkdtempSync(path.join(os.tmpdir(), "snbk-sync-"));
  const statePath = path.join(backupsDir, "state.json");
  const ackCalls = [];
  const downloadUrlCalls = [];

  const originalFetch = global.fetch;
  global.fetch = fakeBackend({ ackCalls, downloadUrlCalls });
  t.after(() => {
    global.fetch = originalFetch;
    fs.rmSync(backupsDir, { recursive: true, force: true });
  });

  const result = await runSync({
    baseUrl: "https://backend.invalid",
    accessToken: "test-token",
    backupPassword: "correct horse battery staple",
    backupsDir,
    statePath,
  });

  assert.equal(result.ok, true);
  assert.equal(result.sequence, 7);
  assert.equal(ackCalls.length, 1);
  assert.deepEqual(downloadUrlCalls.sort(), ["config", "postgres_dump", "storage_delta", "storage_index"].sort());

  // Every component landed encrypted, decrypts back to exactly the
  // original bytes, and no plaintext .plain files were left behind.
  const finalDir = path.join(backupsDir, SNAPSHOT_ID);
  for (const [name, expected] of Object.entries(COMPONENT_BYTES)) {
    const encPath = path.join(finalDir, `${name}.snbk`);
    assert.ok(fs.existsSync(encPath), `${name}.snbk should exist`);
    const decPath = path.join(finalDir, `${name}.dec`);
    await cryptoEnvelope.decryptFile(encPath, decPath, "correct horse battery staple");
    assert.ok(fs.readFileSync(decPath).equals(expected));
    assert.ok(!fs.existsSync(path.join(finalDir, `${name}.plain`)), "plaintext must not survive");
  }
  assert.ok(!fs.existsSync(`${finalDir}.partial`), "staging dir must be renamed away, not left behind");

  const state = await syncState.load(statePath);
  assert.equal(state.lastSyncStatus, "ok");
  assert.equal(state.snapshots[SNAPSHOT_ID].sequence, 7);
});

test("re-syncing when the latest snapshot is already downloaded is a no-op (idempotent)", async (t) => {
  const backupsDir = fs.mkdtempSync(path.join(os.tmpdir(), "snbk-sync-"));
  const statePath = path.join(backupsDir, "state.json");
  const downloadUrlCalls = [];
  const ackCalls = [];

  const originalFetch = global.fetch;
  global.fetch = fakeBackend({ ackCalls, downloadUrlCalls });
  t.after(() => {
    global.fetch = originalFetch;
    fs.rmSync(backupsDir, { recursive: true, force: true });
  });

  const opts = {
    baseUrl: "https://backend.invalid",
    accessToken: "test-token",
    backupPassword: "pw",
    backupsDir,
    statePath,
  };
  await runSync(opts);
  assert.equal(downloadUrlCalls.length, 4);

  downloadUrlCalls.length = 0;
  ackCalls.length = 0;
  const second = await runSync(opts);

  assert.equal(second.ok, true);
  assert.equal(downloadUrlCalls.length, 0, "no re-download of an already-complete snapshot");
  assert.equal(ackCalls.length, 0, "no redundant ack either");
});

test("a checksum mismatch fails the sync and never publishes a corrupt snapshot directory", async (t) => {
  const backupsDir = fs.mkdtempSync(path.join(os.tmpdir(), "snbk-sync-"));
  const statePath = path.join(backupsDir, "state.json");

  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const u = new URL(url);
    if (u.pathname.endsWith("/admin/backups")) {
      return jsonResponse([{ id: SNAPSHOT_ID, sequence: 1, status: "ready" }]);
    }
    if (u.pathname === `/api/v1/admin/backups/${SNAPSHOT_ID}`) {
      return jsonResponse(manifestFor(1));
    }
    if (u.pathname.endsWith("/download-url")) {
      const component = u.searchParams.get("component");
      return jsonResponse({ url: `https://fake-minio.example/${component}`, expires_in: 3600 });
    }
    if (u.hostname === "fake-minio.example") {
      // Serve the WRONG bytes for one component — corrupted in transit.
      return new Response(Buffer.from("not what the manifest promised"), { status: 200 });
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  };
  t.after(() => {
    global.fetch = originalFetch;
    fs.rmSync(backupsDir, { recursive: true, force: true });
  });

  await assert.rejects(
    () =>
      runSync({
        baseUrl: "https://backend.invalid",
        accessToken: "test-token",
        backupPassword: "pw",
        backupsDir,
        statePath,
      }),
    /Checksum mismatch/,
  );

  assert.ok(!fs.existsSync(path.join(backupsDir, SNAPSHOT_ID)), "a corrupt download must never become the published snapshot dir");
  const state = await syncState.load(statePath);
  assert.equal(state.lastSyncStatus, "failed");
  assert.match(state.lastSyncError, /Checksum mismatch/);
});
