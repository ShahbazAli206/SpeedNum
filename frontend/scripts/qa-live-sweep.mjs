/**
 * Authenticated route sweep against a live/dev frontend, using a real
 * login through the actual /login form (not a token injected by hand) so
 * the full BFF cookie-minting path is exercised too. Reports console
 * errors, uncaught exceptions, failed requests, and known error strings
 * per authenticated route.
 *
 * Usage: node scripts/qa-live-sweep.mjs <baseUrl> <email> <password> [--shots <dir>]
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const BASE = process.argv[2] ?? "http://localhost:3111";
const EMAIL = process.argv[3];
const PASSWORD = process.argv[4];
const shotsFlag = process.argv.indexOf("--shots");
const SHOTS = shotsFlag > -1 ? process.argv[shotsFlag + 1] : null;

const CHROME =
  process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9335;

const ROUTES = [
  "/overview",
  "/clients",
  "/clients/new",
  "/clients/settings",
  "/workflows",
  "/deadlines",
  "/reminders",
  "/services",
  "/engagements",
  "/team",
  "/users",
  "/reporting",
  "/notifications",
  "/custom-fields",
  "/import",
  "/integrations",
  "/settings",
];

const IGNORE = [/favicon/i, /Download the React DevTools/i];

const ERROR_STRINGS = [
  "Could not load",
  "could not load",
  "No firm is linked",
  "not connected",
  "Something went wrong",
  "undefined is not",
  "Cannot read propert",
  "Internal Server Error",
];

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error("usage: node scripts/qa-live-sweep.mjs <baseUrl> <email> <password> [--shots dir]");
    process.exit(2);
  }

  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--user-data-dir=" + (process.env.TEMP ?? "/tmp") + "/qa-live-sweep-profile",
    "--window-size=1440,900",
    "about:blank",
  ]);

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
  const failedRequests = [];

  listeners.push((message) => {
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      const text = message.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
      if (!IGNORE.some((p) => p.test(text))) problems.push(`console.error: ${text}`);
    }
    if (message.method === "Runtime.exceptionThrown") {
      const d = message.params.exceptionDetails;
      const text = d.exception?.description ?? d.text ?? "unknown";
      if (!IGNORE.some((p) => p.test(text))) problems.push(`exception: ${text}`);
    }
    if (message.method === "Network.responseReceived") {
      if (message.params.type === "Document") currentStatus = message.params.response.status;
      if (message.params.response.status >= 500) {
        failedRequests.push(`${message.params.response.status} ${message.params.response.url}`);
      }
    }
  });

  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result?.exceptionDetails) return { __error: result.exceptionDetails.exception?.description ?? "threw" };
    return result?.result?.value;
  };

  const goto = async (path) => {
    await send("Page.navigate", { url: `${BASE}${path}` });
    await sleep(1800);
  };

  const shot = async (name) => {
    if (!SHOTS) return;
    const data = await send("Page.captureScreenshot", { format: "png" });
    if (data?.data) writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data.data, "base64"));
  };

  if (SHOTS) mkdirSync(SHOTS, { recursive: true });

  /* ------------------------------------------------------------- Login */
  problems = [];
  failedRequests.length = 0;
  await goto("/login");
  const loginFormState = await evaluate(`
    (() => {
      const email = document.querySelector('input[type="email"], input[name="email"]');
      const pass = document.querySelector('input[type="password"]');
      return { hasEmail: !!email, hasPassword: !!pass };
    })()
  `);
  console.log("login form:", JSON.stringify(loginFormState));

  await evaluate(`
    (() => {
      const email = document.querySelector('input[type="email"], input[name="email"]');
      const pass = document.querySelector('input[type="password"]');
      const setVal = (el, val) => {
        const proto = Object.getPrototypeOf(el);
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      setVal(email, ${JSON.stringify(EMAIL)});
      setVal(pass, ${JSON.stringify(PASSWORD)});
    })()
  `);
  await sleep(200);
  await evaluate(`
    (() => {
      const btn = [...document.querySelectorAll('button[type="submit"], button')]
        .find(b => /log ?in|sign ?in/i.test(b.textContent || ""));
      if (btn) btn.click();
    })()
  `);
  await sleep(2500);
  const afterLogin = await evaluate(`({ url: location.pathname, body: document.body.textContent.slice(0, 300) })`);
  console.log("after login:", JSON.stringify(afterLogin));
  await shot("after-login");
  console.log(`login console problems: ${problems.length ? JSON.stringify(problems) : "none"}`);

  /* -------------------------------------------------------------- Sweep */
  const results = [];
  for (const route of ROUTES) {
    problems = [];
    failedRequests.length = 0;
    currentStatus = null;
    await goto(route);
    const bodyText = await evaluate(`document.body.textContent`);
    const matchedErrors = ERROR_STRINGS.filter((s) => bodyText && bodyText.includes(s));
    results.push({
      route,
      status: currentStatus,
      consoleProblems: [...problems],
      failedRequests: [...failedRequests],
      matchedErrors,
    });
    if (SHOTS) await shot(route.replace(/^\//, "").replace(/\//g, "_") || "root");
  }

  socket.close();
  chrome.kill();

  let failures = 0;
  for (const r of results) {
    const clean = r.consoleProblems.length === 0 && r.failedRequests.length === 0 && r.matchedErrors.length === 0;
    if (r.status !== 200 || !clean) failures += 1;
    console.log(`${clean && r.status === 200 ? "ok  " : "FAIL"} ${String(r.status).padEnd(3)} ${r.route}`);
    for (const p of r.consoleProblems.slice(0, 5)) console.log(`       ${p}`);
    for (const p of r.failedRequests.slice(0, 5)) console.log(`       ${p}`);
    for (const p of r.matchedErrors) console.log(`       ERROR TEXT ON PAGE: "${p}"`);
  }
  console.log(`\n${results.length - failures}/${results.length} routes clean`);
  process.exit(0);
}

async function waitForTarget() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const targets = await response.json();
      const page = targets.find((entry) => entry.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      // still starting
    }
    await sleep(400);
  }
  throw new Error("Chrome did not expose a debugging target");
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
