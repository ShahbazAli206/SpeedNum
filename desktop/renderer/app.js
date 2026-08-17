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

(async function init() {
  const restored = await window.speednum.restoreSession();
  if (restored) {
    document.getElementById("baseUrl").value = restored.baseUrl;
    showDashboard();
  } else {
    showLogin();
  }
})();
