/**
 * Exercises real CRUD flows against the live test backend (not just page
 * loads): create a client, add a custom field, save firm branding. Reuses
 * the same-origin dev proxy set up for local QA (see next.config.ts /
 * lib/api.ts TEMP QA-ONLY comments).
 *
 * Usage: node scripts/qa-functional.mjs <baseUrl> <email> <password> [--shots <dir>]
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const BASE = process.argv[2] ?? "http://localhost:3111";
const EMAIL = process.argv[3];
const PASSWORD = process.argv[4];
const shotsFlag = process.argv.indexOf("--shots");
const SHOTS = shotsFlag > -1 ? process.argv[shotsFlag + 1] : null;
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9338;

const checks = [];
function check(name, passed, detail = "") {
  checks.push({ name, passed, detail });
  console.log(`${passed ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--user-data-dir=" + (process.env.TEMP ?? "/tmp") + "/qa-functional-profile-" + process.pid,
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
  const consoleErrors = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined) {
      pending.get(message.id)?.(message);
      pending.delete(message.id);
      return;
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      consoleErrors.push(message.params.args.map((a) => a.value ?? a.description ?? "").join(" "));
    }
    if (message.method === "Network.responseReceived" && /custom-fields/i.test(message.params.response.url)) {
      lastCustomFieldResponse = { status: message.params.response.status, url: message.params.response.url };
    }
  });
  let lastCustomFieldResponse = null;
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++nextId;
      pending.set(id, (message) => resolve(message.result ?? message.error));
      socket.send(JSON.stringify({ id, method, params }));
    });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");

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
  const setVal = (selector, val) => `
    (() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { missing: true };
      const proto = Object.getPrototypeOf(el);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, ${JSON.stringify(val)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return { missing: false };
    })()
  `;

  if (SHOTS) mkdirSync(SHOTS, { recursive: true });

  /* -------------------------------------------------------------- Login */
  await goto("/login");
  {
    await evaluate(`
      (() => {
        const setVal = (el, val) => {
          const proto = Object.getPrototypeOf(el);
          const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
          setter.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        setVal(document.querySelector('input[type="email"]'), ${JSON.stringify(EMAIL)});
        setVal(document.querySelector('input[type="password"]'), ${JSON.stringify(PASSWORD)});
      })()
    `);
    await sleep(200);
    await evaluate(`
      (() => {
        const btn = [...document.querySelectorAll('button')].find(b => /sign in/i.test(b.textContent||""));
        if (btn) btn.click();
      })()
    `);
    let loggedInAt = "/login";
    for (let attempt = 0; attempt < 15; attempt += 1) {
      await sleep(500);
      loggedInAt = await evaluate(`location.pathname`);
      if (loggedInAt !== "/login") break;
    }
    check("logged in and landed on a firm page", loggedInAt !== "/login", loggedInAt);
  }

  /* --------------------------------------------------------- Add client */
  const suffix = process.argv[5] ?? "Alpha";
  const clientName = `QA Test Client ${suffix}`;
  await goto("/clients/new");
  await evaluate(setVal('input[placeholder="Maple Retail Co."]', clientName));
  await evaluate(setVal('input[placeholder="accounts@company.ca"]', `accounts+${suffix.toLowerCase()}@qatestclient.example`));
  await evaluate(setVal('input[type="date"]', "2026-12-31"));
  await shot("client-form-filled");

  consoleErrors.length = 0;
  await evaluate(`
    (() => {
      const btn = [...document.querySelectorAll('button[type="submit"]')].find(b => /create client/i.test(b.textContent||""));
      if (btn) btn.click();
    })()
  `);
  await sleep(2200);
  const afterCreate = await evaluate(`({ url: location.pathname, error: (document.querySelector('[role="alert"]')||{}).textContent || null })`);
  check("client creation did not stay on an error", !afterCreate.error, JSON.stringify(afterCreate));
  await shot("after-client-create");

  await goto("/clients");
  const clientListed = await evaluate(`document.body.textContent.includes(${JSON.stringify(clientName)})`);
  check("new client appears in the clients list", clientListed === true);
  await shot("clients-list");

  /* ------------------------------------------------------- Custom field */
  await goto("/custom-fields");
  await evaluate(`
    (() => {
      const btn = [...document.querySelectorAll('button')].find(b => /add (custom )?field/i.test(b.textContent||""));
      if (btn) btn.click();
    })()
  `);
  await sleep(700);
  const fieldLabel = `QA Field ${suffix}`;
  const labelFilled = await evaluate(setVal('input[placeholder="e.g. Referred by"]', fieldLabel));
  check("found the custom field label input", labelFilled?.missing === false, JSON.stringify(labelFilled));
  await shot("custom-field-form");
  consoleErrors.length = 0;
  lastCustomFieldResponse = null;
  await evaluate(`
    (() => {
      const candidates = [...document.querySelectorAll('button')].filter(b => (b.textContent||"").trim() === "Add field");
      const btn = candidates.find(b => b.closest('[role="dialog"]')) ?? candidates.at(-1);
      if (btn) btn.click();
    })()
  `);
  await sleep(1500);
  const afterField = await evaluate(`({
    stillOpen: !!document.querySelector('[role="dialog"]'),
    firmError: document.body.textContent.includes('No firm is linked'),
    bodyHasLabel: document.body.textContent.includes(${JSON.stringify(fieldLabel)}),
  })`);
  check(
    "custom field POST succeeded (2xx)",
    !!lastCustomFieldResponse && lastCustomFieldResponse.status < 300,
    JSON.stringify(lastCustomFieldResponse),
  );
  check("custom field save did not hit 'no firm linked' error", afterField.firmError === false, JSON.stringify(afterField));
  await shot("after-custom-field");

  /* -------------------------------------------------------------- Settings */
  await goto("/settings");
  const settingsError = await evaluate(`document.body.textContent.includes('No firm is linked')`);
  check("settings page has no 'no firm linked' error", settingsError === false);
  await evaluate(`
    (() => {
      const btn = [...document.querySelectorAll('button')].find(b => /save branding/i.test(b.textContent||""));
      if (btn) btn.click();
    })()
  `);
  await sleep(1200);
  const afterSettingsSave = await evaluate(`({
    couldntSave: document.body.textContent.includes("Couldn't save branding"),
    firmError: document.body.textContent.includes('No firm is linked'),
  })`);
  check("save branding succeeds", afterSettingsSave.couldntSave === false && afterSettingsSave.firmError === false, JSON.stringify(afterSettingsSave));
  await shot("after-settings-save");

  check("no console errors accumulated in final steps", consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 5)));

  socket.close();
  chrome.kill();

  const failed = checks.filter((c) => !c.passed);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  process.exit(failed.length === 0 ? 0 : 1);
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
