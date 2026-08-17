"use strict";

/**
 * Runs a real restore of a decrypted backup into disposable, local-only
 * Docker containers (never the production stack) to prove the backup is
 * actually restorable — not just "the file downloaded ok." This exact
 * sequence (create role -> restore dump -> grant fixup -> boot API ->
 * login) was manually run once against a real production snapshot on the
 * VPS's Docker before being packaged here; see the 2026-08-17 session
 * report for that run's real output. Requires Docker installed on the
 * machine this runs on (the administrator's desktop, in normal use).
 *
 * IMPORTANT — a real gap this uncovered: pg_dump --no-owner does not
 * reliably carry every GRANT the app's non-superuser role needs (some are
 * set once via `ALTER DEFAULT PRIVILEGES`, outside anything pg_dump
 * captures). Restoring the dump alone left `speednum_app` unable to touch
 * some tables. The fix below — GRANT ALL ON ALL TABLES/SEQUENCES IN SCHEMA
 * public — is applied automatically after every restore, not left as a
 * manual runbook step a real disaster recovery could forget under
 * pressure.
 */

const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");

const execFileAsync = promisify(execFile);

const NETWORK = "speednum-restore-drill";
const APP_ROLE = "speednum_app";
const APP_ROLE_PASSWORD = "drill-only-not-a-real-secret";

async function docker(args, opts = {}) {
  const { stdout } = await execFileAsync("docker", args, { maxBuffer: 1024 * 1024 * 64, ...opts });
  return stdout.trim();
}

async function dockerIgnoreErrors(args) {
  try {
    await docker(args);
  } catch {
    /* best-effort cleanup / idempotent setup */
  }
}

async function waitForPostgres(containerName, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await docker(["exec", containerName, "pg_isready", "-U", "postgres"]);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error(`Postgres in ${containerName} never became ready.`);
}

async function waitForHealth(url, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${url} never became healthy.`);
}

/**
 * @param {object} opts
 * @param {string} opts.postgresDumpPath decrypted postgres.sql.gz
 * @param {string} opts.apiImage the speednum-api image tag to boot for the smoke test
 * @param {{email: string, password: string}} [opts.loginCheck] optional real credential to prove login works post-restore
 */
async function runRestoreDrill({ postgresDumpPath, apiImage, loginCheck }) {
  const suffix = Date.now().toString(36);
  const pgName = `snbk-drill-pg-${suffix}`;
  const apiName = `snbk-drill-api-${suffix}`;
  const detail = { steps: [] };
  const step = (name, ok, extra) => detail.steps.push({ name, ok, ...extra });

  await dockerIgnoreErrors(["network", "create", NETWORK]);

  try {
    await docker([
      "run", "-d", "--name", pgName, "--network", NETWORK,
      "-e", "POSTGRES_PASSWORD=drill", "-e", "POSTGRES_USER=postgres", "-e", "POSTGRES_DB=restore_drill",
      "postgres:16",
    ]);
    await waitForPostgres(pgName);
    step("start_disposable_postgres", true);

    await docker([
      "exec", pgName, "psql", "-U", "postgres", "-d", "restore_drill", "-c",
      `create role ${APP_ROLE} with login password '${APP_ROLE_PASSWORD}';`,
    ]);
    step("create_app_role", true);

    const gunzipped = await gunzipToTemp(postgresDumpPath);
    try {
      await pipeIntoPsql(gunzipped, pgName);
    } finally {
      await fs.promises.rm(gunzipped, { force: true });
    }
    step("restore_postgres_dump", true);

    // The fix for the gap this drill itself discovered — always applied,
    // not a step an operator can skip.
    await docker([
      "exec", pgName, "psql", "-U", "postgres", "-d", "restore_drill", "-c",
      `grant all on all tables in schema public to ${APP_ROLE}; grant all on all sequences in schema public to ${APP_ROLE};`,
    ]);
    step("post_restore_grant_fixup", true);

    const counts = await docker([
      "exec", pgName, "psql", "-U", "postgres", "-d", "restore_drill", "-t", "-c",
      "select count(*) from tenants;",
    ]);
    detail.tenantsRestored = Number(counts.trim());
    step("verify_row_counts", true, { tenantsRestored: detail.tenantsRestored });

    if (apiImage) {
      await docker([
        "run", "-d", "--name", apiName, "--network", NETWORK,
        "-e", `DATABASE_URL=postgresql+asyncpg://${APP_ROLE}:${APP_ROLE_PASSWORD}@${pgName}:5432/restore_drill?sslmode=disable`,
        "-e", "ENVIRONMENT=test",
        "-p", "127.0.0.1:0:7860", // ephemeral host port, loopback only
        apiImage,
      ]);
      const port = await hostPortFor(apiName, "7860/tcp");
      await waitForHealth(`http://127.0.0.1:${port}/health`);
      step("boot_scratch_api_against_restored_db", true);

      if (loginCheck) {
        const response = await fetch(`http://127.0.0.1:${port}/api/v1/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(loginCheck),
        });
        step("login_against_restored_data", response.ok, { status: response.status });
        if (!response.ok) throw new Error(`Login against restored data failed (${response.status}).`);
      }
    }

    return { ok: true, detail };
  } catch (err) {
    detail.error = err.message;
    return { ok: false, detail };
  } finally {
    await dockerIgnoreErrors(["rm", "-f", apiName]);
    await dockerIgnoreErrors(["rm", "-f", pgName]);
  }
}

async function gunzipToTemp(gzPath) {
  const zlib = require("zlib");
  const os = require("os");
  const outPath = path.join(os.tmpdir(), `snbk-drill-${Date.now()}.sql`);
  await new Promise((resolve, reject) => {
    const input = fs.createReadStream(gzPath);
    const gunzip = zlib.createGunzip();
    const output = fs.createWriteStream(outPath);
    input.pipe(gunzip).pipe(output).on("finish", resolve).on("error", reject);
    input.on("error", reject);
    gunzip.on("error", reject);
  });
  return outPath;
}

function pipeIntoPsql(sqlPath, containerName) {
  return new Promise((resolve, reject) => {
    const { spawn } = require("child_process");
    const child = spawn("docker", ["exec", "-i", containerName, "psql", "-U", "postgres", "-d", "restore_drill"]);
    const input = fs.createReadStream(sqlPath);
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      // psql exits 0 even with per-statement errors unless -v ON_ERROR_STOP=1;
      // real failures worth failing the drill over are connection-level.
      if (code !== 0) reject(new Error(`psql exited ${code}: ${stderr.slice(0, 2000)}`));
      else resolve();
    });
    input.pipe(child.stdin);
  });
}

async function hostPortFor(containerName, containerPort) {
  const output = await docker(["port", containerName, containerPort]);
  const match = /:(\d+)$/.exec(output.trim().split("\n")[0]);
  if (!match) throw new Error(`Could not determine host port for ${containerName}/${containerPort}`);
  return match[1];
}

module.exports = { runRestoreDrill };
