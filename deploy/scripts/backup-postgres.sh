#!/usr/bin/env bash
# Dumps the live database to /home/deploy/backups/speednum, gzipped, then
# prunes anything past the retention count. Safe to run on a live database —
# pg_dump takes a consistent snapshot without blocking writers.
#
#   cd /home/deploy/apps/speednum/deploy && ./scripts/backup-postgres.sh
#
# Cron (daily at 03:00, keeping this script's own log so a failure is visible
# without a human having to remember to check):
#   0 3 * * * cd /home/deploy/apps/speednum/deploy && ./scripts/backup-postgres.sh >> /home/deploy/backups/speednum/backup.log 2>&1
set -euo pipefail

cd "$(dirname "$0")/.."  # deploy/

if [[ ! -f .env ]]; then
  echo "error: deploy/.env is missing. Copy .env.example to .env and fill it in." >&2
  exit 1
fi

# .env is not shell-sourceable as-is if any value ever contains special
# characters, but every value here is a generated hex/alphanumeric secret, so
# a plain source is fine and avoids depending on `docker compose config`
# parsing just to read two variables.
# shellcheck disable=SC1091
set -a; source .env; set +a

readonly BACKUP_DIR="/home/deploy/backups/speednum"
readonly KEEP=14
readonly STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
readonly OUT="${BACKUP_DIR}/postgres-${STAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "==> Dumping ${POSTGRES_DB:-speednum} to ${OUT}"
# --clean --if-exists so restore-postgres.sh's target database can be
# re-restored into idempotently (a second restore drops-and-recreates rather
# than erroring on existing objects).
docker compose exec -T postgres pg_dump \
  -U "${POSTGRES_USER:-speednum}" \
  --clean --if-exists \
  "${POSTGRES_DB:-speednum}" \
  | gzip > "$OUT"

SIZE="$(du -h "$OUT" | cut -f1)"
echo "==> Wrote ${OUT} (${SIZE})"

echo "==> Pruning backups beyond the last ${KEEP}"
# List newest-first, keep the first $KEEP, delete the rest. `|| true` on an
# empty tail output (fewer than KEEP backups exist yet) so this never fails
# the script on a young install.
ls -1t "${BACKUP_DIR}"/postgres-*.sql.gz 2>/dev/null | tail -n "+$((KEEP + 1))" | xargs -r rm -f || true

echo "==> Current backups:"
ls -lh "${BACKUP_DIR}"/postgres-*.sql.gz 2>/dev/null | tail -n "$KEEP"
