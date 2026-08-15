#!/usr/bin/env bash
# Restores a backup made by backup-postgres.sh.
#
# Default mode is VERIFICATION: restores into a disposable temporary
# container, prints table/row counts, then tears it down. This is what
# proves a backup is actually restorable — a backup that has never been
# restored is not a backup, it's an assumption. Run this after every backup
# you'd actually rely on, not just once.
#
#   ./scripts/restore-postgres.sh /home/deploy/backups/speednum/postgres-<stamp>.sql.gz
#
# The other mode overwrites the LIVE database — a genuinely destructive,
# hard-to-reverse action (see the architecture doc's approval boundary) — and
# requires an explicit second flag so it can never happen by a typo:
#
#   ./scripts/restore-postgres.sh /path/to/backup.sql.gz --live --i-understand-this-overwrites-production
set -euo pipefail

cd "$(dirname "$0")/.."  # deploy/

BACKUP_FILE="${1:-}"
MODE="verify"
if [[ "${2:-}" == "--live" && "${3:-}" == "--i-understand-this-overwrites-production" ]]; then
  MODE="live"
fi

if [[ -z "$BACKUP_FILE" || ! -f "$BACKUP_FILE" ]]; then
  echo "usage: $0 <path-to-postgres-backup.sql.gz> [--live --i-understand-this-overwrites-production]" >&2
  exit 2
fi

# shellcheck disable=SC1091
set -a; source .env; set +a

if [[ "$MODE" == "live" ]]; then
  echo "########################################################################"
  echo "# THIS OVERWRITES THE LIVE speednum-postgres DATABASE. NOT REVERSIBLE  #"
  echo "# without a prior backup of whatever is about to be replaced.          #"
  echo "########################################################################"
  read -r -p "Type the database name (${POSTGRES_DB:-speednum}) to confirm: " CONFIRM
  if [[ "$CONFIRM" != "${POSTGRES_DB:-speednum}" ]]; then
    echo "Confirmation did not match. Aborting." >&2
    exit 1
  fi
  echo "==> Restoring $BACKUP_FILE into the LIVE database"
  gunzip -c "$BACKUP_FILE" | docker compose exec -T postgres psql -U "${POSTGRES_USER:-speednum}" -d "${POSTGRES_DB:-speednum}"
  echo "==> Done. Verify the application against it before trusting this restore."
  exit 0
fi

# --- Verification mode: a throwaway container, never the live one ---------
readonly TMP_CONTAINER="speednum-postgres-restore-verify"
readonly TMP_DB="${POSTGRES_DB:-speednum}"
readonly TMP_USER="${POSTGRES_USER:-speednum}"
readonly TMP_PASS="${POSTGRES_PASSWORD}"

cleanup() {
  docker rm -f "$TMP_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> Starting a disposable Postgres to restore into (no volume — gone on exit)"
docker run -d --name "$TMP_CONTAINER" \
  -e POSTGRES_DB="$TMP_DB" -e POSTGRES_USER="$TMP_USER" -e POSTGRES_PASSWORD="$TMP_PASS" \
  postgres:16 >/dev/null

echo -n "==> Waiting for it to accept connections"
for _ in $(seq 1 30); do
  if docker exec "$TMP_CONTAINER" pg_isready -U "$TMP_USER" -d "$TMP_DB" >/dev/null 2>&1; then
    echo " ready."
    break
  fi
  echo -n "."
  sleep 1
done

echo "==> Restoring $BACKUP_FILE"
gunzip -c "$BACKUP_FILE" | docker exec -i "$TMP_CONTAINER" psql -U "$TMP_USER" -d "$TMP_DB" >/tmp/restore-verify.log 2>&1 \
  || { echo "restore FAILED — see /tmp/restore-verify.log" >&2; exit 1; }

echo "==> Verifying: table count, row counts for key tables"
docker exec "$TMP_CONTAINER" psql -U "$TMP_USER" -d "$TMP_DB" -c "
  select 'tables' as what, count(*)::text as n from information_schema.tables where table_schema='public'
  union all select 'tenants', count(*)::text from public.tenants
  union all select 'profiles', count(*)::text from public.profiles
  union all select 'clients', count(*)::text from public.clients
  union all select 'documents', count(*)::text from public.documents
  union all select 'schema_migrations', count(*)::text from public.schema_migrations;
"

echo "==> Restore verified. Disposable container will be removed now."
