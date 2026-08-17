"use strict";

/**
 * Wraps electron-updater. The feed is the "generic" provider pointed at
 * https://test.spidnums.com/desktop-releases/ — NOT GitHub Releases, even
 * though this repo lives on GitHub: the repo is private, and GitHub's
 * release-asset API requires an authenticated request for a private repo,
 * which would mean baking a GitHub token into every installed copy of this
 * app — a real credential-distribution problem, not a hypothetical one.
 * The VPS already serves public, non-sensitive content over HTTPS via
 * Caddy (the same pattern documents/backups presigned URLs use), so a new,
 * deliberately public-read MinIO bucket containing only installer
 * artifacts (never business data) is the more correct fit here — see
 * DESKTOP.md's "Auto-update" section for the full reasoning and the
 * release publishing steps.
 *
 * electron-updater verifies the downloaded installer's checksum against
 * the sha512 recorded in latest.yml before ever calling it "downloaded" —
 * that integrity check is intrinsic to the library, not something this
 * wrapper adds on top.
 */

const { autoUpdater } = require("electron-updater");

function toInfo(info) {
  if (!info) return null;
  return {
    version: info.version,
    releaseNotes: typeof info.releaseNotes === "string" ? info.releaseNotes : null,
    releaseDate: info.releaseDate || null,
  };
}

/**
 * @param {(status: object) => void} onStatus called on every state change —
 *   {state: "checking"|"available"|"up-to-date"|"downloading"|"downloaded"|"error", ...}
 */
function setupAutoUpdater({ onStatus }) {
  // Explicit two-step (check -> user decides -> download) rather than
  // electron-updater's default auto-download: the spec this was built
  // against is explicit that a user must see "Update Now" / "Later" BEFORE
  // any bytes move, not just before install.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("checking-for-update", () => onStatus({ state: "checking" }));
  autoUpdater.on("update-available", (info) => onStatus({ state: "available", info: toInfo(info) }));
  autoUpdater.on("update-not-available", (info) => onStatus({ state: "up-to-date", info: toInfo(info) }));
  autoUpdater.on("download-progress", (progress) =>
    onStatus({
      state: "downloading",
      progress: {
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond,
      },
    }),
  );
  autoUpdater.on("update-downloaded", (info) => onStatus({ state: "downloaded", info: toInfo(info) }));
  autoUpdater.on("error", (err) => {
    // A network hiccup or an unreachable update server must never surface
    // as a crash or block using the rest of the app — see main.js's
    // startup-check call site, which never awaits/throws on this.
    onStatus({ state: "error", message: err?.message || String(err) });
  });

  return {
    checkForUpdates: () =>
      autoUpdater.checkForUpdates().catch((err) => onStatus({ state: "error", message: err.message })),
    downloadUpdate: () =>
      autoUpdater.downloadUpdate().catch((err) => onStatus({ state: "error", message: err.message })),
    quitAndInstall: () => autoUpdater.quitAndInstall(),
    currentVersion: () => autoUpdater.currentVersion?.version || null,
  };
}

module.exports = { setupAutoUpdater };
