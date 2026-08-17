"use strict";

const { contextBridge, ipcRenderer } = require("electron");

/**
 * The only surface the renderer (untrusted-ish web content, contextIsolation
 * on, nodeIntegration off) can reach — a fixed, named set of IPC calls, not
 * arbitrary Node/Electron access. No credential of any kind is exposed here;
 * the renderer never sees a Postgres/MinIO credential or the raw refresh
 * token, only whatever the main process's IPC handlers choose to return.
 */
contextBridge.exposeInMainWorld("speednum", {
  restoreSession: () => ipcRenderer.invoke("speednum:restoreSession"),
  login: (baseUrl, email, password) => ipcRenderer.invoke("speednum:login", { baseUrl, email, password }),
  logout: () => ipcRenderer.invoke("speednum:logout"),
  listBackups: () => ipcRenderer.invoke("speednum:listBackups"),
  triggerBackup: () => ipcRenderer.invoke("speednum:triggerBackup"),
  getSyncState: () => ipcRenderer.invoke("speednum:getSyncState"),
  runSyncNow: (backupPassword) => ipcRenderer.invoke("speednum:runSyncNow", { backupPassword }),
  setSyncInterval: (minutes, backupPassword) =>
    ipcRenderer.invoke("speednum:setSyncInterval", { minutes, backupPassword }),
  runRestoreDrill: (snapshotId, backupPassword, apiImage) =>
    ipcRenderer.invoke("speednum:runRestoreDrill", { snapshotId, backupPassword, apiImage }),
  onSyncLog: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("speednum:syncLog", listener);
    return () => ipcRenderer.removeListener("speednum:syncLog", listener);
  },
  getAppVersion: () => ipcRenderer.invoke("speednum:getAppVersion"),
  checkForUpdates: () => ipcRenderer.invoke("speednum:checkForUpdates"),
  downloadUpdate: () => ipcRenderer.invoke("speednum:downloadUpdate"),
  installUpdate: () => ipcRenderer.invoke("speednum:installUpdate"),
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("speednum:updateStatus", listener);
    return () => ipcRenderer.removeListener("speednum:updateStatus", listener);
  },
});
