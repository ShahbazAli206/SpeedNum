"use strict";

/**
 * Talks to the same SpeedNum FastAPI backend every other client does —
 * plain HTTPS + the existing local-auth JWT/refresh-cookie pair, and the
 * six /admin/backups/* endpoints (superadmin-only). No direct Postgres or
 * MinIO admin credential ever reaches this process — see
 * backend/app/routers/admin_backups.py for the server side of this contract.
 */

const fs = require("fs");
const crypto = require("crypto");
const { pipeline } = require("stream/promises");
const { Readable } = require("stream");

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function apiUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/, "")}/api/v1${path}`;
}

function extractRefreshCookie(response) {
  // Node's fetch exposes multiple Set-Cookie values via getSetCookie();
  // fall back to the single-header form for older runtimes.
  const raw =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean);
  for (const cookie of raw) {
    const match = /^sn_refresh=([^;]+)/.exec(cookie);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

async function parseJsonOrThrow(response) {
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message =
      parsed && typeof parsed === "object" && "detail" in parsed
        ? String(parsed.detail)
        : `Request failed (${response.status}).`;
    throw new ApiError(response.status, message);
  }
  return parsed;
}

async function login({ baseUrl, email, password }) {
  const response = await fetch(apiUrl(baseUrl, "/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await parseJsonOrThrow(response);
  const refreshToken = extractRefreshCookie(response);
  if (!refreshToken) throw new Error("Login succeeded but no session cookie was issued.");
  return {
    accessToken: body.access_token,
    expiresIn: body.expires_in,
    profile: body.profile,
    refreshToken,
  };
}

async function refresh({ baseUrl, refreshToken }) {
  const response = await fetch(apiUrl(baseUrl, "/auth/refresh"), {
    method: "POST",
    headers: { Cookie: `sn_refresh=${refreshToken}` },
  });
  const body = await parseJsonOrThrow(response);
  const nextRefreshToken = extractRefreshCookie(response) || refreshToken;
  return { accessToken: body.access_token, expiresIn: body.expires_in, refreshToken: nextRefreshToken };
}

function authed(baseUrl, path, accessToken, init = {}) {
  return fetch(apiUrl(baseUrl, path), {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${accessToken}` },
  }).then(parseJsonOrThrow);
}

const listSnapshots = ({ baseUrl, accessToken }) => authed(baseUrl, "/admin/backups", accessToken);

const getManifest = ({ baseUrl, accessToken, snapshotId }) =>
  authed(baseUrl, `/admin/backups/${snapshotId}`, accessToken);

const getDownloadUrl = ({ baseUrl, accessToken, snapshotId, component }) =>
  authed(baseUrl, `/admin/backups/${snapshotId}/download-url?component=${encodeURIComponent(component)}`, accessToken, {
    method: "POST",
  });

const triggerBackup = ({ baseUrl, accessToken }) =>
  authed(baseUrl, "/admin/backups/run", accessToken, { method: "POST" });

const ackDownload = ({ baseUrl, accessToken, snapshotId }) =>
  authed(baseUrl, `/admin/backups/${snapshotId}/ack-download`, accessToken, { method: "POST" });

const reportRestoreDrill = ({ baseUrl, accessToken, snapshotId, ok, detail }) =>
  authed(baseUrl, `/admin/backups/${snapshotId}/restore-drill`, accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok, detail: detail || {} }),
  });

/**
 * Streams a presigned download URL straight to disk while hashing it —
 * one pass, no need to re-read the file afterward just to check it. The
 * manifest's recorded sha256 is the trust root (see admin_backups.py's own
 * comment on that), so this always verifies against it before returning.
 */
async function downloadToFile({ url, destPath, expectedSha256 }) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new ApiError(response.status, `Download failed (${response.status}).`);
  }
  const hash = crypto.createHash("sha256");
  const out = fs.createWriteStream(destPath);
  const body = Readable.fromWeb(response.body);
  body.on("data", (chunk) => hash.update(chunk));
  await pipeline(body, out);

  const actual = hash.digest("hex");
  if (expectedSha256 && actual !== expectedSha256) {
    await fs.promises.rm(destPath, { force: true });
    throw new Error(
      `Checksum mismatch downloading ${destPath}: expected ${expectedSha256}, got ${actual}. ` +
        "The partial download was discarded, not kept.",
    );
  }
  return { sha256: actual };
}

module.exports = {
  ApiError,
  login,
  refresh,
  listSnapshots,
  getManifest,
  getDownloadUrl,
  triggerBackup,
  ackDownload,
  reportRestoreDrill,
  downloadToFile,
};
