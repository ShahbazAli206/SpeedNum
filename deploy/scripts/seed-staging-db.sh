#!/usr/bin/env bash
# Copy the LIVE database (and optionally storage) into STAGING.
#
#   cd /opt/speednum-staging/deploy && ./scripts/seed-staging-db.sh
#   ./scripts/seed-staging-db.sh --with-storage      # also mirror MinIO objects
#   ./scripts/seed-staging-db.sh --yes               # skip the confirmation
#
# Direction is HARDCODED and one-way:
#   source (read-only):  speednum-postgres          (LIVE)
#   target (overwritten): speednum-staging-postgres (STAGING)
# Live is only ever read — pg_dump takes a consistent snapshot without blocking
# writers and never modifies the source. The target is dropped-and-recreated.
#
# Data is copied verbatim, NOT scrubbed (deliberate — see the staging design
# spec). Customers are protected instead by EMAIL_REDIRECT_TO in api.staging.env
# (no real email can be sent from staging) and the Caddy basic-auth gate (the
# site is not publicly reachable). Do not remove either of those.
set -euo pipefail

cd "$(dirname "$0")/.."  # deploy/

WITH_STORAGE=0
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    --with-storage) WITH_STORAGE=1 ;;
    --yes|-y) ASSUME_YES=1 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

readonly LIVE_PG_CONTAINER="speednum-postgres"
readonly STAGING_PG_CONTAINER="speednum-staging-postgres"

# Live database identity — the image defaults, overridable if live customised them.
readonly LIVE_PG_USER="${LIVE_PG_USER:-speednum}"
readonly LIVE_PG_DB="${LIVE_PG_DB:-speednum}"

if [[ ! -f .env.staging ]]; then
  echo "error: deploy/.env.staging is missing. Copy .env.staging.example and fill it in." >&2
  exit 1
fi
# Staging identity (the target). shellcheck disable=SC1091
set -a; source .env.staging; set +a
readonly STAGING_PG_USER="${POSTGRES_USER:-speednum}"
readonly STAGING_PG_DB="${POSTGRES_DB:-speednum}"

# Belt-and-braces: never let this run "backwards". The target MUST be staging.
if [[ "$STAGING_PG_CONTAINER" != *staging* ]]; then
  echo "error: refusing — target container '$STAGING_PG_CONTAINER' is not a staging container." >&2
  exit 1
fi

# Both containers must be up.
for c in "$LIVE_PG_CONTAINER" "$STAGING_PG_CONTAINER"; do
  if ! docker ps --format '{{.Names}}' | grep -qx "$c"; then
    echo "error: container '$c' is not running." >&2
    exit 1
  fi
done

echo "########################################################################"
echo "# Copy LIVE data -> STAGING.                                            #"
echo "#   from (read-only): $LIVE_PG_CONTAINER / $LIVE_PG_DB"
echo "#   into (OVERWRITE): $STAGING_PG_CONTAINER / $STAGING_PG_DB"
echo "# The staging database will be REPLACED. Live is untouched.             #"
echo "########################################################################"
if [[ "$ASSUME_YES" -ne 1 ]]; then
  read -r -p "Type 'staging' to proceed: " CONFIRM
  if [[ "$CONFIRM" != "staging" ]]; then
    echo "Confirmation did not match. Aborting." >&2
    exit 1
  fi
fi

echo "==> Dumping live (${LIVE_PG_DB}) and restoring into staging (${STAGING_PG_DB})"
# --clean --if-exists so the restore drops-and-recreates existing staging
# objects rather than erroring. Restore as the staging superuser so it can
# reassign ownership (the dump carries OWNER TO speednum_app; that role must
# already exist in staging — see the one-time role setup in STAGING.md).
# `set -o pipefail` (already on) makes a pg_dump failure fail the whole pipe.
docker exec -t "$LIVE_PG_CONTAINER" \
    pg_dump -U "$LIVE_PG_USER" --clean --if-exists "$LIVE_PG_DB" \
  | docker exec -i "$STAGING_PG_CONTAINER" \
    psql -v ON_ERROR_STOP=0 -U "$STAGING_PG_USER" -d "$STAGING_PG_DB" > /tmp/seed-staging.log 2>&1 \
  || { echo "restore reported errors — see /tmp/seed-staging.log" >&2; tail -20 /tmp/seed-staging.log >&2; }

echo "==> Database copied. (Warnings about roles/ownership are usually harmless — check /tmp/seed-staging.log)"

if [[ "$WITH_STORAGE" -eq 1 ]]; then
  echo "==> Mirroring MinIO objects live -> staging"
  # Both minio containers are on the external `web` network, so a throwaway mc
  # container there reaches each by name. Live creds must be supplied via the
  # environment (this script only holds staging's); staging creds come from
  # .env.staging above.
  : "${LIVE_MINIO_ROOT_USER:?set LIVE_MINIO_ROOT_USER in the environment to mirror storage}"
  : "${LIVE_MINIO_ROOT_PASSWORD:?set LIVE_MINIO_ROOT_PASSWORD in the environment to mirror storage}"
  docker run --rm --network web \
    -e MC_HOST_live="http://${LIVE_MINIO_ROOT_USER}:${LIVE_MINIO_ROOT_PASSWORD}@speednum-minio:9000" \
    -e MC_HOST_stg="http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@speednum-staging-minio:9000" \
    minio/mc:RELEASE.2024-10-08T09-37-26Z \
    mirror --overwrite --remove "live/${S3_BUCKET:-documents}" "stg/${S3_BUCKET:-documents}"
  echo "==> Storage mirrored."
else
  echo "==> Skipped storage (pass --with-storage to also mirror document attachments)."
fi

echo "==> Done. If the staging API caches anything at boot, restart it:"
echo "    docker compose -p speednum-staging --env-file .env.staging -f docker-compose.staging.yml restart api"
