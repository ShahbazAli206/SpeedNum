# Staging environment runbook

A second, isolated stack on the **same VPS** as live, reachable at
**`production.spidnums.com`**, running on a **full copy of live data**. It is
where all day-to-day work is tested. Live (`spidnums.com`) is touched **only** by
an explicit promotion.

Design rationale: [docs/superpowers/specs/2026-09-03-staging-environment-design.md](docs/superpowers/specs/2026-09-03-staging-environment-design.md).

## How it stays isolated from live

| | Live | Staging |
|---|---|---|
| Compose project | `speednum` | `speednum-staging` |
| Checkout | live checkout | `/opt/speednum-staging` (branch `staging`) |
| Containers | `speednum-*` | `speednum-staging-*` |
| DB / storage data | `/home/deploy/data/speednum/*` | `/home/deploy/data/speednum-staging/*` |
| API workers | 4 | 1 |
| Env files | `deploy/api.env`, `deploy/.env` | `deploy/api.staging.env`, `deploy/.env.staging` |
| Video (LiveKit/coturn) | off (behind `video` profile) | **on** (owns the host WebRTC ports) |

Staging cannot read or write live's database or storage. The only shared things
are the host's CPU/RAM (staging is capped to 1 worker) and the single Caddy +
the `web` network (Caddy reaches each stack by its distinct container names).

## Customer-safety guarantees (do not remove)

Staging holds **real** customer data, so two guards keep it from ever reaching
real people:

1. **Email redirect** — `EMAIL_REDIRECT_TO` in `api.staging.env` rewrites every
   outgoing recipient to an address you control. Email still sends for real, but
   no customer is contacted, **including the reminder scheduler's automatic
   digests**. Your own addresses in `EMAIL_REDIRECT_ALLOWLIST` still receive
   normally. (Implemented in `backend/app/services/email.py`.)
2. **Access gate** — Caddy `basic_auth` + `noindex` on `production.spidnums.com`
   so the site isn't publicly reachable or search-indexed.

---

## Everyday workflow

The rule: **feature work never goes straight to `main`.** It goes to `staging`,
is tested at `production.spidnums.com`, and only a deliberate promotion moves it
to live.

### 1. Build a feature
```bash
git checkout staging && git pull
git checkout -b feature/<name>
# ...commit work...
git checkout staging && git merge --no-ff feature/<name>
git push origin staging          # CI runs on staging
```

### 2. Deploy it to staging (over SSH)
```bash
ssh <you>@2.25.108.16
cd /opt/speednum-staging/deploy && ./deploy-staging.sh
```
`deploy-staging.sh` pulls `staging`, rebuilds only the `speednum-staging`
project, and health-checks it. It cannot touch the live stack.

### 3. Refresh staging data from live (when you want current data)
```bash
cd /opt/speednum-staging/deploy
./scripts/seed-staging-db.sh                 # database only
./scripts/seed-staging-db.sh --with-storage  # also mirror document files
```
One-way, live is read-only. See the script header for `--with-storage` creds.

### 4. Promote to live (the "one command")
From any checkout with push access:
```bash
./deploy/scripts/promote-to-live.sh
```
It merges `staging` → `main` after safety checks and pushes, which triggers the
existing CI-gated live deploy. If the promotion includes DB migrations, it
prints the exact **backup-then-migrate** commands to run on the live host
afterwards (schema changes on production stay a deliberate, backed-up step).

---

## One-time bootstrap (on the VPS)

Prerequisite: the two DNS records (below) resolve to the VPS.

```bash
# 1. Staging checkout (skip the LFS media — the server never reads it)
GIT_LFS_SKIP_SMUDGE=1 git clone <repo-url> /opt/speednum-staging
cd /opt/speednum-staging && git checkout staging

# 2. Data dirs (bind mounts, kept out of the compose project so `down` can't take them)
mkdir -p /home/deploy/data/speednum-staging/postgres /home/deploy/data/speednum-staging/minio

# 3. Env files — fill in staging secrets (own passwords, distinct from live)
cd deploy
cp .env.staging.example .env.staging          && chmod 600 .env.staging   && nano .env.staging
cp api.staging.env.example api.staging.env    && chmod 600 api.staging.env && nano api.staging.env
#   In api.staging.env, set EMAIL_REDIRECT_TO to your address and add your own
#   test addresses to EMAIL_REDIRECT_ALLOWLIST.

# 4. Video config for staging (its own copies in the staging deploy dir)
cp livekit.yaml.example livekit.yaml          # set keys/secret to match .env.staging
cp turnserver.conf.example turnserver.conf    # static-auth-secret = TURN_SHARED_SECRET
#   The TLS cert at /home/deploy/certs/turn.spidnums.com already exists (shared with live).

# 5. Bring the stack up (creates the empty staging Postgres + MinIO)
./deploy-staging.sh

# 6. One-time least-privilege DB role on the staging Postgres (see DEPLOYMENT.md's
#    "Least-privilege database role") — creates speednum_app, which the live dump
#    references as owner. Run against speednum-staging-postgres.

# 7. Seed with live data
./scripts/seed-staging-db.sh --with-storage
#    migrate status should then report "up to date" (the dump carries live's
#    migration-tracking table).

# 8. Caddy — add the two staging blocks from deploy/Caddyfile.example to the
#    VPS Caddyfile, then VALIDATE before RELOAD (zero-downtime; live never blinks):
#      docker exec caddy caddy validate --config /etc/caddy/Caddyfile
#      docker exec caddy caddy reload   --config /etc/caddy/Caddyfile
#    Set the basic_auth hash first:
#      docker exec caddy caddy hash-password --plaintext 'your-staging-password'
```

### DNS records to add (registrar / DNS host for spidnums.com)

| Type | Name | Value | Notes |
|---|---|---|---|
| A | `production` | `2.25.108.16` | staging frontend |
| A | `api.production` | `2.25.108.16` | staging API + storage |

(`video.spidnums.com` and `turn.spidnums.com` already exist and now point at
staging's video while live's is off — no new record needed.)

---

## Common operations

```bash
# Always use the full flag set for staging compose commands:
C="docker compose -p speednum-staging --env-file .env.staging -f docker-compose.staging.yml"

$C ps                                   # status
$C logs -f api                          # tail API logs
$C --profile video up -d --build        # (re)build/start incl. video
$C restart api                          # restart after a data reseed
$C --profile tools run --rm migrate status   # schema state
$C --profile tools run --rm migrate apply    # apply migrations on staging

# Turn video OFF in staging (e.g. after promoting the fix to live):
$C stop livekit coturn && $C rm -f livekit coturn
# ...then enable it on LIVE by bringing the live stack up with `--profile video`.
```

## Notes

- **Video ownership is exclusive.** LiveKit/coturn bind fixed host ports; only one
  stack can run them at a time. While staging owns video, live's must stay off
  (its `video` profile is not enabled). Flip both together when promoting.
- **Drift.** `docker-compose.staging.yml` is a deliberate standalone copy of
  `docker-compose.yml` (so Compose's list-merge can't leak live's env/volumes).
  When you change a service in the live compose, mirror it here.
