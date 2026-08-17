"use strict";

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

const backupClient = require("./backup-client");
const { runSync, scheduleSync } = require("./sync");
const syncState = require("./sync-state");
const { makeSecureStore } = require("./secure-store");
const { runRestoreDrill } = require("./restore-drill");

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
    // A cheap authenticated call to check the current token is still good;
    // /auth/me exists on every deployment and needs no special scope.
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
  await secureStore.save({ baseUrl: session.baseUrl, refreshToken: session.refreshToken });
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

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (stopScheduler) stopScheduler();
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
    session = { baseUrl: saved.baseUrl, accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken };
    await persistSession();
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
  };
  await persistSession();
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
  const { statePath, backupsDir } = userDataPaths();
  return runSync({
    baseUrl: session.baseUrl,
    accessToken: session.accessToken,
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
    return runSync({
      baseUrl: session.baseUrl,
      accessToken: session.accessToken,
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
      ok: result.ok,
      detail: result.detail,
    });
    return result;
  } finally {
    await fs.promises.rm(decPath, { force: true });
  }
});

module.exports = {}; // exercised via Electron's own process entry, not required elsewhere
