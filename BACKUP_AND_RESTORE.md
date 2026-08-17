# SpeedNum — Backup and Restore

> This document covers the original cron/shell-script backups only (VPS-local disk, no
> encryption, no desktop sync). A second, newer system — checksummed, versioned, synced and
> encrypted to an administrator's desktop, and the one with an actual tested restore-drill
> process — exists alongside it; see [`BACKUP_ARCHITECTURE.md`](BACKUP_ARCHITECTURE.md) for
> that one. Both currently run; they are independent copies, not alternatives to pick between.

## What's backed up, and how

| What | Script | Format | Schedule (UTC) |
|---|---|---|---|
| Postgres | `deploy/scripts/backup-postgres.sh` | `pg_dump --clean --if-exists`, gzipped | 03:00 daily |
| MinIO (all objects) | `deploy/scripts/backup-storage.sh` | `tar.gz` of the data directory | 03:15 daily |
| Health/backup freshness | `deploy/scripts/health-check.sh` | — | 03:30 daily |

Both backup scripts write to `/home/deploy/backups/speednum/`, filenames stamped with a UTC
timestamp (`postgres-20260815T232244Z.sql.gz`, `storage-20260815T232319Z.tar.gz`), and prune
anything past the last 14 days on every run. Installed via `crontab -l` on the VPS — **verify
this is still true after any VPS change**, since cron entries aren't tracked by this repo:

```bash
ssh deploy@2.25.108.16 crontab -l
```

Postgres backups use the `pg_dump` **standard SQL format** — a plain, portable dump readable
by any Postgres 16+ instance, not a Hostinger- or Docker-specific artifact. `pg_dump` connects
as the cluster's bootstrap superuser (`POSTGRES_USER`, not the app's own `POSTGRES_APP_USER`)
specifically so it can see and dump every object regardless of ownership — see
[`SECURITY.md`](SECURITY.md) for why the application itself does *not* connect this way.

## Verified — actually restored, not just backed up

Both restore scripts default to a **verification mode**: restore into a disposable container
(never the live one), check it, tear it down. Run this after every backup you'd actually rely
on:

```bash
./scripts/restore-postgres.sh /home/deploy/backups/speednum/postgres-<stamp>.sql.gz
./scripts/restore-storage.sh  /home/deploy/backups/speednum/storage-<stamp>.tar.gz
```

Both were exercised for real during this branch's work: a Postgres backup was restored into a
throwaway container and its table/`schema_migrations` row counts read back; a MinIO backup
(with a real test object uploaded first) was restored into a throwaway MinIO and the object
listed back by name. Neither is a "this should work" claim — both runs' actual output is in
`PROGRESS.md`'s Session 5 entry.

**A backup that has never been restored is not a backup — it's an assumption.** Re-run these
restore checks periodically, not just once.

## Restoring into the live system (destructive — reversible, but disruptive)

Both restore scripts also support a `--live` mode that overwrites the running database/storage.
This is deliberately harder to invoke by accident:

```bash
./scripts/restore-postgres.sh /path/to/backup.sql.gz --live --i-understand-this-overwrites-production
./scripts/restore-storage.sh  /path/to/backup.tar.gz --live --i-understand-this-overwrites-production
```

Both additionally prompt for a typed confirmation before doing anything. `restore-storage.sh`'s
live mode moves the *existing* data directory aside (timestamped, not deleted) before
extracting the backup, so a bad restore can itself be undone — check the application actually
works before removing that moved-aside copy.

## Offsite backup — status: **BLOCKED**, design ready

Backups currently exist **only on the VPS's own disk**. A VPS-level failure (disk failure,
account issue, accidental `docker compose down -v`) would destroy every local backup along
with the live data — this is not disaster recovery, it's a local snapshot.

`deploy/scripts/offsite-backup.sh` is written and ready (`rclone sync` + `rclone check` for
verification, matching the same "prove it, don't assume it" pattern as the restore scripts),
but **cannot run without a real destination and credentials**, which this environment does not
have. Recommended, low-cost destination: **Backblaze B2** (S3-compatible API, ~$6/TB/month,
no egress fee for the first 3x storage/month — cheap enough that cost isn't a reason to skip
this).

### One-time setup (for whoever has billing access)

1. Create a Backblaze B2 account and a private bucket, e.g. `speednum-backups`.
2. Create an "Application Key" scoped to just that bucket (not a master key).
3. On the VPS: `sudo apt install rclone` (or the install script at rclone.org), then
   `rclone config` → choose `s3` → provider `Other`/`Backblaze B2's S3-compatible endpoint` →
   paste the Application Key ID/Secret → name the remote `offsite`. rclone stores this in
   `~/.config/rclone/rclone.conf`, which contains the credential — treat it like any other
   secret file (not in this repo, mode 600, never committed).
4. Test manually: `cd /home/deploy/apps/speednum/deploy && ./scripts/offsite-backup.sh`.
5. Add to cron, after the local backups have a chance to complete:
   ```
   0 4 * * * cd /home/deploy/apps/speednum/deploy && ./scripts/offsite-backup.sh >> /home/deploy/backups/speednum/offsite-backup.log 2>&1
   ```

Until this is done, treat the current backup posture as **not yet disaster-recovery-complete**
— it protects against accidental deletion or a bad migration, not against losing the VPS
itself.

## Migratability

Everything above is deliberately portable:
- Postgres backups are standard `pg_dump` SQL, restorable to **any** Postgres 16+ instance,
  not just this one.
- MinIO backups are a filesystem tar of a single-node, no-erasure-coding data directory —
  restorable to any MinIO (or, with `mc mirror`, any other S3-compatible target) on a fresh
  host.
- Nothing here references the VPS's IP address or any Hostinger-specific API.

See [`MIGRATION.md`](MIGRATION.md) for the full procedure to move the whole stack, backups
included, to a different VPS or provider.
