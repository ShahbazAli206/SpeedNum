# SpeedNum — Security

Status as of the `migration/portable-production-architecture` branch, based on checks
actually run against the live VPS staging deployment — see each item for how it was verified,
and what wasn't.

## Network exposure

**Verified** (via `ss -tulpn` on the VPS and `docker ps`'s ports column, both read directly,
not assumed):

- Only 22 (SSH), 80, and 443 (tcp+udp) are bound to a public interface (`0.0.0.0`/`[::]`) on
  the host at all.
- Postgres and MinIO have **no listening socket on any host-visible interface** — not a public
  one, not even loopback — because neither publishes a Docker host port; they exist only
  inside Docker's own bridge networks. This is a stronger guarantee than a firewall rule: there
  is nothing for a firewall to need to block, since the port isn't reachable from the host's
  network stack at all, only from other containers on the same Docker bridge.
- Caddy's admin API (2019) is not published either.

**Not independently re-verified this session:** `sudo ufw status verbose` — this environment
has no interactive sudo (no TTY, no configured askpass helper), so the command cannot run
non-interactively. The user-supplied brief states UFW is active with default-deny-incoming and
only 22/80/443 allowed; that is taken as given, not re-confirmed by this session. The `ss`
finding above is independent of UFW's specific rules and holds regardless of firewall state,
since Postgres/MinIO have no host-level socket for UFW to need to filter in the first place.

## TLS

**Verified**: `curl -I https://test.spidnums.com` returns a valid response; `curl -I
http://test.spidnums.com` returns `308 Permanent Redirect` to HTTPS; the certificate (checked
via `openssl s_client`) is a current Let's Encrypt cert for `test.spidnums.com`, auto-issued and
auto-renewing via Caddy. HSTS (`Strict-Transport-Security: max-age=31536000;
includeSubDomains`) is set on every response from the app's Caddy site block.

## CORS

**Verified**: `CORS_ORIGINS` in the deployed `api.env` is the exact Vercel origin
(`https://syedi.spidnums.com`), not `*`. `backend/app/config.py`'s `cors_origin_list`
already refuses to silently widen this — the only way to add an origin is to list it
explicitly, or scope `CORS_ORIGIN_REGEX` to this project's own preview-hostname pattern (never
a bare `vercel.app` wildcard, which a prior session already found and removed).

## Secrets

**Verified**: `deploy/.env` and `deploy/api.env` are gitignored (`.env` / `.env.*` with
`!.env.example`), confirmed present on the VPS with mode `600`, and `git log -p` on the
branch's diff was reviewed before every push — no secret value was committed. The frontend's
four `NEXT_PUBLIC_*` variables (`API_URL`, `SITE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`) are
the only ones referenced anywhere in `frontend/src` (checked with a repo-wide grep); none of
them is a secret — the Supabase anon key is designed to be public. No database password,
service-role key, JWT signing key, or MinIO credential exists in any `NEXT_PUBLIC_*` variable
or anywhere under `frontend/src`.

## Database

**Fixed this session, verified**: the official `postgres` Docker image makes `POSTGRES_USER`
a full superuser at cluster init unconditionally — confirmed by querying `pg_roles` on the
live deployment (`rolsuper`/`rolcreatedb`/`rolcreaterole`/`rolreplication`/`rolbypassrls` all
`t`). The application now connects as a separate `speednum_app` role instead — created via
`ALTER DATABASE speednum OWNER TO speednum_app` (which grants schema-create rights implicitly
through Postgres's `pg_database_owner` membership, covering future migrations) plus explicit
`GRANT ALL ... ON ALL TABLES/SEQUENCES IN SCHEMA public` and `GRANT EXECUTE ON ALL FUNCTIONS`
for existing objects. Verified with `pg_roles` (all five superuser-class flags `f` for the new
role) and a live spot-check that it can both `SELECT` from an existing table and `CREATE
TABLE`/`DROP TABLE` (proving `migrate.py apply` will keep working for future migrations under
this role). `deploy/DEPLOYMENT.md`'s "Least-privilege database role" section has the exact
one-time script; it needs to run once per fresh Postgres data directory, not on every deploy.

Extensions installed: `pgcrypto`, `citext` (both required by the schema), plus `plpgsql`
(built-in). No unnecessary extensions.

## Object storage

**Verified** with real requests, not just configuration review:
- `mc anonymous get local/documents` reports `private`.
- An actual unauthenticated `GET` to `https://test.spidnums.com/documents/anything.txt` (no
  signature, no credentials) returns `403`.
- A full presigned PUT → GET → DELETE round trip succeeds through Caddy over HTTPS; after
  delete, a subsequent presigned-download attempt correctly raises "That file is no longer in
  storage" rather than returning a broken link.
- Presigned URL expiry: 900s for uploads, 300s for downloads (`storage_s3.py`,
  `storage_supabase.py` — identical values, matching the original Supabase-based design).
- Tenant/client path isolation is enforced entirely in application code, before any URL is
  signed (`routers/client_documents.py::_mint_path`/`_prefix_for`), not by MinIO itself — MinIO
  has no concept of tenants. This is covered by 22 existing unit tests
  (`backend/tests/test_storage.py::TestPrefixConfinement`, including path-traversal attempts
  like `../../../etc/passwd`), all passing (196/196 total suite).

## Request size limits

**Regression found and fixed this session**: the previously-written (never deployed) nginx
config had `client_max_body_size 12M` specifically to bound CSV/XLSX import uploads
(`routers/imports.py` — the only endpoint where a client-supplied file body reaches the API
itself; document uploads bypass the API entirely). Replacing nginx with Caddy dropped this
limit with no equivalent. Fixed via Caddy's `request_body { max_size 12MB }` on the API route.
**Verified**: a 13MB POST to a real endpoint returns `413`; a normal-sized POST to the same
endpoint still succeeds (`201`).

## Rate limiting / brute-force protection

**Implemented and verified against the live deployment.** Login/signup/password-reset/OTP are
still not FastAPI endpoints at all — they go directly from the browser to Supabase Auth, whose
own platform-level rate limiting is outside this application's control either way. What *is* in
this application's control, and was previously unprotected, now has a limit:
`POST /team`, `.../resend-credentials`, `POST /team/invitations`, `POST /users`,
`.../resend-credentials`, `POST /clients/{id}/portal-invite` (20/hour per tenant),
`POST /import/users/commit` (5/hour per tenant — lower, since one call can itself create up to
200 logins), and the public, unauthenticated `POST /public/leads` form (5/5min per IP).

Backed by a new Postgres table (`db/migrations/0008_rate_limits.sql`), not Redis or an
in-process counter: `WEB_CONCURRENCY=4` means four separate uvicorn processes, so an in-memory
counter would only ever see one worker's quarter of the traffic — the same class of problem
`services/scheduler.py` already solved with a Postgres advisory lock for the reminder sweep.
Not a Caddy rebuild either, since the stock `caddy:2` image has no rate-limit module and adding
one would mean rebuilding something explicitly called out as "already working, don't rewrite."
A single `INSERT ... ON CONFLICT ... RETURNING` makes the increment-and-check atomic across all
four workers.

**Two real bugs found and fixed by testing against the live deployment, not just reading the
code:**
1. The counter's own commit was riding on the same database transaction as the endpoint it
   guards. `deps.get_session` rolls back the *entire* request transaction on any exception —
   including the `429` this module itself raises, and any unrelated failure later in the same
   endpoint (a duplicate-email `409`, for instance). Left as-is, a rejected request's own
   increment was undone by its own rejection, and a legitimate request's increment would be
   undone by an unrelated later failure — letting a caller who can reliably trigger some other
   error retry indefinitely for free. Fixed by committing the counter immediately, independent
   of the rest of the request.
2. Bulk-provisioning logins is capped tenant-wide, not per-caller, so a large firm doing
   legitimate onboarding could plausibly hit `/import/users/commit`'s 5/hour limit — noted here
   rather than silently, in case it needs raising once real usage is observed.

**Verified end to end** against the live `/public/leads` endpoint (the only rate-limited route
reachable without a Supabase auth token, which this session did not have): a burst of 8 requests
against the 5-per-5-minute limit produced exactly 5×`201` then `429` with `Retry-After: 300`;
the persisted counter grew past the limit rather than staying pinned at it (confirming fix #1
above actually took effect, not just that the fix compiled); and after waiting for the window to
expire, a fresh request succeeded (`201`) again. The tenant-scoped limiters on `/team`, `/users`,
etc. use the identical mechanism (same `_hit()` function, same commit fix) but were not
separately exercised end-to-end, since doing so needs an authenticated admin session this
session had no Supabase credentials to obtain — this is an inference from shared code, not an
independent test of each route.

## Upload size at the storage layer

**Known, pre-existing limitation, not introduced by this migration.** A raw S3/MinIO presigned
`PUT` URL (unlike a presigned *POST* with policy conditions) does not cryptographically bind a
maximum content length — a client could send more bytes than intended. This was equally true
of the original Supabase-based signed-upload flow. Not fixed here (would mean switching the
upload mechanism to presigned POST, a larger change than this pass's scope); documented as a
known limitation. A lower-risk mitigation worth a follow-up: check the actual uploaded object's
size via `head_object` in `register_document` before accepting the metadata row, rejecting
anything unreasonable.

## Error handling / logging

FastAPI's default (no `debug=True` anywhere in `main.py`) returns generic error bodies, not
stack traces, on unhandled exceptions. The one custom exception handler
(`IntegrityError`) returns a plain, non-leaking message. `services/supabase_admin.py` and
`storage_s3.py`/`storage_supabase.py` log warnings on failure but never log the request body,
tokens, or credentials themselves — checked by reading every `log.warning`/`log.error` call
site in those modules.

## SQL injection

Every database query goes through SQLAlchemy's ORM or parameterized `text()` calls (bound
parameters like `:name`, never an f-string or `.format()` built directly into a query) —
checked with a repo-wide grep for the dangerous patterns; none found.

## Authentication decision: self-hosted (superseded the earlier "keep Supabase" call)

An earlier pass on this branch evaluated replacing Supabase Auth and recommended keeping it —
the operational/security complexity of a correct self-hosted system was judged not worth taking
on without dedicated time and a way to validate against real Supabase credentials. The owner
subsequently made the opposite call explicitly: remove Supabase entirely, including Auth. That
decision has since been implemented (`AUTH_PROVIDER=local` is now the default) and verified
against the live deployment — this section replaces the earlier recommendation rather than
sitting alongside it as a still-open question.

**What was actually built**, in `backend/app/services/{password_hash,jwt_keys,local_auth}.py`:
- **Passwords**: Argon2id (`argon2-cffi`'s defaults — the OWASP-recommended variant), verified
  with automatic rehash-on-login if parameters are ever strengthened later.
- **Access tokens**: Ed25519 (EdDSA)-signed JWTs, 15-minute default TTL, verified via a `kid`-keyed
  keyring that supports rotation (`JWT_PREVIOUS_PUBLIC_KEYS` keeps a retired key valid for
  verification only, until its last-issued token would have expired anyway).
- **Refresh tokens**: opaque random tokens, SHA-256-hashed at rest (not Argon2id — these are
  already high-entropy, unlike a human password, so a fast hash is the right tool), rotated on
  every use, with **reuse detection**: presenting an already-rotated or revoked token revokes
  every other session for that profile too, on the theory a stolen token is more likely to be
  replayed than reported. **Verified live**: rotating past a stale cookie, then replaying it,
  correctly returned 401 and killed the still-valid sibling session in the same test.
- **Email verification / magic-link / password reset**: single-use, hashed, short-lived tokens
  (24h / 15min / 1h respectively) — verified live for all three: valid token succeeds, a second
  use of the same token is rejected, an unrelated/malformed token is rejected, and (for password
  reset) the old password stops working while the new one succeeds immediately.
- **Rate limiting**: the same Postgres-backed limiter as the rest of the app, on every endpoint
  that creates a credential or accepts public input — login, register, forgot-password,
  verify-email, and every admin account-creation route.
- **Account lockout**: 10 failed logins locks the account for 15 minutes, independent of and in
  addition to the per-IP rate limit on `/auth/login`.
- **Rollback preserved, not deleted**: `AUTH_PROVIDER=supabase` still works — `security.py` and
  `services/accounts.py` are dispatchers, and the Supabase code paths (`supabase_admin.py`,
  the JWKS-verification branch) are untouched, just no longer the default. This is the same
  pattern already used for `STORAGE_PROVIDER`.

**Verified end-to-end against the live deployment**, not just unit-tested: register → get a
real JWT → `/auth/me` → bootstrap a firm → create a client → refresh (rotation) → replay the old
refresh token (reuse detection fires, both sessions die) → fresh login → forgot-password →
reset-password with the real token → old password rejected, new one works → an admin-provisioned
team-member account logs in with its temp password and correctly hits the existing
`must_change_password` gate → a second, independent tenant cannot see the first tenant's clients
or documents (IDOR attempts return 404, not 403, so existence isn't leaked either) → document
upload/download through MinIO succeeds under the new tokens with no code changes to the storage
layer. See `PROGRESS.md`'s local-auth entry for the exact commands and responses.

**What is not yet done**: OTP as a distinct numeric-code flow was not implemented — the product
only ever used a one-click magic link (`portal-login` in the frontend), never a code-entry UI, so
building a second mechanism nothing calls would have been exactly the "unnecessary second
authentication mechanism" the brief asked not to add. CSRF: not separately implemented, because
this design carries no ambient-cookie-authorized state-changing request — the refresh cookie
only feeds `/api/auth/refresh`, which mints a token, not a state change, and every actual data
mutation requires an explicit `Authorization: Bearer` header a CSRF attacker cannot forge
cross-site.

## Social login (OAuth 2.0 / OIDC)

"Continue with Google" (`services/oauth_google.py`, `local_auth.py`'s `start_oauth`/
`complete_oauth`) — identity verification only. Google never becomes a data store or a
permanent dependency: every session, profile, and byte of business data stays in this
application's own Postgres.

- **Flow**: standard authorization-code grant with PKCE (S256), a random `state` and `nonce`
  per attempt, both stored server-side keyed by `state` (`oauth_login_states`, single-use,
  10-minute TTL) — never trusted from anything the browser could tamper with. The redirect URI
  is a fixed, server-configured value; Google never receives or honors a caller-supplied one.
- **ID token verification**: signature checked against Google's live JWKS (`PyJWT`'s
  `PyJWKClient`, matched by `kid`), plus issuer, audience, and expiration — all in one
  `jwt.decode()` call, not hand-rolled. Covered by 12 unit tests against a real RSA keypair
  standing in for Google's (`backend/tests/test_oauth_google.py`), including forged-signature,
  wrong-issuer, wrong-audience, expired, and nonce-mismatch cases.
- **Account linking**: only on a *verified* email claim (`email_verified: true` from Google) —
  a throwaway Google account cannot take over an existing password-based SpeedNum account
  merely by sharing an unverified address. A brand-new signup (no existing profile, no existing
  linked identity) gets the same tenant-less-profile-then-bootstrap path as a fresh
  `/auth/register`.
- **No provider token retained** — the scope requested is `openid email profile`; nothing
  beyond the already-verified ID-token claims (`sub`, `email`, `email_verified`, `name`) is
  ever stored (`oauth_identities` table).
- **Never exposed until configured**: `GET /auth/oauth/providers` is the only way the frontend
  learns whether a provider is live — no `NEXT_PUBLIC_*` variable ever carries a client secret,
  and the button renders conditionally on that endpoint's answer.
- **Live-tested**: signature/issuer/audience/expiration/nonce checks are real cryptographic
  tests, not mocks. The actual browser flow (a real Google consent screen, a real callback) is
  **BLOCKED** — no `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` exist anywhere in this deployment.
  `GET /auth/oauth/providers` correctly reports `{"google": false}` in production.

**Facebook, Microsoft, Apple — evaluated, not implemented.** SpeedNum's users are accounting
firm staff and their clients signing in with a work email; Google Workspace is the dominant
identity provider in that segment, which is why it was built first. Facebook Login has no
plausible fit for a B2B practice-management tool and was not built. Microsoft (Entra ID) is a
real candidate — plausibly *more* relevant than Google for firms on Microsoft 365 — but no
credentials exist to build and verify it against, and per this session's own instructions
("only implement providers that provide a real business benefit," "do not add unnecessary
providers simply for quantity"), it was left as a scoped recommendation rather than built
speculatively: the same `_OAUTH_PROVIDERS` dispatch table in `local_auth.py` and
`oauth_<provider>.py` module shape used for Google already generalizes to it once someone
decides to prioritize it and obtains a Microsoft Entra app registration. Apple Sign In requires
a paid Apple Developer account and its own key-based client-secret JWT scheme; evaluated and
not pursued for the same reason — no demonstrated need, no credentials, and disproportionate
setup cost for this user base.

## Email / OTP

Password reset, email verification, and magic-link generation are this application's own
(`services/local_auth.py`), not Supabase's — see "Authentication decision" above. All
transactional email, including these, goes through `services/email.py`'s SMTP/Resend
abstraction (`EMAIL_PROVIDER=auto|smtp|resend`). **Real SMTP delivery confirmed live** in the
2026-08-17 session: `POST /settings/email/test` (admin-only, sends a real message through
whatever transport is configured) returned `{"ok": true, "provider": "smtp", ...}` against the
production deployment's actual Hostinger credentials — an earlier session's note that these
credentials were still placeholders is now out of date. Existing DNS: SPF
(`v=spf1 include:_spf.mail.hostinger.com ~all`) covers the Hostinger-SMTP path this deployment
defaults to; DMARC is currently `p=none` (monitor-only, no enforcement) — a reasonable
early-stage setting, worth tightening to `quarantine`/`reject` later once SPF/DKIM alignment is
confirmed solid, but not changed here since that's a DNS policy decision, not something broken.
No mail server runs on the VPS itself; `EMAIL_PROVIDER=smtp` in the deployed config points at
`smtp.hostinger.com`, an external mailbox, not a locally-hosted MTA.

## Disaster-recovery backups

Covered in full in [`BACKUP_ARCHITECTURE.md`](BACKUP_ARCHITECTURE.md). The short version: every
`/admin/backups/*` endpoint requires `is_superadmin` (verified against `deps.SuperadminDep`,
not assumed), every action is audit-logged (`backup_audit_log`) including read-only ones like
listing, a snapshot's manifest hash is re-verified against the database's recorded value on
every read (Postgres is the trust root, not the MinIO object), and the desktop app that
downloads these snapshots encrypts them at rest locally (AES-256-GCM) with a key that is never
written anywhere, derived from a password only the administrator holds.

## What this session did not attempt

- **Real authentication end-to-end test** (signup/login/JWT/refresh through a live Supabase
  project) — no credentials available. Marked BLOCKED, not faked.
- **Rate limiting implementation** — documented as a gap with a specific recommendation, not
  implemented, per the reasoning above.
- **Penetration testing** — out of scope; the existing 196-test suite's cross-tenant,
  traversal, and access-control coverage was re-run and confirmed passing, not re-derived.
