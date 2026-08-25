"use strict";

const loginView = document.getElementById("loginView");
const dashboardView = document.getElementById("dashboardView");
const logoutBtn = document.getElementById("logoutBtn");
const logEl = document.getElementById("log");

function appendLog(message) {
  logEl.textContent += `${message}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

window.speednum.onSyncLog(appendLog);

function showDashboard() {
  loginView.classList.add("hidden");
  dashboardView.classList.remove("hidden");
  logoutBtn.classList.remove("hidden");
  refreshAll();
}

function showLogin() {
  loginView.classList.remove("hidden");
  dashboardView.classList.add("hidden");
  logoutBtn.classList.add("hidden");
}

document.getElementById("loginBtn").addEventListener("click", async () => {
  const baseUrl = document.getElementById("baseUrl").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const errorEl = document.getElementById("loginError");
  errorEl.textContent = "";
  try {
    await window.speednum.login(baseUrl, email, password);
    showDashboard();
  } catch (err) {
    errorEl.textContent = err.message || "Could not sign in.";
  }
});

logoutBtn.addEventListener("click", async () => {
  await window.speednum.logout();
  showLogin();
});

document.getElementById("syncNowBtn").addEventListener("click", async () => {
  const backupPassword = document.getElementById("backupPassword").value;
  if (!backupPassword) {
    appendLog("Enter a backup password before syncing — it encrypts everything downloaded locally.");
    return;
  }
  appendLog("Starting sync…");
  try {
    const result = await window.speednum.runSyncNow(backupPassword);
    appendLog(`Sync finished: ${result.message || `snapshot #${result.sequence}`}`);
  } catch (err) {
    appendLog(`Sync failed: ${err.message}`);
  }
  refreshAll();
});

document.getElementById("triggerBackupBtn").addEventListener("click", async () => {
  appendLog("Triggering a new server-side backup…");
  try {
    const result = await window.speednum.triggerBackup();
    appendLog(`Server backup: ${result.status} (#${result.sequence}, ${result.snapshot_kind})`);
  } catch (err) {
    appendLog(`Trigger failed: ${err.message}`);
  }
  refreshAll();
});

async function refreshAll() {
  const [backups, state] = await Promise.all([
    window.speednum.listBackups().catch(() => []),
    window.speednum.getSyncState().catch(() => null),
  ]);
  renderBackups(backups);
  renderSyncStatus(state);
}

function renderSyncStatus(state) {
  const el = document.getElementById("syncStatus");
  if (!state || !state.lastSyncCompletedAt) {
    el.textContent = "No sync has run yet.";
    return;
  }
  const cls = state.lastSyncStatus === "ok" ? "status-ok" : "status-failed";
  el.innerHTML =
    `Last sync: <span class="${cls}">${state.lastSyncStatus}</span> at ${state.lastSyncCompletedAt}` +
    (state.lastSyncError ? `<br/>Error: ${state.lastSyncError}` : "") +
    `<br/>Sync interval: every ${state.syncIntervalMinutes} minutes`;
}

function renderBackups(backups) {
  const tbody = document.getElementById("backupRows");
  tbody.innerHTML = "";
  for (const row of backups) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.sequence}</td>
      <td>${row.status}</td>
      <td>${row.snapshot_kind}</td>
      <td>${new Date(row.created_at).toLocaleString()}</td>
      <td>${row.downloaded_at ? "yes" : "no"}</td>
      <td>${row.last_drill_at ? (row.last_drill_ok ? "passed" : "failed") : "never"}</td>
    `;
    tbody.appendChild(tr);
  }
}

/* ------------------------------- Auto-update ------------------------------ */

const updateModal = document.getElementById("updateModal");
const updateAvailableView = document.getElementById("updateAvailableView");
const updateDownloadingView = document.getElementById("updateDownloadingView");
const updateReadyView = document.getElementById("updateReadyView");

let currentAppVersion = "";
let latestKnownVersion = "";

function showUpdateView(view) {
  updateModal.classList.remove("hidden");
  for (const el of [updateAvailableView, updateDownloadingView, updateReadyView]) {
    el.classList.toggle("hidden", el !== view);
  }
}

function hideUpdateModal() {
  updateModal.classList.add("hidden");
}

function formatBytes(bytes) {
  if (!bytes) return "0 MB";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

window.speednum.onUpdateStatus((status) => {
  // "up to date" / "checking" only ever need to say something when the user
  // actually asked (clicked the dashboard's deep link, or the in-app "Check
  // for updates" affordance) — the silent 4-hour background poll must stay
  // silent when there's nothing to report, or it would nag on every check.
  if (status.state === "up-to-date" && status.manual) {
    appendLog(`You're on the latest version (v${currentAppVersion}).`);
    return;
  }
  if (status.state === "available") {
    latestKnownVersion = status.info?.version || "unknown";
    document.getElementById("updateCurrentVersion").textContent = currentAppVersion;
    document.getElementById("updateNewVersion").textContent = latestKnownVersion;
    const notesEl = document.getElementById("updateReleaseNotes");
    if (status.info?.releaseNotes) {
      notesEl.textContent = status.info.releaseNotes.replace(/<[^>]+>/g, "");
      notesEl.classList.remove("hidden");
    } else {
      notesEl.classList.add("hidden");
    }
    document.getElementById("updateAvailableError").classList.add("hidden");
    showUpdateView(updateAvailableView);
  } else if (status.state === "downloading") {
    const pct = Math.round(status.progress?.percent || 0);
    document.getElementById("updateProgressFill").style.width = `${pct}%`;
    document.getElementById("updateProgressDetail").textContent =
      `${pct}%  —  ${formatBytes(status.progress?.transferred)} / ${formatBytes(status.progress?.total)}`;
    showUpdateView(updateDownloadingView);
  } else if (status.state === "downloaded") {
    showUpdateView(updateReadyView);
  } else if (status.state === "error") {
    // Never block the app over a failed/offline update check — log only.
    appendLog(`[updater] ${status.message}`);
    // A failed "Update Now" click (download-update error) needs to say so
    // right in the modal that's still open — appendLog alone is invisible
    // here, since #log lives inside the dashboard view, hidden pre-login.
    if (!updateModal.classList.contains("hidden") && !updateAvailableView.classList.contains("hidden")) {
      const errEl = document.getElementById("updateAvailableError");
      errEl.textContent = `Couldn't download the update: ${status.message}`;
      errEl.classList.remove("hidden");
    } else if (!updateReadyView.classList.contains("hidden") || !updateDownloadingView.classList.contains("hidden")) {
      hideUpdateModal();
    }
  }
});

document.getElementById("updateNowBtn").addEventListener("click", () => {
  window.speednum.downloadUpdate();
});
document.getElementById("updateLaterBtn").addEventListener("click", hideUpdateModal);
document.getElementById("restartNowBtn").addEventListener("click", () => {
  window.speednum.installUpdate();
});
document.getElementById("updateReadyLaterBtn").addEventListener("click", hideUpdateModal);

(async function init() {
  currentAppVersion = await window.speednum.getAppVersion();
  document.getElementById("appVersion").textContent = `v${currentAppVersion}`;

  const restored = await window.speednum.restoreSession();
  if (restored) {
    document.getElementById("baseUrl").value = restored.baseUrl;
    showDashboard();
  } else {
    showLogin();
  }
})();
