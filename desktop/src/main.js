"use strict";

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

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
    throw new Error("The SpeedNum backend URL must be HTTPS.");
  }
}

let mainWindow;
let secureStore;
let stopScheduler = null;
let session = null; // { baseUrl, accessToken, refreshToken, profile }
let updater = null;
let stopUpdateChecks = null;

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

app.whenReady().then(() => {
  secureStore = makeSecureStore(app.getPath("userData"));
  createWindow();

  updater = setupAutoUpdater({
    onStatus: (status) => mainWindow?.webContents.send("speednum:updateStatus", status),
  });

  // A packaged app only — electron-updater has no installed-app metadata to
  // compare against when run unpackaged (`npm start`), and errors on every
  // check in that mode. Real update checks are exercised against a real
  // packaged build in this session's own verification, not `npm start`.
  if (app.isPackaged) {
    updater.checkForUpdates();
    stopUpdateChecks = setInterval(() => updater.checkForUpdates(), UPDATE_CHECK_INTERVAL_MS);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
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

ipcMain.handle("speednum:restoreSession", async () => {
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

ipcMain.handle("speednum:login", async (_event, { baseUrl, email, password }) => {
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

ipcMain.handle("speednum:logout", async () => {
  session = null;
  if (stopScheduler) {
    stopScheduler();
    stopScheduler = null;
  }
  await secureStore.clear();
});

ipcMain.handle("speednum:listBackups", async () => {
  await ensureFreshAccessToken();
  return backupClient.listSnapshots({ baseUrl: session.baseUrl, accessToken: session.accessToken });
});

ipcMain.handle("speednum:triggerBackup", async () => {
  await ensureFreshAccessToken();
  return backupClient.triggerBackup({ baseUrl: session.baseUrl, accessToken: session.accessToken });
});

ipcMain.handle("speednum:getSyncState", async () => {
  const { statePath } = userDataPaths();
  return syncState.load(statePath);
});

ipcMain.handle("speednum:runSyncNow", async (_event, { backupPassword }) => {
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
    log: (msg) => mainWindow?.webContents.send("speednum:syncLog", msg),
  });
});

ipcMain.handle("speednum:setSyncInterval", async (_event, { minutes, backupPassword }) => {
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
      log: (msg) => mainWindow?.webContents.send("speednum:syncLog", msg),
    });
  }, minutes);
  return { ok: true };
});

ipcMain.handle("speednum:runRestoreDrill", async (_event, { snapshotId, backupPassword, apiImage }) => {
  await ensureFreshAccessToken();
  await ensureDeviceRegistered();
  const { backupsDir } = userDataPaths();
  const cryptoEnvelope = require("./crypto-envelope");
  const os = require("os");
  const fs = require("fs");

  const encPath = path.join(backupsDir, snapshotId, "postgres_dump.snbk");
  const decPath = path.join(os.tmpdir(), `speednum-drill-${Date.now()}.sql.gz`);
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

ipcMain.handle("speednum:getAppVersion", () => app.getVersion());

ipcMain.handle("speednum:checkForUpdates", async () => {
  if (!app.isPackaged) {
    return { state: "error", message: "Update checks are only meaningful in a packaged build." };
  }
  await updater.checkForUpdates();
  return { ok: true };
});

ipcMain.handle("speednum:downloadUpdate", async () => {
  await updater.downloadUpdate();
  return { ok: true };
});

ipcMain.handle("speednum:installUpdate", () => {
  // Quits and relaunches into the new version — nothing after this call runs.
  updater.quitAndInstall();
});

module.exports = {}; // exercised via Electron's own process entry, not required elsewhere
