# SpeedNum — Handover

Start here. This is the one document a new operator, developer, or reviewer should read
first — it says what SpeedNum is, what's live right now, what's genuinely done versus
blocked, and where to go for depth. `PROGRESS.md` is an older session log kept for
history; it describes a pre-migration Supabase architecture that no longer exists — treat
this file, not that one, as current.

## What this is

A multi-tenant practice-management platform for accounting firms: client CRM, service
catalogue, task workflows, compliance deadlines with automated reminders, engagement
letters with e-signature, a client self-service portal, and a desktop disaster-recovery
tool. Originally built on Supabase; fully migrated off it this project — see
[MIGRATION.md](MIGRATION.md) for why and [ARCHITECTURE.md](ARCHITECTURE.md) for the
current design.

```
Vercel (Next.js)  ──HTTPS/JWT──▶  Caddy  ──▶  FastAPI (Docker)  ──asyncpg──▶  Postgres 16
                                                  │                        (self-hosted VPS)
                                                  ├──▶ MinIO (documents + backup snapshots)
                                                  └──▶ Hostinger SMTP (transactional email)
```

Authentication is self-hosted end to end (Argon2id passwords, Ed25519 JWTs with key
rotation, opaque rotating refresh tokens with reuse detection) — see
[SECURITY.md](SECURITY.md). Supabase is not in the active request path; the
`AUTH_PROVIDER=supabase` / `STORAGE_PROVIDER=supabase` settings exist only as documented,
inactive-by-default rollback paths and default safely to the self-hosted providers.

## `main` is now the complete project — merged and pushed

As of this pass, `origin/main` and `origin/migration/portable-production-architecture`
are identical (verify any time with
`git rev-parse origin/main origin/migration/portable-production-architecture` — both
print the same hash). Everything that was previously described here as "stuck on the
migration branch" — task attachments/comments, the reporting/admin-console/custom-
fields/client-detail live-data fixes, PDF export, the Task Master live-data wiring, the
engagement-letter creation fix, the stored-XSS fix, the current-password fix, and this
pass's own fixes — is now on `main`. This was a strict fast-forward (no divergent
history to reconcile), pushed directly (`git push
origin migration/portable-production-architecture:main`) rather than via a local
checkout, since this shared working tree has other concurrent processes that a branch
switch could disrupt.

Vercel's standard GitHub integration auto-deploys on a push to its connected production
branch. **This environment has no Vercel dashboard/CLI credentials**, so the exact
deployed commit SHA on `https://syedi.spidnums.com` could not be independently
confirmed — the live bundle's asset hashes did change after the push (consistent with a
new build having run), which is corroborating evidence, not proof. Confirm in the
Vercel dashboard that Production shows a deployment from this commit before treating
the frontend as caught up.

## What's live right now

| Component | Where | Status |
|---|---|---|
| Backend API | `srv1904640.hstgr.cloud` (`2.25.108.16`) via Caddy, `https://test.spidnums.com` | Up, healthy, migrations current |
| Postgres 16 | Docker on the same VPS | Up, healthy |
| MinIO (documents, backups) | Docker on the same VPS | Up, healthy |
| Frontend | Vercel, `https://syedi.spidnums.com` | Deployed from `main`; `main` now matches the complete project — see above. Exact deployed commit not independently confirmable (no Vercel credentials in this environment) |
| Desktop app | Not distributed yet — build with `npm run dist` in `desktop/` | Functional, unsigned (see Known gaps) |

VPS access: `ssh deploy@srv1904640.hstgr.cloud`, passwordless `sudo`. Root login and
password authentication are both disabled (`PermitRootLogin no`,
`PasswordAuthentication no`) — key-only. Firewall: 22/80/443 only, IPv4 and IPv6.

Deploying a backend change: `git pull` on the VPS inside
`/home/deploy/apps/speednum`, then from `deploy/`: `docker compose up -d --build api`
(add `docker compose run --rm migrate apply` first if the change includes a migration).
Full sequence and rollback notes: [DEPLOYMENT.md](DEPLOYMENT.md).

## What's genuinely done (implemented and live-verified, not just written)

- Self-hosted auth: registration, login, logout, refresh rotation with reuse detection,
  password reset, forced-password-change, per-IP/per-account rate limiting, lockout.
- Multi-tenant data isolation across clients, contacts, tasks, services, documents,
  deadlines, engagement letters — enforced by `tenant_id`-scoped queries on every query
  (Postgres RLS is deliberately not the enforcement layer here; see ARCHITECTURE.md and
  `db/migrations/0002_rls.sql`'s header for why it's skipped for a self-hosted deployment).
- Full client, staff, service, task, and deadline management — CRUD, assignment,
  auto-generated deadlines on service assignment, task attachments and comments.
- Client self-service portal: isolated per client, cannot see another client's or
  another tenant's data (adversarially tested).
- Engagement letters: creation, send, client e-signature, PDF generation with tenant
  branding, void/duplicate.
- Real email: account/invite/reset/task-assignment/deadline-digest, all via configured
  SMTP, live-confirmed delivery.
- Dashboard and reporting: every figure — revenue, deadline load, task/client
  breakdowns, team workload, on-time filing rate — computed live from the same tables
  the app writes to, not a separate analytics store.
- Document storage: MinIO-backed, presigned upload/download, private by default,
  byte-identical round-trip including Unicode filenames/content, verified cross-tenant
  isolation.
- Disaster recovery: automated daily encrypted backup snapshots, device
  registration/revocation, retention policy, and a real restore drill into a disposable
  Postgres instance — not just a backup that's never been tested to restore.
- Desktop app (Electron): superadmin-only DR tool — sync, AES-256-GCM envelope
  encryption, restore drills, auto-update against a self-hosted release feed (not
  GitHub, since this repo is private). System-aware dark/light theming.
- Google OAuth: fully implemented (PKCE, JWKS signature/issuer/audience/expiry
  verification), correctly hidden until credentials are configured — see Known gaps.
- Super-admin platform console: cross-tenant tenant list, platform stats, and a
  cross-tenant audit log.
- Custom fields: full CRUD for client/task/project entities.
- SSH hardened: key-only auth, no root login, verified not to have broken `deploy`
  access or Docker access.

See [HANDOVER_MASTER_PLAN.md](HANDOVER_MASTER_PLAN.md) for the full section-by-section
status against the original completion spec, including exactly how each item above was
verified (not just implemented) — live commands, real created-and-cleaned-up test
records, not screenshots or assertions.

## Known gaps — external credentials, not unfinished work

Two things are implemented in full and intentionally not enabled, because they need a
credential nobody in this environment has access to. Both are safe to defer — nothing
else depends on them, and turning them on later is a config change, not a rebuild.

**Google OAuth ("Continue with Google")**
```
Credential:      GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
Where to obtain: Google Cloud Console → APIs & Services → Credentials → OAuth client ID
Where it belongs: backend/.env (or the VPS's api.env) — never committed to the repo
Whether it can be deferred: Yes. The button is hidden until both variables are set;
                  nothing else is affected.
```

**Desktop installer code signing**
```
Credential:      A Windows Authenticode code-signing certificate (OV or EV) from a CA
                  such as DigiCert or Sectigo
Where it belongs: CSC_LINK / CSC_KEY_PASSWORD env vars at build time (electron-builder)
Confirmed:       Get-AuthenticodeSignature on the built installer reports NotSigned —
                  checked directly, not assumed
Effect without it: Windows SmartScreen warns on first run; some stricter security
                  postures block an unsigned .exe outright. The auto-update mechanism
                  itself (check/download/verify) works identically either way.
Whether it can be deferred: Yes — affects install polish, not correctness.
```

Full detail on both: [SECURITY.md](SECURITY.md) (OAuth) and [DESKTOP.md](DESKTOP.md)
(code signing).

## What to check before treating this as "done"

- The frontend was pushed to `migration/portable-production-architecture`. Confirm in
  the Vercel dashboard which branch is wired to the production deployment — this
  environment has no Vercel credentials to verify that directly.
- `api.spidnums.com` DNS has not been created (needs Hostinger DNS access this
  environment doesn't have); the API is reachable at `test.spidnums.com` in the
  meantime, and Caddy already has the production block ready to uncomment
  (`deploy/Caddyfile.example`).
- Promoting an account to platform superadmin is deliberately a manual,
  undocumented-in-any-script step (`UPDATE profiles SET is_superadmin = true ...` —
  see DEPLOYMENT.md §5). Nothing automates it, on purpose. The real production
  superadmin (`axelytix3@gmail.com`) was created and verified this pass — registered
  through the app's own flow (real Argon2id hash), promoted via that one manual step,
  full login/forced-change cycle live-tested. Its password is not known to this
  session going forward: rather than transmit a temp password through the agent doing
  this work, a real password-reset email was triggered via the existing self-service
  flow so only the real account owner ever knows the final password. If that email
  didn't arrive, use "Forgot password" on the login page with that address — a real
  reset token is already on file (confirmed server-side) and SMTP delivery has been
  proven working repeatedly this project.
- A number of disposable test tenants created during this project's various audit
  passes remain in production as empty, harmless shells — no `DELETE /tenants`
  endpoint exists anywhere in the API (confirmed by grep across every router), so
  there is currently no way to remove a tenant short of direct database access. Not a
  security issue (each is fully isolated, same as any real tenant), just leftover
  clutter an operator with DB access may want to clean up eventually.

## Where to go next

| Question | Document |
|---|---|
| How is the system built, end to end? | [ARCHITECTURE.md](ARCHITECTURE.md) |
| How do I deploy or roll back a change? | [DEPLOYMENT.md](DEPLOYMENT.md) |
| How does auth/authorization actually work? | [SECURITY.md](SECURITY.md) |
| How do backups and disaster recovery work? | [BACKUP_ARCHITECTURE.md](BACKUP_ARCHITECTURE.md), [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md) |
| How does the desktop app work? | [DESKTOP.md](DESKTOP.md) |
| Why did this move off Supabase? | [MIGRATION.md](MIGRATION.md) |
| What's the exact status of every planned feature? | [HANDOVER_MASTER_PLAN.md](HANDOVER_MASTER_PLAN.md) |
| Local dev setup, repo layout | [README.md](README.md) |
