"use strict";

const { contextBridge, ipcRenderer } = require("electron");

/**
 * The only surface the renderer (untrusted-ish web content, contextIsolation
 * on, nodeIntegration off) can reach — a fixed, named set of IPC calls, not
 * arbitrary Node/Electron access. No credential of any kind is exposed here;
 * the renderer never sees a Postgres/MinIO credential or the raw refresh
 * token, only whatever the main process's IPC handlers choose to return.
 */
contextBridge.exposeInMainWorld("spidnums", {
  restoreSession: () => ipcRenderer.invoke("spidnums:restoreSession"),
  login: (baseUrl, email, password) => ipcRenderer.invoke("spidnums:login", { baseUrl, email, password }),
  logout: () => ipcRenderer.invoke("spidnums:logout"),
  listBackups: () => ipcRenderer.invoke("spidnums:listBackups"),
  triggerBackup: () => ipcRenderer.invoke("spidnums:triggerBackup"),
  getSyncState: () => ipcRenderer.invoke("spidnums:getSyncState"),
  runSyncNow: (backupPassword) => ipcRenderer.invoke("spidnums:runSyncNow", { backupPassword }),
  setSyncInterval: (minutes, backupPassword) =>
    ipcRenderer.invoke("spidnums:setSyncInterval", { minutes, backupPassword }),
  runRestoreDrill: (snapshotId, backupPassword, apiImage) =>
    ipcRenderer.invoke("spidnums:runRestoreDrill", { snapshotId, backupPassword, apiImage }),
  onSyncLog: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("spidnums:syncLog", listener);
    return () => ipcRenderer.removeListener("spidnums:syncLog", listener);
  },
  getAppVersion: () => ipcRenderer.invoke("spidnums:getAppVersion"),
  checkForUpdates: () => ipcRenderer.invoke("spidnums:checkForUpdates"),
  downloadUpdate: () => ipcRenderer.invoke("spidnums:downloadUpdate"),
  installUpdate: () => ipcRenderer.invoke("spidnums:installUpdate"),
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("spidnums:updateStatus", listener);
    return () => ipcRenderer.removeListener("spidnums:updateStatus", listener);
  },
});
