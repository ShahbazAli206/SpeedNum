# Backup Architecture & Disaster Recovery

Two backup systems exist in this repo for historical reasons:

1. **Cron-based flat-file backups** (`deploy/scripts/{backup,restore}-{postgres,storage}.sh`,
   documented in [`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md)) — the original mechanism,
   still running, writes to the VPS's own disk.
2. **The in-app snapshot system** (this document) — `backend/app/services/backup_snapshots.py`
   + `backend/app/services/backup_scheduler.py` + `backend/app/routers/admin_backups.py`,
   added in commit `318cb04` and extended by the SpeedNum Desktop app (`desktop/`). This is the
   one the desktop app syncs and the one intended for real disaster recovery going forward —
   checksummed, versioned, and restorable to a machine that has never heard of this VPS.

Both currently run side by side. The cron scripts remain as a second, independent copy on the
same disk; they are not part of the desktop-sync/encryption/restore-drill story below.

## Format

One snapshot = one row in `backup_snapshots` (`db/migrations/0010_backup_tracking.sql`) plus
four objects in a dedicated MinIO `backups` bucket (never the `documents` bucket clients' files
live in):

```
<backups bucket>/<snapshot_id>/
  postgres.sql.gz       pg_dump --clean --if-exists --no-owner, gzip-compressed
  storage-delta.tar.gz  the MinIO objects new/changed since the parent snapshot (or all of
                         them, for a full snapshot)
  storage-index.json    every object's key/size/sha256, plus where to find it — "in this
                         delta" or "ref_snapshot: <parent id>" for an incremental snapshot
  config.json           a non-secret settings allow-list (see backup_snapshots.py's
                         _config_allowlist) — never credentials
  manifest.json         ties the above together: per-component object key, size, sha256
```

**The Postgres row is the trust root, not the MinIO object.** `GET /admin/backups/{id}`
re-hashes the manifest object and 409s if it doesn't match what the database recorded at
build time (`admin_backups.py`'s `get_manifest`) — a MinIO-level tamper without also
compromising Postgres is not enough to pass verification.

Full vs. incremental (`backup_snapshots.py::_decide_incremental`): the first snapshot, or one
below `BACKUP_INCREMENTAL_THRESHOLD_BYTES` (default 500 MiB) of total storage, is always full;
otherwise a content-hash diff against the parent decides what goes in `storage-delta.tar.gz`.
A synthetic full is forced every `BACKUP_SYNTHETIC_FULL_EVERY_N` snapshots (default 30) so a
restore chain never depends on an unbounded number of ancestor archives. **Postgres itself is
always fully dumped every run** — only the MinIO object archive is ever incremental.

Scheduling: `backup_scheduler.py` runs once daily at `BACKUP_SCHEDULER_HOUR` UTC (default 03:00),
guarded by a Postgres advisory lock so exactly one worker fires per tick across
`WEB_CONCURRENCY` replicas. `POST /admin/backups/run` (superadmin-only) triggers one on demand.

## Encryption

**The server-side snapshot itself is not encrypted at rest in MinIO** — `manifest.json`
declares an `ENCRYPTION_METADATA_VERSION` constant that was never wired up
(`backup_snapshots.py`), so server-side storage relies on MinIO's own access control plus
TLS-in-transit (presigned HTTPS URLs) rather than envelope encryption of the objects
themselves. This is a known, accepted gap for this pass — closing it would mean either
encrypting each component before upload (adding a key-management problem on the server side
that the desktop app's own encryption already solves for the copy that actually leaves the
VPS) or accepting the added operational complexity for comparatively little benefit given
MinIO already sits behind the same network boundary as Postgres.

**The desktop app's local copy is encrypted** (`desktop/src/crypto-envelope.js`) — this is the
copy actually leaving the VPS's blast radius, so it's the one this pass prioritized. AES-256-GCM,
streamed (no full-file buffering — the storage archive component can be large), key derived via
scrypt from a backup password the administrator supplies and that is **never written anywhere**,
combined with a random per-file salt so the same password never produces the same ciphertext
twice. File layout:

```
[4B magic "SNBK"][1B version][1B kdf id][16B salt][12B iv]   -- header
<ciphertext, streamed>
[16B GCM auth tag]                                            -- footer
```

The auth tag goes at the end because it can only be computed after every ciphertext byte
exists. Any tampering, truncation, or wrong password makes `decryptFile` throw before any
plaintext byte is trusted — verified by 9 unit tests including bit-flip and truncation cases
(`desktop/test/crypto-envelope.test.js`).

**Losing the backup password means losing the backup** — there is no recovery path by design;
a recoverable key would defeat the point of a password only the administrator holds. The
refresh token used to talk to the backend is a separate, unrelated secret, held via Electron's
`safeStorage` (OS keychain/DPAPI) — see `desktop/src/secure-store.js`.

## VPS → Desktop Sync

`desktop/src/sync.js`, one run:

```
list snapshots → pick the latest "ready" one not yet fully local
  → for each of 4 components:
      presigned URL → stream-download to a .partial staging dir, hashing as it streams
      → verify against the manifest's sha256 (mismatch: discard, fail the whole run)
      → encrypt the verified plaintext → delete the plaintext
  → once every component is down and verified: rename .partial → the real snapshot dir
  → POST /admin/backups/{id}/ack-download
```

Safety properties (12 tests in `desktop/test/sync.test.js`, plus a live run against production
recorded in the 2026-08-17 session report):

- **Idempotent** — re-running when the latest snapshot is already local is a no-op; no
  re-download, no redundant ack.
- **Atomic per snapshot** — a snapshot's directory is only ever written once, under its real
  name, after every component is verified. A crash or checksum failure mid-download leaves an
  orphaned `.partial` directory, never a corrupt backup masquerading as a good one, and never
  touches any *other* snapshot's already-completed directory.
- **Plaintext never survives** past the moment its encrypted copy exists on disk.
- **Offline-safe** — a failed sync (VPS unreachable, network error) records `lastSyncStatus:
  "failed"` in the local JSON state file (written atomically: temp file + rename) without
  touching any previously-synced snapshot.

Sync runs on an interval the administrator configures in the desktop app (`syncIntervalMinutes`
in the state file; `sync.scheduleSync`), or on demand via "Sync now."

## Restore Drill

`desktop/src/restore-drill.js` proves a downloaded backup is actually restorable, not just
present on disk — it never touches the production VPS:

```
disposable postgres:16 container (fresh volume, isolated Docker network)
  → create the speednum_app role
  → gunzip + restore postgres.sql.gz
  → GRANT ALL ON ALL TABLES/SEQUENCES IN SCHEMA public TO speednum_app   ← see below
  → verify row counts (tenants, etc.)
  → boot a scratch speednum-api container against the restored DB
  → (optional) a real login attempt against the restored data
  → tear everything down
```

The result (`{ok, detail}`) is reported back to the server via
`POST /admin/backups/{id}/restore-drill`, which only *records* the outcome — the server never
runs or triggers a restore itself (see `admin_backups.py`'s own docstring: "a 'restore to this
VPS' button does not exist over HTTP at all").

### A real gap this found

The first live drill against a real production snapshot (2026-08-17) failed at the API-boot
step with `permission denied for table rate_limit_hits`. Root cause: `pg_dump --no-owner`
does not reliably carry every privilege the app's non-superuser role needs — some are granted
once, out-of-band, via `ALTER DEFAULT PRIVILEGES` when the role was first set up, which
pg_dump has no way to know about. **The fix is applied automatically, every drill, not left as
a manual runbook step**: `restore-drill.js` always runs
`GRANT ALL ON ALL TABLES/SEQUENCES IN SCHEMA public TO speednum_app` immediately after loading
the dump, before anything else touches the restored database. A manual restore (see below)
must do the same.

## Disaster Recovery: Restoring to a Fresh VPS

1. Provision a new VPS, install Docker + Docker Compose, clone this repo.
2. Bring up disposable `postgres:16` and `minio` containers (or the real `deploy/`
   Compose stack with the `api` service not yet started).
3. `create role speednum_app with login password '<new password>';`
4. `gunzip -c postgres.sql.gz | psql -U postgres -d speednum`
5. **`GRANT ALL ON ALL TABLES IN SCHEMA public TO speednum_app; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO speednum_app;`** — do not skip this; see above.
6. Restore `storage-delta.tar.gz`'s objects into MinIO's `documents` bucket, using
   `storage-index.json` to resolve keys that reference a parent snapshot on an incremental
   restore (walk the parent chain, oldest first).
7. Set fresh, server-specific secrets — **do not restore these from any snapshot component**,
   `config.json` is deliberately an allow-list of non-secret settings only:
   - `JWT_PRIVATE_KEY` (a fresh key invalidates every existing session — expected)
   - `SMTP_PASSWORD`, `GOOGLE_CLIENT_SECRET`, `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`
   - TLS certificates (Caddy provisions its own via Let's Encrypt on first boot)
   - `POSTGRES_APP_PASSWORD` (whatever you set the `speednum_app` role's password to in step 3)
8. Start the `api` service pointed at the restored database, run `docker compose run --rm
   migrate status` to confirm the schema matches what this repo expects.
9. Verify: log in as a real account, confirm tenant/client data is present.

This exact sequence (minus provisioning an actual second VPS — a disposable Docker stack on
the existing VPS was used instead, per this pass's scope) was run for real against a real
production snapshot on 2026-08-17: 3 tenants, 5 profiles, 2 clients restored and verified, a
real login succeeded against the restored data. See the session's final report for the full
transcript.

## Known Gaps / Future Work

- Server-side snapshot components are not encrypted at rest in MinIO (see Encryption above).
- No automated retention/pruning is wired up yet — `backup_audit_log`'s `prune` action exists
  in the schema but nothing calls it.
- The desktop app's restore drill requires Docker on the administrator's machine; it has not
  been packaged as a signed, distributable installer.
- Incremental sync is per-object (MinIO storage delta only); the Postgres component is always
  a full dump, so sync bandwidth doesn't shrink as the database grows, only as the document
  store's *rate of change* shrinks relative to its total size.
