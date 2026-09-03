#!/usr/bin/env bash
# Promote validated staging work to LIVE: merge `staging` -> `main` and push.
#
#   ./deploy/scripts/promote-to-live.sh
#
# Pushing `main` triggers the existing pipeline: CI runs, and on success the
# Deploy workflow (.github/workflows/deploy.yml) auto-ships the new code to the
# live VPS. This script deliberately does NOT touch the live database — schema
# changes on production must be a deliberate, backed-up decision, so it PRINTS
# the exact guarded-migration commands to run once the code deploy has landed
# (see also STAGING.md). Nothing here runs against live customers except the
# `git push` that starts the (CI-gated) code deploy.
#
# Run this only after staging has been validated at production.spidnums.com.
set -euo pipefail

readonly LIVE_BRANCH="main"
readonly STAGING_BRANCH="staging"
readonly REMOTE="origin"

cd "$(git rev-parse --show-toplevel)"

original_branch="$(git rev-parse --abbrev-ref HEAD)"
restore() { git checkout --quiet "$original_branch" 2>/dev/null || true; }
trap restore EXIT

# --- Preflight: refuse on anything unsafe ------------------------------------
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "error: working tree has uncommitted changes. Commit or stash first." >&2
  exit 1
fi

echo "==> Fetching $REMOTE"
git fetch --quiet "$REMOTE" "$LIVE_BRANCH" "$STAGING_BRANCH"

# staging must contain everything on main (no divergence that a merge would
# have to reconcile blind), and must actually be ahead of it (something to ship).
if ! git merge-base --is-ancestor "$REMOTE/$LIVE_BRANCH" "$REMOTE/$STAGING_BRANCH"; then
  echo "error: $REMOTE/$LIVE_BRANCH is not an ancestor of $REMOTE/$STAGING_BRANCH." >&2
  echo "       main has commits staging doesn't — reconcile (merge main into staging) first." >&2
  exit 1
fi
ahead="$(git rev-list --count "$REMOTE/$LIVE_BRANCH..$REMOTE/$STAGING_BRANCH")"
if [[ "$ahead" -eq 0 ]]; then
  echo "Nothing to promote — $STAGING_BRANCH is not ahead of $LIVE_BRANCH." >&2
  exit 0
fi

echo "==> $ahead commit(s) will be promoted to live:"
git --no-pager log --oneline "$REMOTE/$LIVE_BRANCH..$REMOTE/$STAGING_BRANCH"
echo
# Whether any DB migrations are part of this promotion — decides whether the
# post-deploy migration step below is needed.
migration_changes="$(git diff --name-only "$REMOTE/$LIVE_BRANCH..$REMOTE/$STAGING_BRANCH" -- db/migrations || true)"

read -r -p "Promote these to LIVE (spidnums.com)? Type 'promote' to confirm: " CONFIRM
if [[ "$CONFIRM" != "promote" ]]; then
  echo "Aborted." >&2
  exit 1
fi

# --- Merge and push ----------------------------------------------------------
echo "==> Merging $STAGING_BRANCH -> $LIVE_BRANCH"
git checkout --quiet "$LIVE_BRANCH"
git pull --quiet --ff-only "$REMOTE" "$LIVE_BRANCH"
# --no-ff so the history carries an explicit "this was a promotion" merge commit.
git merge --no-ff "$REMOTE/$STAGING_BRANCH" -m "promote: $STAGING_BRANCH -> $LIVE_BRANCH"
git push "$REMOTE" "$LIVE_BRANCH"

echo
echo "==> Pushed to $LIVE_BRANCH. CI is now running; on success the Deploy"
echo "    workflow ships the code to the live VPS automatically."
echo

# --- The deliberate, backed-up live migration --------------------------------
if [[ -n "$migration_changes" ]]; then
  cat <<'EOF'
########################################################################
# This promotion includes DATABASE MIGRATIONS. They are NOT applied
# automatically. AFTER the code deploy has landed on the VPS, apply them
# with a backup first (run on the live host, in the live checkout's deploy/):
#
#   ./scripts/backup-postgres.sh
#   docker compose run --rm migrate status
#   docker compose run --rm migrate apply
#   docker compose run --rm migrate status   # confirm "up to date"
#
# Then re-check the app: curl -fsS https://www.spidnums.com/ >/dev/null
########################################################################
EOF
else
  echo "==> No database migrations in this promotion — nothing further to apply."
fi
