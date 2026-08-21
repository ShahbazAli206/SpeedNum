# SpeedNum — Complete Production Architecture, Supabase Exit, VPS Deployment & Vercel Frontend Plan

## Purpose

This is the single implementation brief for Claude Code. Read the entire document before making changes.

The objective is to inspect the SpeedNum repository, redesign the deployment architecture where necessary, remove Supabase dependency wherever practical, deploy the frontend on Vercel, deploy backend/database/storage on the Hostinger VPS, test everything, and leave the system portable to another VPS/hosting provider later.

**Execution rule:** Do not blindly execute destructive production operations. Inspect first, create a plan, implement in reversible phases, test, verify backups, and only then perform production cutover. Never delete the existing Supabase project or production data until the owner explicitly approves it.

---

# 1. Target architecture

SpeedNum is being prepared as a multi-client SaaS/application with client/user data and document storage.

Requirements:

- Security is a major priority.
- Tenant/client isolation must remain strong.
- Multiple projects may eventually run on the same Hostinger VPS.
- The system must be portable: database, uploaded files, configuration and application code must be exportable and movable to another VPS/hosting provider.
- Frontend should use **Vercel for now**.
- Backend should run on the Hostinger VPS.
- PostgreSQL should run on the Hostinger VPS in Docker.
- Object/file storage should be moved away from Supabase where practical.
- Supabase should ideally be removed completely.
- If self-hosted authentication/OTP/email becomes unnecessarily resource-heavy or operationally risky on the VPS, keep **Supabase Auth only** as a fallback/intermediate architecture.
- Supabase PostgreSQL should not remain the permanent production database.
- Supabase Storage should not remain the permanent production file store.
- Do not build a new architecture that requires another large rewrite later.

Preferred architecture:

```text
                         INTERNET
                             |
                             v
                    spidnums.com / www
                             |
                           VERCEL
                             |
                       Next.js Frontend
                             |
                       HTTPS API calls
                             |
                             v
                     api.spidnums.com
                             |
                             v
                       2.25.108.16
                             |
                           CADDY
                             |
                             v
                          FASTAPI
                             |
                 +-----------+-----------+
                 |                       |
                 v                       v
            PostgreSQL             Object Storage
              Docker              S3-compatible
                 |                / MinIO or external
                 v
          Persistent storage
                 |
                 v
          Verified backups
                 |
                 v
           Offsite backup
```

Preferred authentication if it is secure and operationally reasonable:

```text
Vercel frontend
      |
      v
FastAPI/Auth on VPS
      |
      +---- PostgreSQL
      |
      +---- SMTP/transactional email
```

Fallback if self-hosted authentication is too heavy/risky:

```text
Vercel frontend
      |
      +---- Supabase Auth only
      |
      v
FastAPI VPS
      |
      +---- VPS PostgreSQL
      +---- VPS/external object storage
      +---- SMTP/transactional email
```

Supabase PostgreSQL and Supabase Storage must not be used in the final architecture unless explicitly approved as temporary migration sources.

---

# 2. Repository

Repository:

```text
https://github.com/ShahbazAli206/SpeedNum.git
```

Relevant areas identified by the previous audit:

```text
backend/
frontend/
db/migrations/
deploy/
```

Previous audit inspected these files/areas:

```text
backend/app/config.py
backend/app/db.py
backend/app/deps.py
backend/app/security.py
backend/app/services/supabase_admin.py
backend/app/services/storage.py
backend/app/routers/client_documents.py
backend/app/routers/team.py
backend/app/routers/auth.py
backend/app/models.py
backend/scripts/migrate.py

db/migrations/0001_schema.sql
db/migrations/0002_rls.sql
db/migrations/0003_functions.sql
db/migrations/0004_client_books.sql
db/migrations/0007_reminders.sql

frontend/src/lib/supabase/client.ts
frontend/src/lib/supabase/server.ts
frontend/src/proxy.ts
frontend/src/lib/auth.ts
frontend/src/lib/api.ts
frontend/src/lib/api-server.ts
frontend/src/lib/storage.ts

frontend/src/app/(auth)/signup/signup-form.tsx
frontend/src/app/(auth)/login/login-form.tsx
frontend/src/app/portal-login/portal-login-client.tsx
frontend/src/components/dashboard/force-password-modal.tsx

frontend/package.json
```

Do a fresh repository inspection before changing anything. The previous audit is a planning source, not permission to assume the current code is unchanged.

---

# 3. Supabase coupling audit findings

The previous Claude audit concluded that Supabase coupling is narrower than it initially appears.

## PostgreSQL

`DATABASE_URL` is already generic enough to work with ordinary PostgreSQL.

`backend/app/db.py` has a Supavisor/port-6543 branch. A normal VPS PostgreSQL connection on port 5432 should use the normal connection path.

`pgcrypto` and `citext` are used and should remain supported on ordinary PostgreSQL.

`gen_random_uuid()` is provided by `pgcrypto`.

## Authentication

Current application uses Supabase Auth.

Frontend currently uses:

```text
@supabase/ssr
@supabase/supabase-js
```

Backend verifies JWTs using Supabase JWT secret/JWKS.

Backend also uses HTTP calls to Supabase Auth admin endpoints through `supabase_admin.py`.

Current JWT contract identified by the audit:

```text
sub
email
role = authenticated
user_metadata:
    client_id
    firm_name
    is_staff
```

Do not casually change claims during migration.

## Database foreign key blocker

Current migration contains:

```sql
id uuid primary key references auth.users (id) on delete cascade
```

for `public.profiles`.

This cannot remain when `public` data moves to a separate ordinary PostgreSQL instance.

The SQLAlchemy `Profile.id` model reportedly does not itself declare the FK, so the dependency is in migration SQL.

The FK must be removed from the portable schema while preserving profile UUIDs and application behavior.

## Signup trigger blocker

`0003_functions.sql` reportedly contains `handle_new_user()` and an `on_auth_user_created` trigger.

The audit concluded that application logic already handles the relevant provisioning:

- `deps._provision_profile`
- invitation acceptance in `team.py`

Therefore the trigger is believed to be redundant.

Before deleting it, verify all signup/invitation/admin provisioning paths with tests.

## RLS

The audit states that current API database access uses an owner/BYPASSRLS role and tenant isolation is primarily enforced by FastAPI application code.

**Do not interpret removal of Supabase RLS as permission to remove application authorization.**

Tenant isolation must remain enforced by:

```text
TenantUserDep
BookScope
get_book_scope
tenant_id checks
client_id checks
document ownership/path checks
role checks
```

RLS may be retained/reworked for defense in depth on the new PostgreSQL system if practical.

If implementing real RLS, do it deliberately and test it extensively. Never replace application authorization with RLS alone.

## Storage

`backend/app/services/storage.py` reportedly contains Supabase Storage calls behind an abstraction.

Frontend file transfer uses ordinary HTTP/fetch against signed URLs rather than directly uploading file bytes through the Supabase SDK.

Therefore storage should be replaceable without changing the frontend contract.

Preserve the logical path scheme:

```text
{tenant}/{client}/{uuid}-{name}
```

and all tenant/client path ownership checks.

---

# 4. Existing Hostinger VPS configuration

Hostinger VPS:

```text
Host/IP: 2.25.108.16
OS: Ubuntu 24.04.4 LTS
Architecture: amd64
SSH user: deploy
Plan: KVM 4
```

Do not expose secrets in source control.

## Docker

Docker was installed from the official Docker Ubuntu repository.

Versions at the time of this document:

```text
Docker version 29.7.2
Docker Compose version v5.4.0
```

Docker is working.

`deploy` was added to the Docker group.

After reconnecting over SSH:

```bash
groups
```

returned:

```text
deploy sudo users docker
```

Docker test succeeded:

```bash
docker run hello-world
```

and returned the standard:

```text
Hello from Docker!
This message shows that your installation appears to be working correctly.
```

The test container was removed.

## Existing directories

```text
/home/deploy/apps
/home/deploy/data
/home/deploy/backups
/home/deploy/scripts
```

Use this layout as the base for future deployment.

## Docker network

External Docker bridge network:

```text
web
```

created with:

```bash
docker network create web
```

Do not destroy it without a reason.

Verify:

```bash
docker network ls
```

---

# 5. Firewall

UFW was enabled.

Current intended firewall policy:

```text
22/tcp   ALLOW
80/tcp   ALLOW
443/tcp  ALLOW
```

Default:

```text
deny incoming
allow outgoing
deny routed
```

Verify:

```bash
sudo ufw status verbose
```

Do not publicly expose PostgreSQL.

Do not open 5432 to the internet.

Do not open internal application ports unless there is a documented reason.

If SSH can later be hardened, consider key-only authentication and disabling password authentication, but never lock the owner out.

---

# 6. Caddy

Caddy is already installed as a Docker container.

Directory:

```text
/home/deploy/apps/caddy
```

Structure:

```text
/home/deploy/apps/caddy/
├── Caddyfile
├── compose.yml
├── data/
└── config/
```

Existing Compose architecture:

```yaml
services:
  caddy:
    image: caddy:2
    container_name: caddy
    restart: unless-stopped

    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"

    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./data:/data
      - ./config:/config

    networks:
      - web

networks:
  web:
    external: true
```

Caddy is running.

Caddy was validated with:

```bash
docker exec caddy caddy validate --config /etc/caddy/Caddyfile
```

and returned:

```text
Valid configuration
```

HTTPS was verified:

```bash
curl -I https://test.spidnums.com
```

and returned HTTP/2 200.

The current Caddy response is only a temporary test response such as:

```text
HTTPS is working
```

It must be replaced with the actual production reverse proxy configuration.

Do not expose Caddy's admin API publicly.

Caddy is the public TLS/reverse-proxy boundary on the VPS.

---

# 7. Domain and DNS

Domain:

```text
spidnums.com
```

Registrar/DNS management:

```text
Hostinger
```

Expiration shown:

```text
2029-06-22
```

Current Hostinger nameservers:

```text
atlas.dns-parking.com
hyperion.dns-parking.com
```

The domain previously pointed to an older SpeedNum website.

DNS records supplied during setup included:

```text
A @ -> 216.198.79.1
CNAME www -> b5d6909f0aeb40b1.vercel-dns-017.com
A test -> 2.25.108.16
```

Existing email-related records include:

```text
hostingermail-a._domainkey
hostingermail-b._domainkey
hostingermail-c._domainkey

autodiscover -> autodiscover.mail.hostinger.com
autoconfig -> autoconfig.mail.hostinger.com

MX @ -> mx1.hostinger.com
MX @ -> mx2.hostinger.com

TXT @ -> v=spf1 include:_spf.mail.hostinger.com ~all

TXT _dmarc -> v=DMARC1; p=none
```

There are also Resend/Amazon SES-related records:

```text
resend._domainkey
send TXT -> v=spf1 include:amazonses.com ~all
send MX -> feedback-smtp.us-east-1.amazonses.com
```

Do not delete mail records casually.

Current test DNS:

```text
test.spidnums.com -> 2.25.108.16
```

This proves:

```text
DNS -> VPS -> Caddy -> HTTPS
```

The eventual web architecture should preferably be:

```text
spidnums.com
www.spidnums.com
        |
        v
Vercel frontend
```

and:

```text
api.spidnums.com
        |
        v
2.25.108.16
        |
        v
Caddy
        |
        v
FastAPI
```

Inspect current DNS and old-site dependencies before changing records.

---

# 8. Vercel frontend

Frontend must use Vercel for now.

Production architecture:

```text
Vercel
  |
  v
Next.js frontend
  |
  v
https://api.spidnums.com
```

Do not hardcode:

```text
localhost
127.0.0.1
2.25.108.16
```

in production frontend code.

Use environment variables.

Expected example:

```text
NEXT_PUBLIC_API_URL=https://api.spidnums.com
```

Never put secrets into `NEXT_PUBLIC_*`.

Never put these in browser-visible variables:

```text
DATABASE_URL
database password
JWT private/signing secret
SMTP password
S3 secret key
Supabase service-role key
```

---

# 9. PostgreSQL on VPS

Use PostgreSQL on the Hostinger VPS in Docker.

Do not publish port 5432.

Preferred pattern:

```yaml
postgres:
  image: postgres:<supported-version>
  expose:
    - "5432"
```

Backend connects through Docker networking.

Conceptual DSN:

```text
postgresql+asyncpg://speednum:<password>@postgres:5432/speednum
```

Use the actual driver expected by the repository.

Persist data outside disposable containers, preferably:

```text
/home/deploy/data/speednum/postgres
```

or a clearly documented persistent Docker volume.

Credentials must come from environment/secrets.

Never commit production `.env`.

PostgreSQL must not be internet-accessible.

---

# 10. PostgreSQL extensions

Application currently expects:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
```

Verify after startup:

```bash
docker compose exec postgres psql -U <user> -d <database> -c '\dx'
```

Confirm both extensions.

---

# 11. Portable database requirements

The public application database must not depend on:

```text
auth.users
storage.*
Supabase-specific schemas
Supabase-only triggers
Supabase-only functions
```

The `profiles.id -> auth.users(id)` foreign key must be removed from the portable schema.

Preserve all profile IDs and data.

Make migrations work from an empty ordinary PostgreSQL instance.

Test the full migration chain from zero.

---

# 12. Supabase PostgreSQL migration

Do not immediately migrate production.

First:

1. Inspect all migrations.
2. Create a portable migration set.
3. Test from an empty PostgreSQL database.
4. Test with representative data.
5. Test authentication.
6. Test tenant isolation.
7. Test documents.
8. Test startup.
9. Test backup/restore.

Only then migrate production.

Conceptual export:

```bash
pg_dump   --schema=public   --no-owner   --no-privileges   "$SUPABASE_DATABASE_URL"   > speednum_public.sql
```

Do not assume this exact command is sufficient until actual schema dependencies are inspected.

Validate before import.

After import compare:

- tables
- row counts
- primary keys
- indexes
- constraints
- sequences
- migration state
- tenant counts
- profile/user counts
- document metadata
- important business records

Never expose dumps publicly.

---

# 13. Backup and restore

Mandatory before production cutover.

Implement scripts such as:

```text
scripts/backup-postgres.sh
scripts/restore-postgres.sh
scripts/backup-storage.sh
scripts/restore-storage.sh
scripts/health-check.sh
```

Conceptual PostgreSQL backup:

```bash
docker compose exec -T postgres   pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"   > /home/deploy/backups/speednum-$(date +%Y%m%d-%H%M%S).sql
```

Adapt to the actual Compose/project environment.

Test restore into a fresh temporary database/container.

A backup is not considered verified until restore succeeds.

Recommended:

```text
VPS local backup
+
offsite backup
```

---

# 14. Object storage

Move Supabase Storage away.

Preferred interface:

```text
STORAGE_PROVIDER=supabase|s3
```

Keep the Supabase provider temporarily if it helps migration/rollback.

Preserve function contracts:

```text
create_upload_url(path: str) -> tuple[str, str]
create_download_url(path: str, *, expires_in: int) -> str
delete_object(path: str) -> None
```

Frontend should continue using signed URLs.

Storage path:

```text
{tenant}/{client}/{uuid}-{name}
```

must remain.

Never allow arbitrary cross-tenant paths.

Backend owns signed URL creation and authorization.

---

# 15. Storage provider recommendation

Evaluate:

## External S3-compatible storage

Preferred for important production client documents if budget/availability permits.

Use:

- private bucket
- server-side credentials
- presigned URLs
- no public bucket
- lifecycle policies if appropriate
- independent backup

## MinIO on VPS

Acceptable if resource usage and operational simplicity are preferred.

If MinIO:

- private bucket
- no unnecessary public S3 API exposure
- internal Docker networking where possible
- secure admin access
- offsite backups
- disk monitoring
- restore testing

Do not store sensitive client documents only on one VPS disk without an independent backup.

---

# 16. Authentication: remove Supabase if practical

Owner preference is to remove Supabase entirely if possible.

Investigate whether secure self-hosted authentication is practical on the KVM 4 VPS.

Current functionality appears to include:

```text
signup
login
logout
session refresh
password update
password reset
OTP/magic link
email verification
admin user creation
admin password reset
user deletion
invitation flow
```

If replacing Supabase Auth, implement a proper authentication subsystem.

Minimum security requirements:

- Argon2id password hashing
- cryptographically secure random tokens
- short-lived access tokens
- rotating refresh tokens
- refresh token revocation
- short-lived one-time password reset tokens
- email verification tokens
- OTP/magic-link tokens with short expiration and one-time use
- login rate limiting
- brute-force protection
- sensible lockout/throttling
- CSRF protection where cookie authentication is used
- Secure and HttpOnly cookies where appropriate
- SameSite policy appropriate to the Vercel/API topology
- HTTPS only
- no passwords/tokens in logs
- audit logging for security-sensitive operations
- key rotation strategy
- reliable transactional email
- established security libraries rather than custom cryptography

Do not invent cryptographic primitives.

Keep the existing JWT claim contract where practical:

```text
sub
email
role
user_metadata:
  client_id
  firm_name
  is_staff
```

If self-hosted auth is implemented, replace Supabase SDK usage cleanly.

---

# 17. Email and OTP without Supabase

OTP, password reset, email verification and invitation email do not inherently require Supabase.

Use:

```text
SMTP
or
transactional email provider such as Resend/SES
```

The repository already has an email-provider abstraction according to the previous audit.

Use a configuration pattern similar to:

```text
EMAIL_PROVIDER=auto|resend|smtp
```

Never run a public mail server on the VPS unless specifically required.

Server-only credentials:

```text
SMTP_HOST
SMTP_PORT
SMTP_USERNAME
SMTP_PASSWORD
SMTP_FROM
```

or equivalent API credentials.

Do not put email credentials in frontend/Vercel public variables.

Preserve existing DNS mail records unless deliberately changing email infrastructure.

---

# 18. Supabase Auth fallback

If self-hosted Auth is too heavy, complex, or risky for the KVM 4 VPS:

Keep:

```text
Supabase Auth only
```

while using:

```text
Vercel frontend
VPS FastAPI
VPS PostgreSQL
VPS/external object storage
SMTP/transactional email
```

This is an acceptable architecture.

Design auth behind an application/provider abstraction so a future migration is a provider swap rather than another rewrite.

Do not keep Supabase PostgreSQL merely because Supabase Auth remains.

---

# 19. Tenant isolation

This is a highest-priority requirement.

Application authorization remains mandatory.

Never trust frontend-supplied:

```text
tenant_id
client_id
role
is_staff
```

without server-side authorization.

Identity must come from the authenticated session/token.

Every tenant query must enforce tenant scope.

Every client query must enforce client/tenant relationship.

Every document operation must verify:

```text
authenticated user
tenant
client
document record
storage path
authorization
```

Never issue unrestricted storage credentials to browsers.

Never expose PostgreSQL publicly.

Never expose internal Docker ports unnecessarily.

Never log:

```text
passwords
access tokens
refresh tokens
OTP codes
reset tokens
database passwords
service credentials
S3 secret keys
```

---

# 20. CORS

Backend CORS must allow only the actual production frontend origins.

Expected:

```text
https://spidnums.com
https://www.spidnums.com
```

Add Vercel preview origins only if actually required and do so deliberately.

Do not use:

```text
allow_origins=["*"]
```

for authenticated production API access.

If cookies are used, configure credentials, Secure, SameSite and domain correctly.

---

# 21. API hostname

Use:

```text
api.spidnums.com
```

unless there is a documented reason not to.

DNS:

```text
A
api
2.25.108.16
```

Then:

```text
api.spidnums.com
        |
        v
Caddy
        |
        v
FastAPI container
```

Do not expose FastAPI directly to the internet.

---

# 22. Docker architecture

Create:

```text
/home/deploy/apps/speednum
```

Suggested:

```text
/home/deploy/apps/speednum/
├── compose.yml
├── .env
├── deploy/
├── scripts/
├── backend/
├── db/
└── backups/
```

Persistent:

```text
/home/deploy/data/speednum/
├── postgres/
└── storage/        # only if local storage/MinIO is selected
```

Caddy remains separate:

```text
/home/deploy/apps/caddy
```

Do not mix Caddy data with application data.

---

# 23. Docker networking

Use existing:

```text
web
```

for Caddy-facing services.

Use an internal network such as:

```text
speednum_internal
```

Backend and PostgreSQL communicate internally.

PostgreSQL must not publish:

```text
5432:5432
```

If frontend remains on Vercel, it does not need Docker networking.

---

# 24. Container security

Use where practical:

- controlled/pinned image versions
- minimal images
- non-root application users
- read-only filesystem where practical
- dropped capabilities
- no privileged containers unless necessary
- no host Docker socket in app containers
- environment/secrets
- persistent volumes only where needed
- healthchecks
- restart policies
- resource limits after measurement

Do not over-restrict containers before measuring actual requirements.

---

# 25. Health checks

Implement or preserve:

```text
GET /health
GET /health/ready
```

or repository equivalents.

Public health response should be minimal.

Readiness may verify database connectivity.

Do not expose internal stack traces or secrets.

---

# 26. Deployment reproducibility

Deployment must be reproducible.

Preferred workflow:

```bash
git pull
docker compose build
docker compose up -d
```

with explicit database migration commands.

Never depend on manual edits inside running containers.

Persistent configuration must survive container recreation.

---

# 27. Migration command documentation

Inspect the existing:

```text
backend/scripts/migrate.py
```

and preserve its intended interface.

Document the real commands, for example:

```bash
docker compose exec backend python scripts/migrate.py status
docker compose exec backend python scripts/migrate.py apply
```

Do not assume these exact commands exist without inspecting the script.

Never run destructive migrations automatically without a verified backup.

---

# 28. Local testing

Before touching production:

```bash
git status
git diff
git branch
git log -n 10 --oneline
```

Inspect project test/build configuration.

Backend: run actual repository test command, likely:

```bash
pytest
```

if configured.

Frontend, if scripts exist:

```bash
npm install
npm run lint
npm run build
```

Run the repository's actual test scripts rather than inventing replacements.

Test:

- database migrations
- authentication
- authorization
- tenant isolation
- storage
- invitations
- document operations
- email/OTP
- frontend build

---

# 29. Docker testing

Run:

```bash
docker compose config
docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=200
```

Every service must start cleanly.

Do not expose internal ports just to test them.

Use Docker internal networking.

---

# 30. VPS verification

After deployment run:

```bash
hostnamectl
uname -a
df -h
free -h
docker version
docker compose version
docker ps
docker network ls
sudo ufw status verbose
sudo ss -tulpn
docker stats --no-stream
docker system df
```

Expected public listeners should generally be:

```text
22
80
443
```

Do not allow:

```text
5432
```

or development ports to be public.

---

# 31. Caddy verification

Validate:

```bash
docker exec caddy caddy validate --config /etc/caddy/Caddyfile
```

Then reload/restart safely.

Check:

```bash
docker logs --tail=200 caddy
```

Test:

```bash
curl -I https://api.spidnums.com
curl -I http://api.spidnums.com
```

HTTP should redirect to HTTPS if configured.

---

# 32. End-to-end testing

## Authentication

Test:

- signup
- email verification
- login
- logout
- session refresh
- password reset
- OTP/magic link
- force password flow
- invitation
- invited-user acceptance
- admin user creation
- admin password reset
- user deletion

## Authorization

Create at least two tenants.

Verify:

```text
Tenant A -> Tenant A data = allowed
Tenant A -> Tenant B data = denied
Tenant B -> Tenant A data = denied
```

Test API and document operations.

## Documents

Test:

- upload
- download
- delete
- signed URL expiration
- invalid storage path
- cross-tenant path attack
- unauthorized download
- unauthorized delete

## Database

Test:

- create
- update
- delete
- migration status
- PostgreSQL restart
- backend restart
- full Compose restart
- persistent data after restart

---

# 33. Security tests

Before production test at least:

```text
unauthenticated API access
expired token
invalid token
wrong tenant_id
wrong client_id
cross-tenant document path
unauthorized document deletion
unauthorized invitation
role escalation
admin endpoint access
password reset token reuse
OTP reuse
expired OTP
login brute-force behavior
CORS from unauthorized origin
```

Do not perform destructive penetration testing against production without explicit authorization.

Use a staging/test database.

---

# 34. PostgreSQL restart test

Must pass:

```bash
docker compose restart postgres
```

Then verify:

```bash
docker compose ps
```

and application health.

Also test:

```bash
docker compose down
docker compose up -d
```

Data must survive.

Never run:

```bash
docker compose down -v
```

against production unless intentionally deleting persistent volumes.

---

# 35. Backup restore test

Run:

```bash
./scripts/backup-postgres.sh
```

Then restore into a fresh temporary PostgreSQL database/container.

Verify:

```text
table counts
tenant counts
profiles
clients
documents
important indexes
constraints
```

Only then mark backup strategy complete.

---

# 36. Production cutover

Use a controlled maintenance window.

Before cutover:

```text
1. Backup Supabase PostgreSQL.
2. Backup Supabase Storage.
3. Verify backups.
4. Freeze application writes.
5. Export database.
6. Import VPS PostgreSQL.
7. Migrate files.
8. Verify row counts and checksums.
9. Configure production environment.
10. Run migrations/status.
11. Start backend.
12. Run smoke tests.
13. Switch DNS/API/frontend configuration.
14. Test production.
```

Keep old Supabase resources available during a rollback window.

Do not immediately delete them.

---

# 37. Rollback

Database:

```text
DATABASE_URL -> previous Supabase database
```

Storage:

```text
STORAGE_PROVIDER=supabase
```

if old storage remains intact.

Frontend:

```text
Vercel -> previous known-good deployment
```

Authentication:

```text
revert auth provider configuration
```

Rollback must be documented before cutover.

---

# 38. Monitoring

Monitor:

```text
CPU
RAM
disk
Docker containers
PostgreSQL
backend health
Caddy
storage capacity
backup success
```

Useful commands:

```bash
docker stats
free -h
df -h
docker ps
docker logs --tail=200 <container>
```

Configure log rotation.

Do not allow unbounded logs to fill the disk.

---

# 39. Resource planning for KVM 4

Do not assume exact KVM 4 resources without checking the current Hostinger VPS panel.

Measure:

```text
RAM
CPU
disk
PostgreSQL usage
backend usage
storage usage
```

If self-hosted authentication, PostgreSQL, backend and MinIO consume too much:

1. prioritize PostgreSQL/backend/Caddy stability;
2. simplify storage architecture;
3. use external object storage;
4. if needed keep Supabase Auth.

Security and reliability are more important than eliminating every third-party dependency.

---

# 40. Portability

Everything must be movable.

Exportable:

```text
Git repository
.env/configuration template
PostgreSQL dump
PostgreSQL restore procedure
uploaded files/object storage
Caddy configuration
Docker Compose
database migrations
backup scripts
deployment scripts
DNS documentation
```

Do not hardcode Hostinger-specific assumptions into application logic.

VPS IP should exist only in deployment/DNS configuration.

---

# 41. Secrets

Create:

```text
.env.example
```

with placeholders only.

Production secrets stay outside Git.

Never commit:

```text
.env
*.pem
*.key
database dumps
service-role keys
SMTP passwords
S3 secrets
JWT private keys
```

Before commit:

```bash
git status
```

and inspect staged files.

---

# 42. Git workflow

Before changes:

```bash
git status
git branch
git log -n 10 --oneline
```

Use a migration branch, for example:

```text
migration/portable-production-architecture
```

Prefer logical commits:

```text
portable database schema
storage abstraction
authentication adapter
docker deployment
backup/restore
production configuration
```

---

# 43. Documentation required in repository

Create/update:

```text
README.md
DEPLOYMENT.md
ARCHITECTURE.md
BACKUP-RESTORE.md
SECURITY.md
.env.example
```

Also create if useful:

```text
MIGRATION.md
OPERATIONS.md
```

Document exact commands and environment variables.

A new engineer should be able to deploy without this conversation.

---

# 44. Required final Claude report

After implementation report:

```text
ARCHITECTURE
- final architecture
- Vercel configuration
- VPS services
- database
- storage
- authentication
- email provider

FILES
- changed
- created
- deleted

DATABASE
- migration changes
- extensions
- schema portability
- backup/restore

AUTH
- provider
- signup
- login
- OTP
- password reset
- sessions
- invitations

STORAGE
- provider
- bucket
- signed URLs
- migration status

SECURITY
- firewall
- public ports
- CORS
- tenant isolation
- secrets
- TLS

TESTS
- unit
- integration
- frontend build
- Docker
- migrations
- authentication
- tenant isolation
- storage
- restore

DEPLOYMENT
- exact commands
- environment variables
- DNS
- Vercel
- VPS

BACKUP
- backup command
- restore command
- storage
- offsite backup

ROLLBACK
- database
- storage
- frontend
- authentication

RESOURCE USAGE
- CPU
- RAM
- disk
- containers

OPEN RISKS
- unresolved items
- owner approvals required
```

---

# 45. Immediate execution sequence

```text
PHASE A — INSPECT
    |
    +-- inspect repository
    +-- inspect packages
    +-- inspect Docker
    +-- inspect migrations
    +-- inspect Supabase references
    +-- inspect auth
    +-- inspect storage
    +-- inspect tests
    |
    v
PHASE B — DESIGN
    |
    +-- implementation plan
    +-- conflicts
    +-- irreversible operations
    |
    v
PHASE C — PORTABILITY
    |
    +-- portable PostgreSQL schema
    +-- remove auth.users FK dependency
    +-- remove redundant Supabase DB trigger
    +-- preserve tenant isolation
    |
    v
PHASE D — STORAGE
    |
    +-- S3 abstraction
    +-- provider switch
    +-- migration tool
    +-- checksum verification
    |
    v
PHASE E — AUTH
    |
    +-- evaluate self-hosted authentication
    +-- implement only if secure/reliable
    +-- otherwise retain Supabase Auth
    |
    v
PHASE F — DEPLOYMENT
    |
    +-- PostgreSQL Docker
    +-- backend Docker
    +-- storage
    +-- health checks
    +-- backup scripts
    |
    v
PHASE G — TEST
    |
    +-- application
    +-- database
    +-- storage
    +-- authentication
    +-- tenant isolation
    +-- Docker
    +-- restore
    |
    v
PHASE H — VERCEL
    |
    +-- production build
    +-- environment variables
    +-- API domain
    +-- CORS
    |
    v
PHASE I — VPS
    |
    +-- DNS
    +-- Caddy
    +-- backend
    +-- PostgreSQL
    +-- storage
    |
    v
PHASE J — CUTOVER
    |
    +-- verified backup
    +-- freeze writes
    +-- migrate
    +-- verify
    +-- switch
    +-- smoke test
    |
    v
PHASE K — OPERATIONS
    |
    +-- backups
    +-- monitoring
    +-- resource monitoring
    +-- rollback
```

---

# 46. VPS quick reference

```text
VPS:
Hostinger KVM 4

IP:
2.25.108.16

OS:
Ubuntu 24.04.4 LTS

SSH user:
deploy

Docker:
29.7.2

Docker Compose:
5.4.0

Docker network:
web

Caddy:
/home/deploy/apps/caddy

Apps:
/home/deploy/apps

Persistent data:
/home/deploy/data

Backups:
/home/deploy/backups

Scripts:
/home/deploy/scripts

Firewall:
UFW active

Public ports:
22
80
443

PostgreSQL public port:
MUST NOT be exposed

Test hostname:
test.spidnums.com

Test DNS:
2.25.108.16

Caddy:
running in Docker

HTTPS:
verified

Docker:
verified with hello-world

Domain:
spidnums.com

DNS:
Hostinger

Frontend:
Vercel

Backend:
Hostinger VPS

Database:
Hostinger VPS PostgreSQL

Storage:
S3-compatible preferred; MinIO possible with verified offsite backup

Authentication:
self-hosted preferred if secure/reliable;
Supabase Auth fallback

Email:
SMTP/transactional provider
```

---

# 47. Final safety rule

The goal is not merely to make the application run.

The goal is:

```text
secure
portable
backed up
testable
recoverable
maintainable
multi-tenant
resource-aware
```

Do not trade security for convenience.

Do not trade data safety for migration speed.

Do not delete the old system until the new system has:

```text
working application
verified data
verified storage
verified authentication
verified backups
verified restore
verified tenant isolation
verified rollback
```

Only after all are demonstrated should old Supabase PostgreSQL/Storage resources be retired.

## Final instruction to Claude

**Do not stop after writing a plan. Inspect the repository, implement the required code and infrastructure changes, run the tests, prepare the VPS deployment, configure the Vercel frontend, verify the deployment, and report exactly what was completed and what still requires explicit owner approval.**

**Do not perform irreversible production cutover or delete existing Supabase resources without explicit owner approval.**

**If the current repository differs from this document, inspect and adapt rather than guessing.**
