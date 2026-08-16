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
(`https://speed-num.vercel.app`), not `*`. `backend/app/config.py`'s `cors_origin_list`
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

## Authentication decision: keep Supabase Auth (Option B)

Evaluated whether to replace Supabase Auth with a self-hosted system, as the architecture
brief invited if it could be done "securely and efficiently."

**Resource cost**: modest either way. Argon2id hashing and a small auth server would not
meaningfully strain this KVM 4 (4 vCPU / 15GB RAM, currently ~1.1GB used across the entire
Postgres+MinIO+API stack) — resource usage is *not* the deciding factor here, unlike the
brief's framing suggested it might be.

**Operational/security complexity**: the deciding factor instead. Self-hosting a *correct* auth
system means building, from nothing currently in this codebase: password hashing (Argon2id),
access/refresh token issuance with rotation and revocation, a session/token store, password
reset and email verification token flows, OTP/magic-link generation and one-time-use
enforcement, brute-force/lockout handling, CSRF protection for any cookie-based flow, and a
signing-key rotation strategy — each one a place a subtle, dangerous bug can hide, in a part of
the system that currently has zero authentication vulnerabilities because it delegates
entirely to a maintained, widely-used identity provider. Replacing it would trade a
proven system for a new, unaudited one, in an area where mistakes are unusually costly
(session fixation, timing attacks, token replay).

**No live Supabase credentials were available in this session** to validate that a replacement
preserves the current JWT contract (`sub`/`email`/`role`/`user_metadata.{client_id,firm_name,
is_staff}`, read throughout `deps.py` and the frontend's `proxy.ts`) without a regression —
building this blind would be worse than not building it yet.

**Recommendation: keep Supabase Auth.** The codebase already isolates it cleanly — JWT
verification in `security.py` reads only `SUPABASE_URL`/`SUPABASE_JWT_SECRET`, and admin
operations go through the single `supabase_admin.py` module — so this remains a clean provider
swap later, not a rewrite, if the owner chooses to revisit it with dedicated time and a real
Supabase test project to validate against.

**If self-hosted auth is pursued later**, the migration path: (1) implement a parallel
`auth_local.py` matching `supabase_admin.py`'s exact function signatures
(`create_auth_user`/`reset_password`/`delete_auth_user`/`generate_magic_link`), plus new
login/refresh/logout endpoints; (2) add a migration for credential/session storage (the
portable schema already has no `auth.users` dependency to conflict with this); (3) extend
`security.py` to verify tokens from either provider during a transition window, gated by an
`AUTH_PROVIDER` setting; (4) update the frontend to call the new endpoints instead of
`@supabase/ssr` for login/signup/refresh; (5) test password hashing, token rotation/revocation,
OTP/magic-link one-time-use and expiry, rate limiting, and session fixation specifically, ideally
as a dedicated security review pass; (6) run both providers in parallel and validated before
retiring Supabase Auth — which, like any step that disables working authentication, needs
explicit owner approval before it happens, not just before it's deleted.

## Email / OTP

OTP, password reset, email verification, and invitations are all Supabase Auth features
(magic-link generation goes through `supabase_admin.py::generate_magic_link`); this
application does not run its own OTP or verification-token logic. Credential/welcome emails
(a separate concern from Supabase's own auth emails) go through `services/email.py`'s existing
SMTP/Resend abstraction (`EMAIL_PROVIDER=auto|smtp|resend`), already reviewed in an earlier
session and unchanged here. **Not exercised with a real send this session** — no SMTP/Resend
credentials were available. Existing DNS: SPF (`v=spf1 include:_spf.mail.hostinger.com ~all`)
covers the Hostinger-SMTP path this deployment defaults to; DMARC is currently `p=none`
(monitor-only, no enforcement) — a reasonable early-stage setting, worth tightening to
`quarantine`/`reject` later once SPF/DKIM alignment is confirmed solid, but not changed here
since that's a DNS policy decision, not something broken. No mail server runs on the VPS
itself; `EMAIL_PROVIDER=smtp` in the deployed config points at `smtp.hostinger.com`, an
external mailbox, not a locally-hosted MTA.

## What this session did not attempt

- **Real authentication end-to-end test** (signup/login/JWT/refresh through a live Supabase
  project) — no credentials available. Marked BLOCKED, not faked.
- **Rate limiting implementation** — documented as a gap with a specific recommendation, not
  implemented, per the reasoning above.
- **Penetration testing** — out of scope; the existing 196-test suite's cross-tenant,
  traversal, and access-control coverage was re-run and confirmed passing, not re-derived.
