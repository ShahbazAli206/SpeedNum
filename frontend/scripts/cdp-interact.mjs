/**
 * Interaction checks for the dropdown system and the pages rebuilt in this pass.
 *
 * The route sweep (cdp-check.mjs) proves pages render. This proves the parts you
 * have to *use*: that the listbox opens, is reachable by keyboard, exposes the
 * right ARIA, escapes an overflow-clipped table, and actually commits a value.
 *
 * Usage: node scripts/cdp-interact.mjs <baseUrl> [--shots <dir>]
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const BASE = process.argv[2] ?? "http://localhost:3111";
const shotsFlag = process.argv.indexOf("--shots");
const SHOTS = shotsFlag > -1 ? process.argv[shotsFlag + 1] : null;
const CHROME =
  process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9334;

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
    "--user-data-dir=" + (process.env.TEMP ?? "/tmp") + "/cdp-interact-profile",
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
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined) {
      pending.get(message.id)?.(message);
      pending.delete(message.id);
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

  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result?.exceptionDetails) {
      return { __error: result.exceptionDetails.exception?.description ?? "threw" };
    }
    return result?.result?.value;
  };

  const goto = async (path) => {
    await send("Page.navigate", { url: `${BASE}${path}` });
    await sleep(1600);
  };

  const key = async (keyName, code, keyCode) => {
    for (const type of ["keyDown", "keyUp"]) {
      await send("Input.dispatchKeyEvent", {
        type,
        key: keyName,
        code,
        windowsVirtualKeyCode: keyCode,
        nativeVirtualKeyCode: keyCode,
      });
    }
    await sleep(220);
  };

  const shot = async (name) => {
    if (!SHOTS) return;
    const data = await send("Page.captureScreenshot", { format: "png" });
    if (data?.data) writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data.data, "base64"));
  };

  if (SHOTS) mkdirSync(SHOTS, { recursive: true });

  /* ---------------------------------------------------------------- Select */
  await goto("/clients/new");

  const triggerCount = await evaluate(`document.querySelectorAll('[role="combobox"]').length`);
  check("new-client form renders listbox triggers", triggerCount >= 3, `${triggerCount} found`);

  const closedState = await evaluate(`
    (() => {
      const t = document.querySelectorAll('[role="combobox"]')[0];
      return { expanded: t.getAttribute('aria-expanded'), label: t.textContent.trim(),
               listboxes: document.querySelectorAll('[role="listbox"]').length };
    })()
  `);
  check("trigger starts collapsed", closedState.expanded === "false", `aria-expanded=${closedState.expanded}`);
  check("no listbox in the DOM while closed", closedState.listboxes === 0);

  await evaluate(`document.querySelectorAll('[role="combobox"]')[0].click()`);
  await sleep(400);

  const openState = await evaluate(`
    (() => {
      const t = document.querySelectorAll('[role="combobox"]')[0];
      const list = document.querySelector('[role="listbox"]');
      const panel = list ? list.closest('div[style*="position: fixed"]') : null;
      return {
        expanded: t.getAttribute('aria-expanded'),
        haspopup: t.getAttribute('aria-haspopup'),
        options: document.querySelectorAll('[role="option"]').length,
        selected: document.querySelectorAll('[role="option"][aria-selected="true"]').length,
        activedescendant: !!list && !!list.getAttribute('aria-activedescendant'),
        portaled: !!panel && panel.parentElement === document.body,
        fixed: !!panel,
      };
    })()
  `);
  check("opens on click", openState.expanded === "true");
  check("declares aria-haspopup=listbox", openState.haspopup === "listbox");
  check("renders its options", openState.options >= 4, `${openState.options} options`);
  check("marks exactly one option selected", openState.selected === 1);
  check("tracks aria-activedescendant", openState.activedescendant === true);
  check(
    "panel is portaled to <body> with fixed positioning",
    openState.portaled === true && openState.fixed === true,
  );
  await shot("select-open");

  // Keyboard: move down one and commit.
  const before = await evaluate(`document.querySelectorAll('[role="combobox"]')[0].textContent.trim()`);
  await key("ArrowDown", "ArrowDown", 40);
  await key("Enter", "Enter", 13);
  const after = await evaluate(`
    (() => {
      const t = document.querySelectorAll('[role="combobox"]')[0];
      return { label: t.textContent.trim(), expanded: t.getAttribute('aria-expanded'),
               focused: document.activeElement === t,
               listboxes: document.querySelectorAll('[role="listbox"]').length };
    })()
  `);
  check("ArrowDown+Enter selects the next option", after.label !== before, `${before} → ${after.label}`);
  check("closes after selection", after.expanded === "false");
  check("returns focus to the trigger", after.focused === true);
  check("unmounts the panel on close", after.listboxes === 0);

  // Escape closes without committing.
  await evaluate(`document.querySelectorAll('[role="combobox"]')[0].click()`);
  await sleep(300);
  const labelBeforeEscape = await evaluate(
    `document.querySelectorAll('[role="combobox"]')[0].textContent.trim()`,
  );
  await key("ArrowDown", "ArrowDown", 40);
  await key("Escape", "Escape", 27);
  const afterEscape = await evaluate(`
    (() => {
      const t = document.querySelectorAll('[role="combobox"]')[0];
      return { label: t.textContent.trim(), expanded: t.getAttribute('aria-expanded') };
    })()
  `);
  check("Escape closes the panel", afterEscape.expanded === "false");
  check("Escape does not commit a value", afterEscape.label === labelBeforeEscape);

  /* ------------------------------------------------- Select inside a table */
  await goto("/clients");
  const tableFilter = await evaluate(`
    (() => {
      const triggers = [...document.querySelectorAll('[role="combobox"]')];
      if (!triggers.length) return { none: true };
      triggers[0].click();
      return { opened: true, count: triggers.length };
    })()
  `);
  await sleep(400);
  const clipping = await evaluate(`
    (() => {
      const list = document.querySelector('[role="listbox"]');
      if (!list) return { missing: true };
      const panel = list.closest('div[style*="position: fixed"]');
      const rect = panel.getBoundingClientRect();
      // Fully inside the viewport, and not zero-sized from being clipped.
      return {
        inViewport: rect.top >= 0 && rect.left >= 0 &&
                    rect.bottom <= innerHeight + 1 && rect.right <= innerWidth + 1,
        height: Math.round(rect.height),
        width: Math.round(rect.width),
        onBody: panel.parentElement === document.body,
      };
    })()
  `);
  check("table filter dropdown opens", !tableFilter.none && !clipping.missing);
  check(
    "table dropdown is not clipped by the scroll container",
    clipping.inViewport === true && clipping.height > 40,
    `${clipping.width}×${clipping.height} at body=${clipping.onBody}`,
  );
  await shot("table-filter-open");

  /* ------------------------------------------------------------ Action menu */
  await goto("/users");
  await evaluate(`
    (() => {
      const t = [...document.querySelectorAll('[aria-haspopup="menu"]')]
        .find(b => (b.getAttribute('aria-label')||'').startsWith('Actions for'));
      if (t) t.click();
    })()
  `);
  await sleep(400);
  const menuState = await evaluate(`
    (() => {
      const menu = document.querySelector('[role="menu"]');
      if (!menu) return { missing: true };
      return {
        items: menu.querySelectorAll('[role="menuitem"]').length,
        separators: menu.querySelectorAll('[role="separator"]').length,
        onBody: menu.closest('div[style*="position: fixed"]')?.parentElement === document.body,
      };
    })()
  `);
  check("row action menu opens", !menuState.missing);
  check("row menu has its actions", menuState.items >= 3, `${menuState.items} items`);
  check("row menu is portaled", menuState.onBody === true);
  await shot("row-actions-open");

  /* ----------------------------------------------------------- Export menu */
  await goto("/team");
  await evaluate(`
    (() => {
      const t = [...document.querySelectorAll('[aria-haspopup="menu"]')]
        .find(b => (b.getAttribute('aria-label')||'') === 'Export rows');
      if (t) t.click();
    })()
  `);
  await sleep(400);
  const exportMenu = await evaluate(`
    (() => {
      const menu = document.querySelector('[role="menu"]');
      if (!menu) return { missing: true };
      return { labels: [...menu.querySelectorAll('[role="menuitem"]')].map(n => n.textContent.trim().split('\\n')[0]) };
    })()
  `);
  check(
    "export menu offers CSV and Excel",
    !exportMenu.missing && exportMenu.labels.some((l) => l.startsWith("CSV")) &&
      exportMenu.labels.some((l) => l.startsWith("Excel")),
    JSON.stringify(exportMenu.labels ?? []),
  );

  /* -------------------------------------------------------------- Reminders */
  await goto("/reminders");
  const reminders = await evaluate(`
    (() => ({
      heading: !!document.body.textContent.match(/Reminders?/i),
      overdue: document.body.textContent.includes('Overdue'),
      dueSoon: document.body.textContent.includes('Due soon'),
      unack: document.body.textContent.includes('Unacknowledged'),
      tenDay: /10 days? left/i.test(document.body.textContent),
      rows: document.querySelectorAll('button').length,
    }))()
  `);
  check("reminders page shows its triage tiles",
    reminders.overdue && reminders.dueSoon && reminders.unack);
  check("reminders include a 10-day-out warning", reminders.tenDay === true);
  await shot("reminders");

  /* ----------------------------------------------------------------- Bell */
  const bell = await evaluate(`
    (() => {
      // The firm bell is an <a> (it navigates to /notifications); the portal
      // bell is a <button> (it opens a panel). Match either.
      const b = [...document.querySelectorAll('button, a')]
        .find(n => (n.getAttribute('aria-label')||'').toLowerCase().includes('notification'));
      if (!b) return { missing: true };
      const blinking = !!b.querySelector('.animate-blink') || b.className.includes('animate-blink');
      const ring = !!b.querySelector('.animate-ring');
      return { label: b.getAttribute('aria-label'), blinking, ring };
    })()
  `);
  check("notification bell is present", !bell.missing, bell.label ?? "");
  check("bell blinks while unread", bell.blinking === true && bell.ring === true);

  /* --------------------------------------------------------------- Import */
  await goto("/import");
  const importPage = await evaluate(`
    (() => ({
      hasClientsTab: document.body.textContent.includes('Clients'),
      hasUsersTab: document.body.textContent.includes('Users & accountants'),
      hasDrop: !!document.body.textContent.match(/Drop your CSV or XLSX/i),
      // The old page shipped a hardcoded preview table; it must be gone.
      hardcoded: document.body.textContent.includes('Lakeview Dental Corp.') &&
                 document.body.textContent.includes('Ridgeway Hauling'),
      notConnected: /Import not connected/i.test(document.body.textContent),
    }))()
  `);
  check("importer offers both clients and users", importPage.hasClientsTab && importPage.hasUsersTab);
  check("importer shows a real drop zone", importPage.hasDrop === true);
  check("hardcoded fake preview is gone", importPage.hardcoded === false);
  check("'Import not connected' message is gone", importPage.notConnected === false);
  await shot("import");

  /* -------------------------------------------------------------- Services */
  await goto("/services");
  const services = await evaluate(`
    (() => ({
      addButton: [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Add service'),
      rowMenus: [...document.querySelectorAll('[aria-haspopup="menu"]')]
        .filter(b => (b.getAttribute('aria-label')||'').startsWith('Actions for')).length,
    }))()
  `);
  check("services page can add a service", services.addButton === true);
  check("services rows have an action menu", services.rowMenus > 0, `${services.rowMenus} rows`);
  await shot("services");

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
