"use strict";

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

// TEMPORARY diagnostic — pins down why the update modal appears in a dev
// launch despite every checkForUpdates() call site being gated behind
// app.isPackaged. Remove once the live behavior is understood.
const DEBUG_LOG = path.join(__dirname, "..", "debug.log");
function debugLog(msg) {
  try {
    fs.appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {
    // best-effort only
  }
}
debugLog(`module load: argv=${JSON.stringify(process.argv)} defaultApp=${process.defaultApp}`);

const backupClient = require("./backup-client");
const { runSync, scheduleSync } = require("./sync");
const syncState = require("./sync-state");
const { makeSecureStore } = require("./secure-store");
const { runRestoreDrill } = require("./restore-drill");
const { setupAutoUpdater } = require("./updater");

// On startup, then every 4 hours while running — frequent enough that a
// released update reaches people within a work day, infrequent enough that
// it's not a meaningful load on the update server (a handful of static
// file GETs per running instance per day).
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

// A superadmin session here is the single biggest blast radius in the
// whole application (same reasoning as admin_backups.py's own docstring)
// — HTTPS only, ever, no fallback.
function assertHttps(baseUrl) {
  if (!/^https:\/\//i.test(baseUrl)) {
    throw new Error("The SpidNums backend URL must be HTTPS.");
  }
}

let mainWindow;
let secureStore;
let stopScheduler = null;
let session = null; // { baseUrl, accessToken, refreshToken, profile }
let updater = null;
let stopUpdateChecks = null;

const DEEP_LINK_PROTOCOL = "spidnums";

/**
 * The web dashboard's "Download App" button opens spidnums://check-update
 * (or spidnums://version) to detect whether the app is installed and, if
 * so, ask it to check for updates — see PHASE 10-13 of the desktop
 * distribution work: the website is only a launcher, never the authority on
 * installed/latest version, and must never be able to make this process run
 * an arbitrary command.
 *
 * Security: the only thing a deep link can ever do is trigger one of the two
 * named, hardcoded actions below. The raw URL is parsed with the standard
 * URL parser and only ever compared against a fixed allow-list — nothing
 * from it is ever concatenated into a shell command, passed to
 * child_process, or used to build a filesystem path. An unrecognised
 * command, protocol, or malformed URL is silently ignored (no error surfaced
 * to a page that has no business knowing whether its link handling made
 * sense to us).
 */
function handleDeepLink(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return;
  }
  if (parsed.protocol !== `${DEEP_LINK_PROTOCOL}:`) return;

  // Electron/Windows URL parsing puts the part after `spidnums://` into
  // either `hostname` (spidnums://check-update) or `pathname`
  // (spidnums:check-update) depending on platform quirks — check both,
  // still only ever as an exact match against the allow-list below.
  const command = (parsed.hostname || parsed.pathname.replace(/^\/+/, "")).toLowerCase();

  debugLog(`handleDeepLink: rawUrl=${rawUrl} command=${command} isPackaged=${app.isPackaged} hasUpdater=${!!updater}`);

  if (command !== "check-update" && command !== "version") return;

  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }

  if (!app.isPackaged || !updater) return; // same unpackaged-build caveat as the startup check below
  debugLog("handleDeepLink: calling updater.checkForUpdates({manual:true})");
  updater.checkForUpdates({ manual: true });
}

function userDataPaths() {
  const base = app.getPath("userData");
  return {
    base,
    statePath: path.join(base, "sync-state.json"),
    backupsDir: path.join(base, "backups"),
  };
}

async function ensureFreshAccessToken() {
  if (!session) throw new Error("Not signed in.");
  try {
    // Piggybacks on a call this session always needs next anyway (the
    // backup list) rather than a separate probe request — a superadmin
    // session has no cheaper authenticated endpoint to check against.
    await backupClient.listSnapshots({ baseUrl: session.baseUrl, accessToken: session.accessToken });
  } catch (err) {
    if (err.status !== 401) throw err;
    const refreshed = await backupClient.refresh({ baseUrl: session.baseUrl, refreshToken: session.refreshToken });
    session.accessToken = refreshed.accessToken;
    session.refreshToken = refreshed.refreshToken;
    await persistSession();
  }
}

async function persistSession() {
  await secureStore.save({
    baseUrl: session.baseUrl,
    refreshToken: session.refreshToken,
    deviceId: session.deviceId,
  });
}

/**
 * Registers this installation once and reuses the same device_id forever
 * after (persisted alongside the refresh token) — a fresh registration on
 * every login would make backup_devices grow without bound and defeat the
 * point of a per-installation revocation target (admin_devices.py).
 */
async function ensureDeviceRegistered() {
  if (session.deviceId) return;
  const os = require("os");
  const { device_id } = await backupClient.registerDevice({
    baseUrl: session.baseUrl,
    accessToken: session.accessToken,
    name: `${os.hostname()} (${os.userInfo().username})`,
    platform: process.platform,
    appVersion: app.getVersion(),
  });
  session.deviceId = device_id;
  await persistSession();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
}

// Windows delivers a spidnums:// deep link by launching a *second* process
// with the URL as a command-line argument. Without a single-instance lock
// that would silently open a second, session-less window instead of routing
// the link to the one already running — this lock plus the "second-instance"
// handler below is what makes the deep link reach the real app.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    debugLog(`second-instance: argv=${JSON.stringify(argv)}`);
    const link = argv.find((arg) => arg.startsWith(`${DEEP_LINK_PROTOCOL}://`));
    if (link) handleDeepLink(link);
    else if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    debugLog(
      `whenReady: isPackaged=${app.isPackaged} defaultApp=${process.defaultApp} ` +
        `appPath=${app.getAppPath()} argv=${JSON.stringify(process.argv)}`,
    );
    // Also needed on Windows even with electron-builder's package.json
    // `protocols` config (which registers the handler at install time) —
    // this call keeps registration correct for an unpackaged dev run too.
    //
    // Uses app.getAppPath() rather than process.argv[1]: argv's app-path slot
    // isn't reliably at index 1 (e.g. `electron --remote-debugging-port=9502 .`
    // puts a CLI flag there instead), and registering that flag as the fixed
    // launch argument silently corrupts the OS-level protocol handler — every
    // future spidnums:// click then launches electron.exe against a bogus
    // path and fails, until the registry entry is manually corrected.
    if (process.defaultApp) {
      app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL, process.execPath, [app.getAppPath()]);
    } else {
      app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL);
    }

    secureStore = makeSecureStore(app.getPath("userData"));
    createWindow();

    updater = setupAutoUpdater({
      onStatus: (status) => {
        debugLog(`updateStatus: ${JSON.stringify(status)}`);
        mainWindow?.webContents.send("spidnums:updateStatus", status);
      },
    });

    // A packaged app only — electron-updater has no installed-app metadata to
    // compare against when run unpackaged (`npm start`), and errors on every
    // check in that mode. Real update checks are exercised against a real
    // packaged build in this session's own verification, not `npm start`.
    debugLog(`startup update-check gate: isPackaged=${app.isPackaged}`);
    if (app.isPackaged) {
      debugLog("startup: calling updater.checkForUpdates() + scheduling interval");
      updater.checkForUpdates();
      stopUpdateChecks = setInterval(() => updater.checkForUpdates(), UPDATE_CHECK_INTERVAL_MS);
    }

    // Cold start via the deep link itself (app wasn't already running) —
    // the URL arrives as a plain command-line argument, same as argv[1]
    // above, just checked here for the app's *own* launch rather than a
    // second instance's.
    const coldStartLink = process.argv.find((arg) => arg.startsWith(`${DEEP_LINK_PROTOCOL}://`));
    debugLog(`coldStartLink=${coldStartLink ?? "(none)"}`);
    if (coldStartLink) handleDeepLink(coldStartLink);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

// macOS delivers deep links through this event instead of argv — harmless to
// register even though the current build only packages for Windows (PHASE 4),
// and correct if a macOS target is ever added without revisiting this file.
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

app.on("window-all-closed", () => {
  if (stopScheduler) stopScheduler();
  if (stopUpdateChecks) clearInterval(stopUpdateChecks);
  if (process.platform !== "darwin") app.quit();
});

/* ---------------------------------------------------------------------- */
/* IPC surface — everything the renderer can ask the main process to do.   */
/* No backend credential (Postgres, MinIO) ever crosses this boundary.     */
/* ---------------------------------------------------------------------- */

ipcMain.handle("spidnums:restoreSession", async () => {
  const saved = await secureStore.load();
  if (!saved) return null;
  try {
    const refreshed = await backupClient.refresh({ baseUrl: saved.baseUrl, refreshToken: saved.refreshToken });
    session = {
      baseUrl: saved.baseUrl,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      deviceId: saved.deviceId,
    };
    await ensureDeviceRegistered();
    return { baseUrl: saved.baseUrl, restored: true };
  } catch {
    await secureStore.clear();
    return null;
  }
});

ipcMain.handle("spidnums:login", async (_event, { baseUrl, email, password }) => {
  assertHttps(baseUrl);
  const result = await backupClient.login({ baseUrl, email, password });
  if (!result.profile.is_superadmin) {
    throw new Error("This account is not a platform superadmin — backup access requires it.");
  }
  session = {
    baseUrl,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    deviceId: null,
  };
  await persistSession();
  await ensureDeviceRegistered();
  return { profile: result.profile };
});

ipcMain.handle("spidnums:logout", async () => {
  session = null;
  if (stopScheduler) {
    stopScheduler();
    stopScheduler = null;
  }
  await secureStore.clear();
});

ipcMain.handle("spidnums:listBackups", async () => {
  await ensureFreshAccessToken();
  return backupClient.listSnapshots({ baseUrl: session.baseUrl, accessToken: session.accessToken });
});

ipcMain.handle("spidnums:triggerBackup", async () => {
  await ensureFreshAccessToken();
  return backupClient.triggerBackup({ baseUrl: session.baseUrl, accessToken: session.accessToken });
});

ipcMain.handle("spidnums:getSyncState", async () => {
  const { statePath } = userDataPaths();
  return syncState.load(statePath);
});

ipcMain.handle("spidnums:runSyncNow", async (_event, { backupPassword }) => {
  await ensureFreshAccessToken();
  await ensureDeviceRegistered();
  const { statePath, backupsDir } = userDataPaths();
  return runSync({
    baseUrl: session.baseUrl,
    accessToken: session.accessToken,
    deviceId: session.deviceId,
    backupPassword,
    backupsDir,
    statePath,
    log: (msg) => mainWindow?.webContents.send("spidnums:syncLog", msg),
  });
});

ipcMain.handle("spidnums:setSyncInterval", async (_event, { minutes, backupPassword }) => {
  const { statePath, backupsDir } = userDataPaths();
  const state = await syncState.load(statePath);
  state.syncIntervalMinutes = minutes;
  await syncState.save(statePath, state);

  if (stopScheduler) stopScheduler();
  stopScheduler = scheduleSync(async () => {
    await ensureFreshAccessToken();
    await ensureDeviceRegistered();
    return runSync({
      baseUrl: session.baseUrl,
      accessToken: session.accessToken,
      deviceId: session.deviceId,
      backupPassword,
      backupsDir,
      statePath,
      log: (msg) => mainWindow?.webContents.send("spidnums:syncLog", msg),
    });
  }, minutes);
  return { ok: true };
});

ipcMain.handle("spidnums:runRestoreDrill", async (_event, { snapshotId, backupPassword, apiImage }) => {
  await ensureFreshAccessToken();
  await ensureDeviceRegistered();
  const { backupsDir } = userDataPaths();
  const cryptoEnvelope = require("./crypto-envelope");
  const os = require("os");
  const fs = require("fs");

  const encPath = path.join(backupsDir, snapshotId, "postgres_dump.snbk");
  const decPath = path.join(os.tmpdir(), `spidnums-drill-${Date.now()}.sql.gz`);
  await cryptoEnvelope.decryptFile(encPath, decPath, backupPassword);

  try {
    const result = await runRestoreDrill({
      postgresDumpPath: decPath,
      apiImage,
      loginCheck: null,
    });
    await backupClient.reportRestoreDrill({
      baseUrl: session.baseUrl,
      accessToken: session.accessToken,
      snapshotId,
      deviceId: session.deviceId,
      ok: result.ok,
      detail: result.detail,
    });
    return result;
  } finally {
    await fs.promises.rm(decPath, { force: true });
  }
});

ipcMain.handle("spidnums:getAppVersion", () => app.getVersion());

ipcMain.handle("spidnums:checkForUpdates", async () => {
  if (!app.isPackaged) {
    return { state: "error", message: "Update checks are only meaningful in a packaged build." };
  }
  await updater.checkForUpdates();
  return { ok: true };
});

ipcMain.handle("spidnums:downloadUpdate", async () => {
  await updater.downloadUpdate();
  return { ok: true };
});

ipcMain.handle("spidnums:installUpdate", () => {
  // Quits and relaunches into the new version — nothing after this call runs.
  updater.quitAndInstall();
});

module.exports = {}; // exercised via Electron's own process entry, not required elsewhere
