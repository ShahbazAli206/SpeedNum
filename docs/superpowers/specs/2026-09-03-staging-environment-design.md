# Staging environment + controlled promotion to live — design

**Date:** 2026-09-03
**Status:** Draft for review
**Author:** Shahbaz Ali (with Claude)

## 1. Problem & goal

`spidnums.com` is live and used by real customers (companies). Today **every push to
`main` auto-deploys to those customers** (CI → `deploy.yml` → SSH → `deploy/deploy.sh`).
There is nowhere to build, test, and validate changes — schema migrations included —
before they reach real users.

**Goal:** a second, fully isolated environment at `production.spidnums.com` (the
"staging" environment) that mirrors live, where all day-to-day work happens. Live is
touched **only** by an explicit, one-command promotion. Nothing about the staging
environment may cause downtime, data loss, or unsolicited contact with real customers.

> Naming note: the user calls the new test environment `production.spidnums.com`. In this
> document "staging" = the new `production.spidnums.com` environment; "live" =
> `spidnums.com` / `www.spidnums.com`, the customer-facing system.

## 2. Non-goals

- No separate staging VPS — staging runs on the existing Hostinger VPS (`2.25.108.16`).
- No per-feature preview environments — one long-lived staging environment.
- No change to how live serves customers, other than **disabling the (already broken)
  video calling on live** so staging can own the video ports while it is being fixed.

## 3. Decisions (settled with the user)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Where staging runs | **Same VPS** as live, as a fully separate Docker Compose project |
| D2 | How server changes are made | Claude gets **direct SSH** access to the `deploy` user |
| D3 | Staging database contents | **Full copy** of the live DB — no scrubbing |
| D4 | Video calling | Live **disables** LiveKit/coturn (broken); **staging runs** them on `video.spidnums.com` + `turn.spidnums.com`. Ownership flips to live when the fix is promoted |
| D5 | Staging email | **Fully functional real delivery**, but every recipient is **redirected to an address the user controls** (allowlist for own test addresses). Zero real customers contacted |
| D6 | Public exposure | Staging is **access-gated** (Caddy basic-auth) + `noindex` |
| D7 | Branch model | Daily work on **`staging`** branch → auto-deploy to staging. `main` is **live-only**, reached only by explicit promotion |

## 4. Architecture — two isolated stacks on one VPS

Live is unchanged. Staging is a separate Compose **project** (`speednum-staging`) with its
own container names, database, object storage, data directories, and env files.

| Concern | Live (existing) | Staging (new) |
|---|---|---|
| Compose project | `speednum` (default) | `speednum-staging` (`-p speednum-staging`) |
| Repo checkout | `/opt/speednum` on `main` | `/opt/speednum-staging` on `staging` |
| Containers | `speednum-*` | `speednum-staging-*` |
| Postgres data | `/home/deploy/data/speednum/postgres` | `/home/deploy/data/speednum-staging/postgres` |
| MinIO data | `/home/deploy/data/speednum/minio` | `/home/deploy/data/speednum-staging/minio` |
| API workers | `WEB_CONCURRENCY=4` | `WEB_CONCURRENCY=1` (keep load off live) |
| Env files | `deploy/api.env`, `deploy/.env` | `deploy/api.staging.env`, `deploy/.env.staging` |
| Video (LiveKit/coturn) | **stopped** (see D4) | **running** on the shared host ports |

**Networks.** Both stacks join the shared external `web` network so the host's single
Caddy can reach each frontend/api by container name (`speednum-staging-frontend:3000`,
`speednum-staging-api:8000`). Each project gets its own compose-scoped `internal` network,
so the two Postgres/MinIO pairs are mutually unreachable.

**Isolation guarantee.** Distinct container names + data dirs + database + env files mean
staging cannot read, write, or corrupt any live data. The only shared resource is host
CPU/RAM (mitigated by the 1-worker cap) and the `web` network + Caddy (Caddy reaches each
by distinct name; config changes are validated before reload — see §9).

**Capacity check (blocking first step).** Before bringing staging up, verify the VPS has
headroom for a second stack (`free -h`, `docker stats`). If it does not, stop and revisit
the separate-VPS option rather than risk degrading live.

## 5. Domains & DNS

Two new DNS **A records → `2.25.108.16`** (added by the user):

- `production.spidnums.com` → staging **frontend**
- `api.production.spidnums.com` → staging **API + object storage** (mirrors how
  `test.spidnums.com` serves live: `/documents/*`, `/backups/*`, `/desktop-releases/*` →
  MinIO; everything else → API)

Video reuses the **existing** `video.spidnums.com` and `turn.spidnums.com` records (no new
DNS) — while video is disabled on live, those hostnames point at the staging LiveKit/coturn.

Caddy site blocks for the two new hosts are added to the shared Caddyfile with
`caddy validate` **before** `caddy reload` (reload is zero-downtime; live never blinks).

## 6. Branch & release workflow

```
feature branch ──▶ merge into `staging` ──▶ push ──▶ CI ──▶ auto-deploy to STAGING
                                                              (production.spidnums.com)
        ... user tests on staging ...
"transfer to live" ──▶ merge `staging` → `main` ──▶ CI ──▶ deploy to LIVE
                                                            (+ backup + guarded migration)
```

- **"Push a feature"** → Claude commits to a feature branch, merges it into `staging`, and
  pushes `staging`. **Claude never pushes `main`.**
- Pushing `staging` triggers CI, then an auto-deploy that targets **only** the staging
  project/dir (it cannot run compose against the live stack).
- **`main` is live-only.** The single action that reaches customers is the explicit
  promotion below.

### 6.1 Promotion — the "one command" (`deploy/scripts/promote-to-live.sh`)

1. Refuse to run unless staging is healthy and `staging` is ahead of `main` with no
   unexpected divergence.
2. Merge `staging` → `main`, push `main`.
3. Gate on CI success on `main`.
4. Deploy live: on the VPS, **back up Postgres first** (`deploy/scripts/backup-postgres.sh`),
   rebuild + restart, then **apply pending migrations** (`docker compose run --rm migrate
   apply`) — a deliberate, backed-up step, not an implicit side effect — then health-check.
   Abort on any failure.

Migrations are always applied and verified on **staging first** (against the full data
copy), so the live migration is a re-run of an already-proven change.

## 7. Database seeding — full live copy (`deploy/scripts/seed-staging-db.sh`)

Run on the VPS, on demand ("refresh staging data"):

1. `pg_dump` the **live** database (read-only; live is never modified).
2. Drop/recreate and restore into the **staging** database.
3. Optionally sync MinIO objects (`mc mirror`) so document attachments resolve in staging.

No content scrubbing (D3). Customer protection is handled entirely by the email redirect
(§8) and the access gate (§9), which change no data.

## 8. Email — real delivery, redirected recipients (D5)

Staging's email subsystem is fully live (real SMTP/Resend, real templates, real send and
delivery), but **no message reaches a real customer**. Implemented as a small, env-gated
hook in the shared backend so live behaviour is unchanged.

**New settings** (in `backend/app/config.py`, read by `backend/app/services/email.py`):

- `EMAIL_REDIRECT_TO` — when set, every outgoing recipient (to/cc/bcc) is replaced by this
  address; the original intended recipient is preserved in the subject and/or an injected
  header (e.g. `Subject: [staging → real.customer@acme.com] …`).
- `EMAIL_REDIRECT_ALLOWLIST` — comma-separated addresses/domains that are **not**
  redirected (the user's own test addresses), so genuine end-to-end tests to a "client" you
  own deliver normally.

**Behaviour:**

- **Live:** `EMAIL_REDIRECT_TO` unset → the hook is a complete no-op. No behaviour change.
- **Staging:** `EMAIL_REDIRECT_TO=<your address>` in `api.staging.env` → all mail lands on
  you (or an allowlisted test address). This also neutralises the **reminder scheduler**,
  which would otherwise auto-send duplicate reminders to every real customer while staging
  runs — the single most important reason redirect (not just "email works") is required.

The redirect hook is developed test-first (unit tests: redirect on, allowlist bypass,
no-op when unset).

## 9. Access control & safety rails

- **Access gate:** Caddy `basic_auth` on `production.spidnums.com` and
  `api.production.spidnums.com`, plus a `X-Robots-Tag: noindex` header — real data on the
  test site is never publicly reachable or indexed.
- **Deploy isolation:** the staging deploy script targets only `-p speednum-staging` and
  `/opt/speednum-staging`; it cannot act on the live stack.
- **Live promotion:** always backs up Postgres before migrating; aborts on health-check
  failure.
- **Caddy edits:** always `caddy validate` before `caddy reload`.
- **`main` protection:** Claude never pushes `main`; only `promote-to-live.sh` does.

## 10. Video ownership model (D4)

- `livekit` and `coturn` move behind a Compose **`video` profile** in the base
  `docker-compose.yml`, so a normal `docker compose up` does **not** start them.
- **Live** brings the stack up **without** `--profile video` → video off (one-time
  `docker compose stop livekit coturn` to retire the currently-running broken ones).
- **Staging** brings the stack up **with** `--profile video` → staging owns
  `video.spidnums.com` / `turn.spidnums.com` and the host WebRTC ports (free because live
  no longer binds them). Staging coturn reuses the existing `turn.spidnums.com` TLS cert.
- When the video fix is promoted and validated on live, ownership flips (live runs
  `--profile video`, staging stops video). Only one stack runs video at a time, so there is
  never a host-port collision.

## 11. Deliverables (built only after this spec is approved)

1. `deploy/docker-compose.staging.yml` — staging override (names, data dirs, env files,
   `WEB_CONCURRENCY=1`, staging build args, video profile).
2. `video` profile added to `livekit`/`coturn` in `deploy/docker-compose.yml`.
3. `deploy/api.staging.env.example` + `deploy/.env.staging.example`.
4. `deploy/deploy-staging.sh` — pull `staging`, rebuild, migrate, health-check (staging only).
5. `deploy/scripts/seed-staging-db.sh` — full live→staging copy (+ optional MinIO mirror).
6. `deploy/scripts/promote-to-live.sh` — the one-command promotion (§6.1).
7. Email redirect hook + settings in `backend/app/config.py` and
   `backend/app/services/email.py`, with unit tests.
8. Caddy staging site blocks (basic-auth + noindex) added to `deploy/Caddyfile.example`
   and applied to the VPS.
9. One-time VPS bootstrap: `/opt/speednum-staging` checkout on `staging`, staging data
   dirs, env files, DNS-dependent Caddy reload.
10. `STAGING.md` runbook (how to push a feature, refresh data, promote to live).

## 12. Prerequisites from the user

- **DNS:** add A records for `production.spidnums.com` and `api.production.spidnums.com` →
  `2.25.108.16`.
- **SSH:** grant Claude access to the `deploy` user (safe method decided at bootstrap
  time — prefer adding a dedicated public key to `authorized_keys` over pasting a private
  key).
- **Email redirect target:** the address staging email should be redirected to, plus any
  allowlisted test addresses.
- **Basic-auth credentials** for the staging site.

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Staging emails real customers | Env-gated redirect (§8); no-op on live |
| Reminder scheduler double-sends | Same redirect neutralises it in staging |
| Real customer data exposed publicly | Caddy basic-auth + `noindex` (§9) |
| Resource contention degrades live | 1-worker staging + blocking capacity check (§4) |
| Video port collision | `video` profile; only one stack runs video (§10) |
| Bad Caddy edit takes live down | `validate` before `reload` (§9) |
| Migration breaks live | Proven on staging first; live backup before apply (§6.1) |
| Accidental push to `main` | Only `promote-to-live.sh` pushes `main` (§6) |

## 14. Open questions

- Does the VPS have enough RAM/CPU for a second stack? (Resolved by the §4 capacity check
  before any staging container starts.)
- Exact promotion CI-gating mechanism (`gh` CLI is not installed locally) — resolved during
  implementation (GitHub API call, or run promotion from a context that has `gh`).
