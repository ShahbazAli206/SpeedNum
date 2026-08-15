#!/usr/bin/env bash
# Backs up MinIO's data directory to /home/deploy/backups/speednum, tarred
# and gzipped, then prunes anything past the retention count.
#
#   cd /home/deploy/apps/speednum/deploy && ./scripts/backup-storage.sh
#
# Filesystem-level, not `mc mirror`: this MinIO runs single-node with no
# erasure coding, so its on-disk layout under /home/deploy/data/speednum/minio
# *is* the bucket — a tar of it is a complete, restorable backup, and avoids
# downloading-then-reuploading every object through the S3 API. Taken live
# (no downtime), which trades a small chance of catching an object mid-write
# for not stopping the service daily; MinIO's writes are per-object atomic
# (write to a temp part file, then rename), so a live tar is safe practice
# for this deployment's scale.
#
# Cron (daily at 03:15 — after backup-postgres.sh's 03:00, so they don't
# contend for disk I/O at the same moment):
#   15 3 * * * cd /home/deploy/apps/speednum/deploy && ./scripts/backup-storage.sh >> /home/deploy/backups/speednum/backup.log 2>&1
set -euo pipefail

readonly DATA_DIR="/home/deploy/data/speednum/minio"
readonly BACKUP_DIR="/home/deploy/backups/speednum"
readonly KEEP=14
readonly STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
readonly OUT="${BACKUP_DIR}/storage-${STAMP}.tar.gz"

if [[ ! -d "$DATA_DIR" ]]; then
  echo "error: $DATA_DIR does not exist — is MinIO deployed?" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

echo "==> Archiving ${DATA_DIR} to ${OUT}"
tar -czf "$OUT" -C "$(dirname "$DATA_DIR")" "$(basename "$DATA_DIR")"

SIZE="$(du -h "$OUT" | cut -f1)"
echo "==> Wrote ${OUT} (${SIZE})"

echo "==> Pruning backups beyond the last ${KEEP}"
ls -1t "${BACKUP_DIR}"/storage-*.tar.gz 2>/dev/null | tail -n "+$((KEEP + 1))" | xargs -r rm -f || true

echo "==> Current backups:"
ls -lh "${BACKUP_DIR}"/storage-*.tar.gz 2>/dev/null | tail -n "$KEEP"
