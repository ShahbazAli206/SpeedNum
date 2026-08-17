# SpeedNum Desktop

An admin desktop app whose primary job is disaster recovery: sync encrypted backup snapshots
from the VPS to the administrator's own machine, and prove they're actually restorable. It is
**not** a re-implementation of the web admin dashboard — clients, invoices, users, reports,
imports, and settings all still live in the existing Next.js app. See
[`desktop/README.md`](desktop/README.md) for how to run and test it, and
[`BACKUP_ARCHITECTURE.md`](BACKUP_ARCHITECTURE.md) for the backup format/encryption/sync design
this app implements.

## Why Electron, not Tauri

Tauri was the starting preference — smaller binaries, no bundled Chromium, and Rust for the
parts that touch the filesystem and Docker. It was not used because **this development
environment has no Rust or MSVC toolchain**, and installing one non-interactively on Windows
(rustup, several GB of Visual Studio Build Tools, no GUI available for the parts of that
installer that expect one) was impractical within this pass. Electron's toolchain is Node.js,
which was already present and working. This is a concrete practicality constraint of the
environment this was built in, not a judgment that Tauri is the wrong long-term choice — if a
future pass has a working Rust toolchain available, a Tauri rewrite of this same module
boundary (the `src/*.js` files are already framework-agnostic Node modules; only `main.js`,
`preload.js`, and `renderer/` are Electron-specific) is a reasonable next step.

## Architecture

```
SpeedNum Desktop (Electron)
      │ HTTPS only
      ▼
https://test.spidnums.com  (same FastAPI backend every other client uses)
      │
      ├──▶ Postgres   (never touched directly — no Postgres credential ever reaches this app)
      └──▶ MinIO      (never touched directly — only via presigned URLs the backend issues)
```

The desktop app authenticates like any other client (`POST /auth/login`) and only additionally
calls the six superadmin-only `/admin/backups/*` endpoints
(`backend/app/routers/admin_backups.py`). It never receives a Postgres or MinIO admin
credential — see `backend/README.md`'s architecture diagram for how those stay backend-only.

### Module boundary (`desktop/src/`)

| Module | Responsibility | Network/Docker access |
|---|---|---|
| `crypto-envelope.js` | Streaming AES-256-GCM encrypt/decrypt | None |
| `backup-client.js` | The only code that calls the SpeedNum backend | HTTPS to the backend |
| `sync.js` | Orchestrates one sync run (download, verify, encrypt, publish) | Via `backup-client.js` |
| `sync-state.js` | Local JSON state, atomic writes | Local disk only |
| `restore-drill.js` | Restores a decrypted snapshot into disposable Docker containers | Local `docker` CLI |
| `secure-store.js` | Wraps Electron's `safeStorage` (OS keychain/DPAPI) for the refresh token | Local OS keychain |
| `main.js` / `preload.js` / `renderer/` | The Electron shell and its IPC surface | — |

### Security model

- **HTTPS only** to the backend — enforced in `main.js`'s login handler, not just a convention.
- **Superadmin-gated at the app layer too** — the desktop app's own login handler refuses a
  successful backend login if the account isn't `is_superadmin`, on top of the backend already
  enforcing this on every `/admin/backups/*` call. Belt and suspenders: the backend is the real
  boundary, but failing fast in the app gives a clearer error than a string of 403s.
- **`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`** — the renderer (the
  HTML/CSS/JS in `renderer/`) never has direct Node or Electron API access. `preload.js` exposes
  a fixed, named set of IPC calls via `contextBridge`; there is no path from the renderer to an
  arbitrary filesystem read/write or to spawning a process.
- **No plaintext secret at rest.** The refresh token is the only credential persisted locally,
  and it goes through `safeStorage`, which is backed by the OS's own credential store. The
  backup encryption key is never persisted at all — it's derived fresh from the administrator's
  password every time a file is encrypted or decrypted.
- **A compromised desktop app can only do what a compromised superadmin browser session could
  already do** — list/trigger/download backups, report drill results. It cannot restore *to*
  the live VPS (no such endpoint exists over HTTP at all, by the backend's own design) and
  cannot read or write arbitrary application data (no CRUD endpoints beyond `/admin/backups/*`
  and the same `/auth/*` surface every client uses).

## What's real vs. what's scoped out of this pass

**Real, live-tested (see the 2026-08-17 session report for full output):**
- Login, snapshot listing, triggering a server-side backup, downloading + checksum-verifying +
  encrypting all four snapshot components, and acking the download — all run for real against
  production through the actual Electron GUI (Playwright-driven, screenshotted).
- A real restore drill: a real snapshot decrypted, restored into disposable Postgres, and a
  real login succeeded against the restored data. This surfaced and fixed a real gap (see
  BACKUP_ARCHITECTURE.md's "A real gap this found").
- 12 automated tests (`desktop/test/`) covering the crypto envelope and the sync pipeline's
  atomicity/idempotency/checksum-failure behavior.

**Scoped out of this pass, left as documented future work:**
- Full feature parity with the web admin dashboard (clients, invoices, reports, imports,
  settings) — this app's scope is backup/sync/restore-drill plus a read-only snapshot list.
- A signed, distributable installer (currently run via `npm start` from source).
- Automating the restore-drill's Docker orchestration inside the Electron GUI end-to-end in an
  environment with a working Docker install — `restore-drill.js` mirrors an exact sequence
  already proven manually against the VPS's Docker (this development sandbox has no local
  Docker), but the module itself was not exercised as a black box by the GUI in this session.
- A Tauri rewrite (see "Why Electron, not Tauri" above).
