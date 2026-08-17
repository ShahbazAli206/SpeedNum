# SpeedNum Desktop

An Electron admin desktop app whose primary job is disaster-recovery: sync
encrypted backup snapshots from the VPS to the administrator's local disk,
and prove they're actually restorable via a local restore drill. See
`../DESKTOP.md` at the repo root for the full architecture and rationale
(including why Electron rather than Tauri for this pass).

## Run it

```bash
cd desktop
npm install
npm start
```

Sign in with a **platform superadmin** account — the backup endpoints
(`/admin/backups/*`) refuse anyone else, and so does this app's login check.

## Test it

```bash
npm test
```

Runs the crypto envelope and sync-pipeline tests (`node --test`) — pure
logic against a fake HTTP layer standing in for the backend, no live server
or Docker needed. These passed 12/12 as of the 2026-08-17 session; the real
backend contract was additionally exercised live against production in that
same session (see the session's final report for that run's actual output).

## Modules

- `src/crypto-envelope.js` — streaming AES-256-GCM file encryption (scrypt
  key derivation from a user-supplied backup password). Never touches the
  network.
- `src/backup-client.js` — the only code that talks to the SpeedNum
  backend's `/admin/backups/*` endpoints and `/auth/*`.
- `src/sync.js` — orchestrates one sync run: list -> manifest -> download
  -> checksum-verify -> encrypt -> atomic publish -> ack.
- `src/sync-state.js` — local JSON state, written atomically (temp file +
  rename).
- `src/restore-drill.js` — spins up disposable Docker containers, restores
  a decrypted snapshot into them, boots a scratch API against it, and
  reports the result back to the server. **Requires Docker** on whatever
  machine runs this.
- `src/secure-store.js` — wraps Electron's `safeStorage` (OS keychain/DPAPI)
  for the one secret worth protecting at rest: the refresh token.
- `src/main.js` / `src/preload.js` / `renderer/` — the Electron shell and
  its (deliberately small) IPC surface.

## What this app does *not* do

It is not a re-implementation of the web admin dashboard. Clients,
invoices, users, reports, imports, and settings all still live in the
existing Next.js app. This app's scope is backup/sync/restore-drill plus a
read-only snapshot list — extending it to full CRUD parity is a separate,
much larger effort tracked as future work in `../DESKTOP.md`.
