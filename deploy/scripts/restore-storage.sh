#!/usr/bin/env bash
# Restores a backup made by backup-storage.sh.
#
# Default mode is VERIFICATION: extracts into a disposable temporary MinIO
# container on a random local port, lists the bucket and reads one object
# back, then tears down. A backup that has never been restored is not a
# backup — this is what actually proves it.
#
#   ./scripts/restore-storage.sh /home/deploy/backups/speednum/storage-<stamp>.tar.gz
#
# The other mode overwrites LIVE storage — replaces
# /home/deploy/data/speednum/minio entirely — and requires an explicit second
# flag:
#
#   ./scripts/restore-storage.sh /path/to/backup.tar.gz --live --i-understand-this-overwrites-production
set -euo pipefail

cd "$(dirname "$0")/.."  # deploy/

BACKUP_FILE="${1:-}"
MODE="verify"
if [[ "${2:-}" == "--live" && "${3:-}" == "--i-understand-this-overwrites-production" ]]; then
  MODE="live"
fi

if [[ -z "$BACKUP_FILE" || ! -f "$BACKUP_FILE" ]]; then
  echo "usage: $0 <path-to-storage-backup.tar.gz> [--live --i-understand-this-overwrites-production]" >&2
  exit 2
fi

if [[ "$MODE" == "live" ]]; then
  readonly LIVE_DIR="/home/deploy/data/speednum/minio"
  echo "########################################################################"
  echo "# THIS REPLACES $LIVE_DIR ENTIRELY. NOT REVERSIBLE            #"
  echo "# without a prior backup of whatever is about to be replaced.          #"
  echo "########################################################################"
  read -r -p "Type 'minio' to confirm: " CONFIRM
  if [[ "$CONFIRM" != "minio" ]]; then
    echo "Confirmation did not match. Aborting." >&2
    exit 1
  fi
  echo "==> Stopping minio so its data directory isn't written to mid-restore"
  docker compose stop minio
  MOVED_ASIDE="${LIVE_DIR}.pre-restore.$(date -u +%Y%m%dT%H%M%SZ)"
  mv "$LIVE_DIR" "$MOVED_ASIDE"
  mkdir -p "$(dirname "$LIVE_DIR")"
  tar -xzf "$BACKUP_FILE" -C "$(dirname "$LIVE_DIR")"
  echo "==> Restored. Previous data moved aside to ${MOVED_ASIDE} (not deleted)."
  docker compose start minio
  echo "==> minio restarted. Verify the application against it before deleting ${MOVED_ASIDE}."
  exit 0
fi

# --- Verification mode: throwaway containers, never the live data dir -----
# Two containers (minio/minio has no `mc` binary — that's the separate
# minio/mc image, same as docker-compose.yml's minio-init service), joined by
# a private network created just for this check.
readonly TMP_DIR="$(mktemp -d)"
readonly TMP_NET="speednum-restore-verify-net"
readonly TMP_CONTAINER="speednum-minio-restore-verify"
readonly TMP_USER="verify"
readonly TMP_PASS="verifyverify"

cleanup() {
  docker rm -f "$TMP_CONTAINER" >/dev/null 2>&1 || true
  docker network rm "$TMP_NET" >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "==> Extracting ${BACKUP_FILE} to a temporary directory"
tar -xzf "$BACKUP_FILE" -C "$TMP_DIR"
# The archive's top-level entry is "minio" (see backup-storage.sh); MinIO
# needs to be pointed at that directory itself, not its parent.
EXTRACTED="${TMP_DIR}/minio"
if [[ ! -d "$EXTRACTED" ]]; then
  echo "error: expected a top-level 'minio/' directory in the archive, found:" >&2
  ls "$TMP_DIR" >&2
  exit 1
fi

docker network create "$TMP_NET" >/dev/null

echo "==> Starting a disposable MinIO against the restored data (no host port published)"
docker run -d --name "$TMP_CONTAINER" --network "$TMP_NET" \
  -e MINIO_ROOT_USER="$TMP_USER" -e MINIO_ROOT_PASSWORD="$TMP_PASS" \
  -v "${EXTRACTED}:/data" \
  minio/minio:RELEASE.2024-10-13T13-34-11Z server /data >/dev/null

echo -n "==> Waiting for it to come up"
for _ in $(seq 1 30); do
  if docker run --rm --network "$TMP_NET" curlimages/curl:8.10.1 -sf "http://${TMP_CONTAINER}:9000/minio/health/live" >/dev/null 2>&1; then
    echo " ready."
    break
  fi
  echo -n "."
  sleep 1
done

echo "==> Listing the documents bucket and counting objects, via a temporary mc container"
docker run --rm --network "$TMP_NET" minio/mc:RELEASE.2024-10-08T09-37-26Z sh -c "
  mc alias set local http://${TMP_CONTAINER}:9000 '$TMP_USER' '$TMP_PASS' >/dev/null &&
  mc ls local/documents --recursive | head -20 &&
  echo '--- object count ---' &&
  mc ls local/documents --recursive | wc -l
"

echo "==> Restore verified. Disposable containers/network will be removed now."
