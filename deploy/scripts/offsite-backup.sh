#!/usr/bin/env bash
# Pushes /home/deploy/backups/speednum to an offsite destination via rclone,
# so a VPS disk failure doesn't take the only copy of every backup with it.
#
# BLOCKED until rclone is configured with a real destination — see
# BACKUP_AND_RESTORE.md's "Offsite backup" section for the one-time setup
# (create a bucket with a provider, `rclone config`). This script assumes
# that's done and a remote named "offsite" exists; it does nothing
# destructive if it isn't — `rclone` simply fails with a clear error.
#
#   cd /home/deploy/apps/speednum/deploy && ./scripts/offsite-backup.sh
#
# Cron (daily at 04:00 — after the local backups at 03:00/03:15 and the
# health check at 03:30):
#   0 4 * * * cd /home/deploy/apps/speednum/deploy && ./scripts/offsite-backup.sh >> /home/deploy/backups/speednum/offsite-backup.log 2>&1
set -euo pipefail

readonly LOCAL_DIR="/home/deploy/backups/speednum"
readonly REMOTE="offsite:speednum-backups"

if ! command -v rclone >/dev/null 2>&1; then
  echo "error: rclone is not installed. See BACKUP_AND_RESTORE.md's 'Offsite backup' section." >&2
  exit 1
fi

if ! rclone listremotes | grep -q '^offsite:$'; then
  echo "error: no rclone remote named 'offsite' is configured. Run 'rclone config' first" >&2
  echo "       (see BACKUP_AND_RESTORE.md for the exact one-time setup)." >&2
  exit 1
fi

echo "==> Syncing ${LOCAL_DIR} to ${REMOTE}"
# --max-age bounds this to backups actually worth shipping offsite (the local
# retention prune in backup-*.sh already caps how many exist); sync (not
# copy) so a file deleted locally by the retention prune is deleted offsite
# too, rather than accumulating forever.
rclone sync "$LOCAL_DIR" "$REMOTE" \
  --max-age 15d \
  --transfers 4 \
  --log-level INFO

echo "==> Verifying: comparing local and remote file lists"
rclone check "$LOCAL_DIR" "$REMOTE" --max-age 15d
echo "==> Offsite sync verified."
