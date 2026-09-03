#!/usr/bin/env bash
# Pull, rebuild and restart the STAGING stack, then prove it came back up.
#
#   cd /opt/speednum-staging/deploy && ./deploy-staging.sh
#
# The staging twin of deploy.sh. It targets ONLY the `speednum-staging` compose
# project and this checkout (/opt/speednum-staging) — it can never act on the
# live stack. Verifying is the point: `up -d` returns as soon as a container is
# started, which it also does when the app is crash-looping on a bad env, so a
# deploy that "succeeded" can leave staging down.
set -euo pipefail

cd "$(dirname "$0")"

readonly ATTEMPTS=30

# Every compose invocation for staging needs the same flags: the distinct
# project name (so it never collides with live), the staging env file, the
# staging compose file, and the `video` profile (staging owns video while it is
# being fixed — drop this once the fix is promoted to live).
COMPOSE=(docker compose -p speednum-staging --env-file .env.staging -f docker-compose.staging.yml --profile video)

if [[ ! -f api.staging.env ]]; then
  echo "error: deploy/api.staging.env is missing. Copy api.staging.env.example and fill it in." >&2
  exit 1
fi
if [[ ! -f .env.staging ]]; then
  echo "error: deploy/.env.staging is missing. Copy .env.staging.example and fill it in." >&2
  exit 1
fi

# Same as live: the api container publishes no host port, so probe from inside.
check_health() {
  "${COMPOSE[@]}" exec -T api python -c "
import urllib.request, sys
try:
    print(urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).read().decode())
except Exception:
    sys.exit(1)
" 2>/dev/null
}

echo "==> Fetching latest staging branch"
# Skip LFS media (see deploy.sh) — the server never reads it.
GIT_LFS_SKIP_SMUDGE=1 git -C .. pull --ff-only

echo "==> Building and starting the staging stack"
"${COMPOSE[@]}" up -d --build

echo "==> Waiting for /health"
for attempt in $(seq 1 "$ATTEMPTS"); do
  if response=$(check_health); then
    echo "$response"
    case "$response" in
      *'"database":"ok"'*)
        echo "==> Staging healthy."
        # A pending migration boots fine and only fails later at the first
        # request touching the missing column — say so now, as live does.
        if ! "${COMPOSE[@]}" --profile tools run --rm migrate status 2>/dev/null | grep -q "up to date"; then
          echo
          echo "WARNING: pending schema migrations on STAGING. Run:" >&2
          echo "  ${COMPOSE[*]} --profile tools run --rm migrate apply" >&2
        fi
        exit 0
        ;;
      *)
        echo "==> Staging API is up but its database is not reachable. Check api.staging.env / .env.staging." >&2
        exit 1
        ;;
    esac
  fi
  sleep 2
  printf '.'
done

echo >&2
echo "error: staging /health did not respond after $((ATTEMPTS * 2))s. Recent logs:" >&2
"${COMPOSE[@]}" logs --tail 50 api >&2
exit 1
