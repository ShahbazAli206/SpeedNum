#!/usr/bin/env bash
# One-shot operational check: container health, disk/memory headroom, the
# public health endpoint, and whether backups are actually being produced.
# Exits non-zero if anything looks wrong, so this is cron/monitoring-friendly.
#
#   cd /home/deploy/apps/speednum/deploy && ./scripts/health-check.sh
set -uo pipefail  # not -e: keep checking everything even if one check fails

cd "$(dirname "$0")/.."  # deploy/

FAILED=0
fail() { echo "FAIL: $*" >&2; FAILED=1; }
ok() { echo "ok:   $*"; }

echo "=== Container status ==="
docker compose ps
for svc in postgres minio api; do
  status="$(docker compose ps --format '{{.Health}}' "$svc" 2>/dev/null)"
  if [[ "$status" == "healthy" ]]; then
    ok "$svc is healthy"
  else
    fail "$svc health status: '${status:-unknown}'"
  fi
done

echo
echo "=== Disk usage ==="
df -h / | tail -1
USED_PCT="$(df --output=pcent / | tail -1 | tr -dc '0-9')"
if [[ "$USED_PCT" -ge 90 ]]; then
  fail "root filesystem is ${USED_PCT}% full"
else
  ok "root filesystem at ${USED_PCT}%"
fi

echo
echo "=== Memory ==="
free -h

echo
echo "=== Public health endpoint ==="
if RESPONSE="$(curl -sS --fail --max-time 5 https://test.spidnums.com/health 2>&1)"; then
  echo "$RESPONSE"
  if [[ "$RESPONSE" == *'"database":"ok"'* ]]; then
    ok "public health endpoint reports database ok"
  else
    fail "public health endpoint reachable but database is not ok: $RESPONSE"
  fi
else
  fail "public health endpoint unreachable: $RESPONSE"
fi

echo
echo "=== Pending migrations ==="
if docker compose run --rm migrate status 2>&1 | tee /tmp/migrate-status.log | grep -q "up to date"; then
  ok "schema is up to date"
else
  fail "pending or skipped migrations — see output above"
  cat /tmp/migrate-status.log >&2
fi

echo
echo "=== Backup freshness ==="
readonly BACKUP_DIR="/home/deploy/backups/speednum"
for prefix in postgres storage; do
  latest="$(ls -t "${BACKUP_DIR}/${prefix}"-*.* 2>/dev/null | head -1)"
  if [[ -z "$latest" ]]; then
    fail "no ${prefix} backup found in ${BACKUP_DIR}"
    continue
  fi
  age_hours=$(( ($(date +%s) - $(stat -c %Y "$latest")) / 3600 ))
  if [[ "$age_hours" -gt 26 ]]; then
    fail "${prefix} backup is ${age_hours}h old (${latest}) — daily cron may not be running"
  else
    ok "${prefix} backup is ${age_hours}h old (${latest})"
  fi
done

echo
if [[ "$FAILED" -eq 0 ]]; then
  echo "All checks passed."
else
  echo "One or more checks FAILED — see above." >&2
fi
exit "$FAILED"
