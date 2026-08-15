#!/usr/bin/env bash
# Pull, rebuild and restart the API, then prove it came back up.
#
#   cd /opt/speednum/deploy && ./deploy.sh
#
# Verifying is the point. `docker compose up -d` returns as soon as the
# container is *started*, which it also does when the app inside is crash-looping
# on a bad DATABASE_URL — so a deploy that "succeeded" can leave the API down.
set -euo pipefail

cd "$(dirname "$0")"

readonly ATTEMPTS=30

if [[ ! -f api.env ]]; then
  echo "error: deploy/api.env is missing. Copy api.env.example to api.env and fill it in." >&2
  exit 1
fi
if [[ ! -f .env ]]; then
  echo "error: deploy/.env is missing. Copy .env.example to .env and fill it in." >&2
  exit 1
fi

# The api container publishes no host port (Caddy reaches it by container
# name over the `web` Docker network instead — see docker-compose.yml), so
# this checks from inside the container rather than curling localhost.
check_health() {
  docker compose exec -T api python -c "
import urllib.request, sys
try:
    print(urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).read().decode())
except Exception as exc:
    sys.exit(1)
" 2>/dev/null
}

echo "==> Fetching latest main"
# Skip the ~619 MB of demo media held in LFS — the server never reads it, and
# GitHub's free tier allows only 1 GB of LFS bandwidth a month. The clone in
# DEPLOYMENT.md sets lfs.fetchexclude permanently; this is belt and braces for a
# checkout made without it.
GIT_LFS_SKIP_SMUDGE=1 git -C .. pull --ff-only

echo "==> Building and starting"
docker compose up -d --build

echo "==> Waiting for /health"
for attempt in $(seq 1 "$ATTEMPTS"); do
  if response=$(check_health); then
    echo "$response"
    case "$response" in
      *'"database":"ok"'*)
        echo "==> Healthy."
        # A pending migration does not stop the API booting — it fails later, at
        # the first request touching the missing column, which is far harder to
        # connect back to this deploy. Say so now.
        if ! docker compose run --rm migrate status 2>/dev/null | grep -q "up to date"; then
          echo
          echo "WARNING: pending schema migrations. Run:  docker compose run --rm migrate apply" >&2
          echo "         (see 'Applying migrations' in DEPLOYMENT.md — baseline first on an existing database)" >&2
        fi
        exit 0
        ;;
      *)
        # The API is up but cannot reach Postgres — almost always a wrong
        # DATABASE_URL or a firewall blocking outbound 6543.
        echo "==> API is up but the database is not reachable. Check DATABASE_URL in api.env." >&2
        exit 1
        ;;
    esac
  fi
  sleep 2
  printf '.'
done

echo >&2
echo "error: /health did not respond after $((ATTEMPTS * 2))s. Recent logs:" >&2
docker compose logs --tail 50 api >&2
exit 1
