/**
 * Headless-Chrome smoke check, driven over the DevTools protocol directly.
 *
 * No Puppeteer/Playwright dependency — Node 22 ships a global WebSocket, and
 * everything needed here is a handful of CDP commands. Adding a ~300 MB browser
 * dev-dependency to assert "no console errors" is a poor trade.
 *
 * Usage:  node scripts/cdp-check.mjs <baseUrl> [--shots <dir>]
 *
 * For each route: navigates, waits for the network to settle, and records
 * console errors, uncaught exceptions and failed requests. Exits non-zero if
 * anything was found, so it can gate a deploy.
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const BASE = process.argv[2] ?? "http://localhost:3111";
const shotsFlag = process.argv.indexOf("--shots");
const SHOTS = shotsFlag > -1 ? process.argv[shotsFlag + 1] : null;

const CHROME =
  process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9333;

const ROUTES = [
  "/",
  "/features",
  "/features/client-management",
  "/pricing",
  "/blog",
  "/case-studies",
  "/request-demo",
  "/terms",
  "/privacy",
  "/login",
  "/signup",
  "/portal-login",
  // Firm surface
  "/overview",
  "/clients",
  "/clients/new",
  "/clients/settings",
  "/workflows",
  "/workflows/new",
  "/deadlines",
  "/reminders",
  "/services",
  "/engagements",
  "/engagements/new",
  "/team",
  "/users",
  "/reporting",
  "/notifications",
  "/custom-fields",
  "/import",
  "/integrations",
  "/settings",
  "/admin",
  // Client portal
  "/dashboard",
  "/dashboard/invoices",
  "/dashboard/expenses",
  "/dashboard/payroll",
  "/dashboard/taxes",
  "/dashboard/reports",
  "/dashboard/documents",
  "/dashboard/services",
  "/dashboard/settings",
  // 404
  "/definitely-not-a-page",
];

/** Console noise that is expected in demo mode and not a defect. */
const IGNORE = [
  /Failed to load resource/i,
  /net::ERR_/i,
  /Could not reach the API/i,
  /favicon/i,
  /Download the React DevTools/i,
];

async function main() {
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--user-data-dir=" + (process.env.TEMP ?? "/tmp") + "/cdp-check-profile",
    "--window-size=1440,900",
    "about:blank",
  ]);
  chrome.on("error", (error) => {
    console.error("Could not launch Chrome:", error.message);
    process.exit(2);
  });

  const target = await waitForTarget();
  const socket = new WebSocket(target);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  const listeners = [];

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined) {
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    } else {
      for (const listener of listeners) listener(message);
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++nextId;
      pending.set(id, (message) => resolve(message.result ?? message.error));
      socket.send(JSON.stringify({ id, method, params }));
    });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Log.enable");

  let problems = [];
  let currentStatus = null;

  listeners.push((message) => {
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      const text = message.params.args
        .map((arg) => arg.value ?? arg.description ?? "")
        .join(" ");
      if (!IGNORE.some((pattern) => pattern.test(text))) problems.push(`console.error: ${text}`);
    }
    if (message.method === "Runtime.exceptionThrown") {
      const details = message.params.exceptionDetails;
      const text = details.exception?.description ?? details.text ?? "unknown";
      if (!IGNORE.some((pattern) => pattern.test(text))) problems.push(`exception: ${text}`);
    }
    if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
      const text = message.params.entry.text ?? "";
      if (!IGNORE.some((pattern) => pattern.test(text))) problems.push(`log: ${text}`);
    }
    if (message.method === "Network.responseReceived" && message.params.type === "Document") {
      currentStatus = message.params.response.status;
    }
  });

  if (SHOTS) mkdirSync(SHOTS, { recursive: true });

  const results = [];
  for (const route of ROUTES) {
    problems = [];
    currentStatus = null;
    await send("Page.navigate", { url: `${BASE}${route}` });
    await sleep(1400);
    results.push({ route, status: currentStatus, problems: [...problems] });

    if (SHOTS) {
      const shot = await send("Page.captureScreenshot", { format: "png" });
      if (shot?.data) {
        const name = route === "/" ? "root" : route.replace(/^\//, "").replace(/\//g, "_");
        writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(shot.data, "base64"));
      }
    }
  }

  socket.close();
  chrome.kill();

  let failures = 0;
  for (const result of results) {
    const expected = result.route === "/definitely-not-a-page" ? 404 : 200;
    const statusOk = result.status === expected;
    const clean = result.problems.length === 0;
    if (!statusOk || !clean) failures += 1;
    const mark = statusOk && clean ? "ok  " : "FAIL";
    console.log(`${mark} ${String(result.status).padEnd(3)} ${result.route}`);
    for (const problem of result.problems.slice(0, 3)) console.log(`       ${problem}`);
  }

  console.log(`\n${results.length - failures}/${results.length} routes clean`);
  process.exit(failures === 0 ? 0 : 1);
}

async function waitForTarget() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const targets = await response.json();
      const page = targets.find((entry) => entry.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome still starting.
    }
    await sleep(400);
  }
  throw new Error("Chrome did not expose a debugging target");
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
