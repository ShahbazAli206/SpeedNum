# SpeedNum — Caseware Integration Implementation Plan
## Client Engagement → Client Documents → Owner Assignment → Caseware Work

**Document purpose:** This is the implementation handoff for Claude Code. It converts `CASEWARE_WORKFLOW_SPEC.md` into a staged, production-oriented implementation plan for the existing SpeedNum portal.

**Important:** This plan is based on the supplied workflow/specification and current official Caseware documentation. The repository itself was not attached in this conversation, so Claude Code MUST inspect the actual repository before changing code and must reconcile any path/schema differences with the existing implementation rather than blindly creating duplicate modules.

---

# 0. Non-negotiable architecture decision

## Do NOT implement this as "iframe Caseware + inject username/password"

The original requirement says that a staff member should remain inside SpeedNum, use their Caseware account, send client documents to Caseware, and work in Caseware.

A normal browser cannot safely or reliably accomplish this by:

```text
SpeedNum page
  -> iframe Caseware
  -> JavaScript fills Caseware username/password
```

Reasons:

1. Cross-origin iframe content is protected by the browser same-origin policy.
2. Caseware may prohibit framing through CSP / frame-ancestor / X-Frame-Options controls.
3. SpeedNum cannot assume it can manipulate the DOM of a cross-origin Caseware page.
4. Storing/replaying Caseware passwords is a major security and contractual risk.
5. A technical workaround that bypasses Caseware's framing/security controls must NOT be shipped without explicit authorization from Caseware.

Therefore the implementation MUST use an officially supported Caseware integration mechanism.

---

# 1. Current SpeedNum architecture — reuse, do not rebuild

The supplied specification says the existing stack is:

- Backend: Python + FastAPI
- ORM: async SQLAlchemy 2.0
- Database: PostgreSQL
- Object storage: MinIO/S3
- Uploads: presigned direct-to-storage
- Frontend: Next.js 16 App Router
- React 19
- TypeScript
- Tailwind v4
- Electron desktop build under `desktop/`
- Multi-tenant: one `Tenant` = one accounting firm

The existing workflow already contains:

- `EngagementLetter`
- `EngagementLetterItem`
- client portal
- `Document`
- client document upload
- `Task`
- `Task.assignee_id`
- `Client.owner_id`
- notifications/email
- task timers
- role/permission system

The supplied spec identifies these as existing and says they should not be rebuilt.

Before coding, Claude Code MUST inspect:

```text
backend/app/models.py
backend/app/routers/engagements.py
backend/app/routers/portal.py
backend/app/routers/client_engagements.py
backend/app/routers/client_documents.py
backend/app/routers/client_documents_staff.py
backend/app/routers/task_attachments.py
backend/app/routers/workflows.py
backend/app/services/engagement_signing.py
backend/app/permissions.py
backend/app/routers/task_timers.py
frontend/src/app/(firm)/engagements/
frontend/src/app/engagement/[token]/
frontend/src/app/dashboard/engagements/
frontend/src/app/dashboard/documents/
frontend/src/app/(firm)/
frontend/src/app/(firm)/integrations/
desktop/
```

If any path differs, locate the equivalent existing implementation first.

---

# 2. Target business workflow

The production workflow should become:

```text
OWNER
  |
  | 1. Create engagement letter
  v
CLIENT
  |
  | 2. Open secure signing link
  | 3. Accept/sign
  v
SPEEDNUM
  |
  | 4. Engagement becomes signed
  | 5. Client document upload becomes available
  v
CLIENT PORTAL
  |
  | 6. Upload financial documents
  v
SPEEDNUM STORAGE
  |
  | 7. Store Document metadata + MinIO/S3 object
  |
  +----> OWNER can see document
  |
  +----> ASSIGNED STAFF can see document
  |
  +----> OTHER STAFF cannot see document
  v
OWNER
  |
  | 8. Create task
  | 9. Assign task to staff
  v
STAFF
  |
  | 10. Open assigned task
  | 11. See permitted client documents
  | 12. Link/create Caseware engagement
  | 13. Send selected documents to Caseware
  | 14. Work in Caseware
  | 15. Return to SpeedNum
  | 16. Mark task In Progress / Complete
  v
OWNER
  |
  | 17. Review task/status
  v
COMPLETE
```

---

# 3. Critical authorization rule

The system must enforce:

> Owner can see all firm client documents.

> Staff member can see documents for a client only when the staff member is authorized for that client.

> Unassigned staff must receive 403/404 and must not be able to discover document IDs, download URLs, metadata, or Caseware mappings.

The current supplied spec says the intended primary relationship is:

```text
Client.owner_id -> Profile
```

However, it also identifies an important open question:

```text
Task.assignee_id -> Profile
```

A task assignee may not necessarily be the same person as `Client.owner_id`.

## Recommended production rule

Use a dedicated authorization function rather than scattering conditions through routers.

Create/reuse something conceptually equivalent to:

```python
can_access_client_documents(
    actor_profile,
    client,
    task=None
)
```

Recommended policy:

```text
Owner
  -> YES

Staff with clients.view_all
  -> YES, subject to existing tenant/permission rules

Staff == Client.owner_id
  -> YES

Staff == Task.assignee_id for an active task
  -> YES ONLY if product owner chooses task-scoped access

Everyone else
  -> NO
```

The exact task-scoped rule must be confirmed before production because it changes security boundaries.

For the first implementation, prefer the simpler and safer rule:

```text
document access follows Client.owner_id
```

and do NOT silently grant task-based document access until explicitly approved.

If the business requirement is that a clerk can work on a one-off task without becoming the client owner, implement task-scoped access as a separate, audited permission.

---

# 4. First implementation phase — repository audit

Claude Code MUST NOT start by writing Caseware code.

First perform a read-only audit.

Create:

```text
docs/CASEWARE_REPO_AUDIT.md
```

Record:

1. Existing database models.
2. Existing migration framework.
3. Existing authentication/session implementation.
4. Existing permission helpers.
5. Existing document authorization.
6. Existing MinIO/S3 service.
7. Existing notification service.
8. Existing task routes.
9. Existing client routes.
10. Existing integrations UI.
11. Existing environment variable conventions.
12. Existing frontend API client conventions.
13. Existing background job/queue infrastructure.
14. Existing audit logging.
15. Existing Electron architecture.
16. Existing test structure.

Do not duplicate existing services.

---

# 5. Second phase — Caseware product discovery gate

Before enabling production Caseware integration, determine exactly which Caseware product the firm uses.

Possible products include:

```text
Caseware Cloud
Caseware Working Papers
Caseware IDEA
other Caseware Cloud applications
```

This distinction is essential.

## If Caseware Cloud

Proceed with the REST API investigation.

Caseware's official documentation currently says:

- Cloud API V2 is recommended for new implementations.
- Authentication uses OAuth 2.0 client credentials.
- The integration is server-to-server.
- API clients are created from Cloud Settings → Integration → API Settings.
- A firm can create up to 50 API clients.
- API clients can be assigned roles and app access.
- API client secrets are displayed only when created and should be stored securely.

Official references:

- https://www.caseware.com/docs/en/cloud/caseware-cloud/cloud-api/get-started-with-cloud-api
- https://www.caseware.com/docs/en/cloud/caseware-cloud/api-settings
- https://www.caseware.com/docs/en/cloud/caseware-cloud

## If Working Papers

Do NOT pretend it is a browser application.

Working Papers is desktop software. The web portal integration must be designed differently, potentially using file transfer/sync or the existing Electron desktop application, subject to Caseware's supported integration mechanisms.

## If IDEA or another desktop product

Stop the web-embedding implementation and perform a separate product-specific integration design.

---

# 6. Caseware Cloud connection model

If the firm's product is Caseware Cloud and the plan permits API access, create a firm-level connection.

Recommended model:

```text
CasewareConnection
------------------
id
tenant_id
product
region
firm_identifier
api_base_url
client_id
client_secret_ciphertext
status
last_error
created_by
created_at
updated_at
```

Do NOT store a raw API token permanently if the token can be regenerated.

The Caseware API uses client credentials to obtain an API token. Cache the short-lived token server-side.

Recommended runtime flow:

```text
SpeedNum request
    |
    v
CasewareService
    |
    +-- cached token valid?
    |       |
    |       +-- yes -> reuse
    |
    +-- no -> obtain new token
    |
    v
Caseware API
```

Use Redis if the project already has Redis. Otherwise use a safe server-side cache appropriate to the existing architecture.

Never expose:

```text
client_secret
API token
encrypted secret
```

to the browser.

---

# 7. Do NOT initially create CasewareCredential for passwords

The original spec proposed:

```text
CasewareCredential
```

for staff usernames/passwords.

This should NOT be implemented as the default path.

Reason:

Caseware's Cloud API uses an application-level client credential flow, and Caseware Cloud supports SSO. The official SSO documentation says Cloud supports SSO with Entra ID, ADFS and Okta using OpenID Connect.

Therefore the preferred order is:

```text
1. Caseware API client credentials
2. Caseware SSO / OIDC
3. Officially supported delegated/embedded session mechanism if Caseware provides one
4. Only if Caseware explicitly supports another credential model
5. Never silently build password scraping/replay
```

Only add a password credential vault if Caseware and the commercial/security requirements explicitly authorize it.

---

# 8. SSO architecture

Caseware Cloud supports SSO using OpenID Connect with supported identity providers.

Important:

```text
SSO != iframe
```

SSO means:

```text
User authenticates through approved identity provider
        |
        v
Caseware trusts identity
        |
        v
User enters Caseware without typing password again
```

It does NOT automatically mean:

```text
Caseware can be embedded in SpeedNum
```

Therefore implement SSO as a separate capability.

Recommended model:

```text
CasewareConnection
    |
    +-- api configuration
    |
    +-- sso configuration/status
```

Do not implement a custom fake SSO flow.

---

# 9. Caseware mapping model

SpeedNum needs a durable mapping between its objects and Caseware objects.

Recommended model:

```text
CasewareLink
------------
id
tenant_id
client_id
task_id nullable
engagement_letter_id nullable

caseware_entity_id nullable
caseware_engagement_id nullable
caseware_file_id nullable

caseware_app nullable
status
created_by
created_at
updated_at
```

The exact Caseware IDs must be based on the actual API responses available to the firm's Caseware plan.

Do not hard-code assumptions such as:

```text
caseware_file_id == engagement_id
```

unless the API documentation for the selected product confirms it.

---

# 10. Document synchronization model

Every SpeedNum Document that is pushed to Caseware needs an independent sync record.

Recommended:

```text
DocumentCasewareSync
--------------------
id
tenant_id
document_id
caseware_link_id
caseware_document_id nullable
status
error_code nullable
error_message nullable
attempt_count
last_attempt_at
synced_at
created_at
updated_at
```

Statuses:

```text
pending
uploading
synced
failed
cancelled
```

Optional:

```text
replaced
```

if later bidirectional/version synchronization is supported.

Never infer sync status merely from whether a Caseware ID is non-null.

---

# 11. Caseware API service layer

Do not call Caseware directly from route handlers.

Create a service boundary similar to:

```text
backend/app/services/caseware/
    __init__.py
    client.py
    auth.py
    entities.py
    engagements.py
    documents.py
    mappings.py
    exceptions.py
    schemas.py
```

If the repository has a different service organization, follow it.

The service should expose application-level operations such as:

```python
get_connection(tenant_id)

get_api_token(connection)

list_entities(connection)

find_entity(connection, ...)

create_engagement(connection, ...)

get_engagement(connection, caseware_engagement_id)

upload_document(connection, ...)

get_document(connection, ...)
```

Do not expose Caseware-specific HTTP mechanics throughout the application.

---

# 12. Caseware API client requirements

The client should:

- use HTTPS only
- use V2 API where supported
- obtain tokens server-side
- cache tokens
- enforce request timeouts
- retry only safe transient failures
- log request correlation IDs, not secrets
- redact authorization headers
- classify 4xx vs 5xx errors
- surface Caseware API errors to application logs
- return typed application objects
- never return client secrets to frontend
- never log uploaded document contents

Example conceptual interface:

```python
class CasewareClient:
    async def authenticate(self) -> Token:
        ...

    async def list_entities(self, ...):
        ...

    async def create_engagement(self, ...):
        ...

    async def upload_document(self, ...):
        ...

    async def get_engagement(self, ...):
        ...
```

---

# 13. Tenant isolation

Every Caseware-related row MUST have:

```text
tenant_id
```

Never allow:

```text
tenant A user
    ->
tenant B CasewareConnection
```

Every service method should derive tenant scope from the authenticated actor/context rather than trusting a frontend-supplied tenant ID.

Bad:

```http
POST /caseware/connections
{
  "tenant_id": 99
}
```

Better:

```text
authenticated profile
   ->
profile.tenant_id
   ->
connection for that tenant
```

---

# 14. Owner-only Caseware administration

Caseware connection management should initially be Owner-only.

Owner can:

```text
Connect Caseware
Disconnect
Test connection
View connection status
Configure API client
Configure supported SSO settings
Map Caseware entity
View integration errors
Revoke connection
```

Staff should NOT be able to:

```text
view client secret
replace API client credentials
change tenant Caseware connection
change firm-wide SSO
change Caseware permissions
```

Staff may be allowed to:

```text
view "Connected"
open assigned Caseware work
send permitted documents
```

---

# 15. Integrations UI

The existing:

```text
frontend/src/app/(firm)/integrations/
```

is described as a shell.

Extend it rather than creating another integrations area.

Add:

```text
Caseware
```

card/page.

Suggested UI:

```text
Integrations
---------------------------------

Caseware Cloud
Status: Not connected

[ Connect Caseware ]
```

Connected:

```text
Caseware Cloud
Status: Connected

Firm: ABC Accounting
Region: ...
API: Connected
SSO: Configured / Not configured

[ Test Connection ]
[ Configure ]
[ Disconnect ]
```

Never show:

```text
client_secret
```

---

# 16. Connection wizard

Owner flow:

```text
Integrations
  ->
Caseware
  ->
Connect
```

Screen 1:

```text
Which Caseware product?

( ) Caseware Cloud
( ) Working Papers
( ) Other
```

For the first implementation, if only Caseware Cloud is supported:

```text
Caseware Cloud
```

Screen 2:

```text
Caseware Region
Caseware Firm Identifier
Client ID
Client Secret
```

Add warnings:

```text
Credentials are stored encrypted on the server.
They are never exposed to staff users or browser JavaScript.
```

Screen 3:

```text
Test Connection
```

The backend verifies credentials.

Screen 4:

```text
Connection successful
```

Then persist encrypted configuration.

---

# 17. Encryption

Secrets must be encrypted at rest.

Recommended architecture:

```text
Environment secret / KMS master key
              |
              v
Encryption service
              |
              v
encrypted Caseware secret in PostgreSQL
```

Never use a key stored in the same database row as the encrypted secret.

If the project already has an encryption/key-management service, reuse it.

If not, create:

```text
backend/app/services/secrets.py
```

with:

```python
encrypt_secret(value)
decrypt_secret(ciphertext)
```

The encryption master key must come from environment/secret management.

Example:

```env
CASEWARE_ENCRYPTION_KEY=...
```

Do NOT commit it.

---

# 18. Engagement mapping workflow

Do not automatically create a Caseware engagement merely because an engagement letter is signed unless the Caseware product/API and business rules are confirmed.

Recommended first version:

```text
Client
  ->
Task
  ->
Caseware section
  ->
"Link Caseware Engagement"
```

Owner/staff sees:

```text
Caseware
--------------------------------
Not linked

[ Select Caseware Entity ]
[ Select Caseware Engagement ]

[ Save Link ]
```

If API creation is supported and desired:

```text
[ Create Caseware Engagement ]
```

Then the backend stores:

```text
caseware_entity_id
caseware_engagement_id
```

in `CasewareLink`.

---

# 19. Document push workflow

On the staff task page:

```text
Task: 2026 Annual Accounts
Client: ABC Ltd.

Client Documents
---------------------------------
[x] Bank Statements.pdf
[x] Trial Balance.xlsx
[ ] Tax Return.pdf
[x] General Ledger.xlsx

[ Send Selected to Caseware ]
```

Backend flow:

```text
Staff request
   |
   v
Authenticate SpeedNum user
   |
   v
Check tenant
   |
   v
Check task access
   |
   v
Check client document access
   |
   v
Check CasewareLink
   |
   v
Read document metadata
   |
   v
Generate secure server-side storage access
   |
   v
Stream/download document server-side
   |
   v
Caseware API upload
   |
   v
Save DocumentCasewareSync
   |
   v
Return status
```

Do not give the browser the Caseware API credentials.

---

# 20. Do not make the browser proxy arbitrary Caseware URLs

Avoid a route such as:

```text
/api/caseware/proxy?url=https://...
```

This can become an SSRF/security problem.

Caseware API URLs should be generated from trusted configuration:

```text
CasewareConnection.api_base_url
```

and validated against an allowlist / expected Caseware host pattern.

The user must never control the destination host.

---

# 21. File transfer implementation

The SpeedNum source of truth for client uploads remains:

```text
Document
   +
MinIO/S3 object
```

The Caseware integration should consume those objects.

Do not force the client browser to:

```text
download SpeedNum file
  ->
download again
  ->
upload Caseware
```

Instead:

```text
MinIO/S3
   |
   | server-side stream
   v
Caseware API
```

This is better for:

- performance
- privacy
- reliability
- auditability
- user experience

Caseware's documentation states that engagement files can contain supporting Word/Excel/PDF documents and that individual uploads can be up to 500 MB in the relevant Cloud workflow. This should be treated as a Caseware-side constraint, not automatically as a SpeedNum-wide upload limit.

---

# 22. Large-file handling

Do not load a 500 MB document fully into Python memory.

Bad:

```python
data = await file.read()
await caseware.upload(data)
```

Prefer:

```text
MinIO/S3
   ->
stream/chunk
   ->
Caseware upload
```

If the Caseware API requires a specific multipart body, implement bounded streaming/chunking according to the API specification.

Set:

```text
request timeout
upload timeout
maximum file size
```

appropriately.

---

# 23. Async/background processing

Document pushes should preferably become background jobs for larger files.

UI:

```text
[Send to Caseware]
       |
       v
Queued
       |
       v
Uploading
       |
       v
Synced
```

The existing project may already have a queue/background task system.

Claude Code should inspect and reuse it.

If none exists, implement a minimal background mechanism consistent with the current architecture rather than introducing a large new infrastructure dependency.

---

# 24. Idempotency

The same document must not accidentally be uploaded repeatedly because the user double-clicked.

Use an idempotency strategy such as:

```text
tenant_id
document_id
caseware_link_id
```

unique constraint for the active sync mapping where appropriate.

UI should disable:

```text
Send to Caseware
```

while the document is uploading.

Repeated requests should return the existing:

```text
pending/uploading/synced
```

state rather than creating duplicate Caseware documents.

---

# 25. What "inside our portal" means for Phase 1

Phase 1 MUST NOT claim that the Caseware application is embedded unless Caseware explicitly confirms this.

Instead implement:

```text
SpeedNum Task Workspace
```

with:

```text
Client information
Task information
Client documents
Caseware link
Caseware sync status
Work in Caseware
```

The button:

```text
[ Work in Caseware ]
```

should initially use the officially supported navigation/authentication mechanism.

Preferred web experience:

```text
SpeedNum
    |
    | document sync happens inside SpeedNum
    |
    +--> Work in Caseware
             |
             +--> Caseware Cloud / SSO
```

If Caseware provides an officially supported embed/session mechanism, implement it as Phase 2.

---

# 26. Embedded Caseware phase — only after vendor confirmation

Before writing an iframe/webview implementation, obtain written/official confirmation that Caseware supports:

1. embedding
2. permitted parent origins
3. authentication/session mechanism
4. required headers
5. deep linking
6. allowed commercial use
7. API operations
8. user licensing
9. multi-tenant SaaS/OEM use

Only after these are confirmed should Claude implement:

```text
CasewareWorkspace.tsx
```

Potential UI:

```text
┌─────────────────────────────────────────────┐
│ SpeedNum Task                               │
├─────────────────────────────────────────────┤
│ Client: ABC Ltd.                            │
│ Task: Annual Accounts                       │
│                                             │
│ Caseware                                   │
│ ┌─────────────────────────────────────────┐ │
│ │                                         │ │
│ │ Caseware approved embedded workspace   │ │
│ │                                         │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

The implementation must use Caseware's approved mechanism rather than DOM injection.

---

# 27. Electron fallback

The repository already contains:

```text
desktop/
```

The supplied specification identifies Electron as a possible path for a literal in-app desktop experience.

Do NOT implement this immediately.

First determine:

```text
Does Caseware permit the desktop webview/session model?
```

If approved, design:

```text
SpeedNum Electron
      |
      +-- authenticated SpeedNum session
      |
      +-- Caseware web workspace
```

Use a dedicated session partition per user/account.

Do not blindly strip security headers or automate passwords.

Any session/login automation must be explicitly allowed by Caseware.

---

# 28. Task page integration

The assigned staff member's task page should become the primary operational screen.

Example:

```text
Task
------------------------------------------------

Client
ABC Manufacturing Ltd.

Task
2026 Annual Accounts

Assigned To
John Smith

Status
[ In Progress ]

Client Documents
------------------------------------------------
Bank Statement.pdf        Synced
Trial Balance.xlsx        Not synced
General Ledger.xlsx       Synced

[ Send selected to Caseware ]

Caseware
------------------------------------------------
Entity: ABC Manufacturing
Engagement: 2026 Annual Accounts
Status: Connected

[ Work in Caseware ]

Integration Activity
------------------------------------------------
Trial Balance.xlsx
Synced: 2026-09-03 14:32

General Ledger.xlsx
Synced: 2026-09-03 14:35
```

---

# 29. API routes

Follow the project's existing router naming conventions.

Suggested routes:

```text
GET    /caseware/status
POST   /caseware/test-connection
POST   /caseware/connect
PATCH  /caseware/connection
DELETE /caseware/connection
```

Owner-only.

For client/task mapping:

```text
GET    /clients/{client_id}/caseware
POST   /clients/{client_id}/caseware/link
DELETE /clients/{client_id}/caseware/link
```

For task work:

```text
GET  /tasks/{task_id}/caseware
POST /tasks/{task_id}/caseware/link
POST /tasks/{task_id}/caseware/documents/sync
GET  /tasks/{task_id}/caseware/documents
```

The exact routes MUST follow the current API conventions.

Never allow the client to specify an arbitrary:

```text
tenant_id
caseware_connection_id
caseware_entity_id
caseware_file_id
```

without validating ownership and authorization.

---

# 30. Authorization matrix

Implement and test a matrix like this:

| Action | Owner | Assigned staff | Unassigned staff | Client |
|---|---:|---:|---:|---:|
| View Caseware connection | YES | NO | NO | NO |
| Configure Caseware | YES | NO | NO | NO |
| Test Caseware connection | YES | NO | NO | NO |
| View assigned client's documents | YES | YES | NO | Own portal-visible rules |
| Send assigned client's document to Caseware | YES | YES | NO | NO |
| Work in assigned Caseware engagement | YES/allowed role | YES | NO | NO |
| Change Caseware firm connection | YES | NO | NO | NO |
| Access another tenant | NO | NO | NO | NO |

If the existing role system supports `clients.view_all`, incorporate it consistently.

---

# 31. Client portal behavior

The client portal should remain separate from Caseware.

Client:

```text
Client Portal
    |
    +-- Engagement
    |
    +-- Sign
    |
    +-- Documents
    |
    +-- Upload documents
```

The client must NOT see:

```text
Caseware credentials
Caseware connection
Caseware API
staff task
other staff
internal Caseware IDs
```

Client uploads should automatically create SpeedNum `Document` rows through the existing mechanism.

---

# 32. Engagement signed event

The supplied specification says engagement signing is already complete.

Add only the necessary workflow glue.

Recommended event:

```text
Engagement status changes
        |
        v
signed
        |
        +--> enable client document upload
        |
        +--> notify relevant users
        |
        +--> optionally create onboarding task
```

Do not duplicate the existing signing flow.

If event infrastructure already exists, publish/consume an event.

If not, keep it transactional and simple.

---

# 33. Notifications

When a client uploads a document:

```text
Client
  |
  v
Document created
  |
  +--> Owner notification
  |
  +--> Assigned staff notification
```

Do not notify every firm employee.

The notification query must use the same authorization relationship as document access.

When Caseware sync succeeds:

```text
Caseware sync successful
  |
  +--> staff sees status
  |
  +--> optionally owner sees activity
```

Do not send sensitive document contents by email.

---

# 34. Audit logging

Because this workflow involves client financial documents, create/extend audit events for:

```text
engagement_signed
document_uploaded_by_client
document_viewed_by_staff
document_downloaded
caseware_connection_created
caseware_connection_updated
caseware_connection_tested
caseware_connection_revoked
caseware_engagement_linked
document_sent_to_caseware
document_sync_failed
caseware_work_opened
task_assigned
task_status_changed
```

At minimum log:

```text
tenant_id
actor_profile_id
action
resource_type
resource_id
timestamp
success/failure
request/correlation ID
```

Do NOT log:

```text
Caseware client secret
API bearer token
password
document contents
```

---

# 35. Database constraints

Add appropriate indexes.

At minimum consider:

```text
CasewareConnection:
  unique(tenant_id)

CasewareCredential:
  unique(tenant_id, profile_id)
```

ONLY if CasewareCredential is actually approved/needed.

```text
CasewareLink:
  index(tenant_id, client_id)
  index(tenant_id, task_id)
  index(caseware_entity_id)
  index(caseware_engagement_id)
```

```text
DocumentCasewareSync:
  unique(document_id, caseware_link_id)
  index(tenant_id, status)
```

Use the project's existing migration system.

---

# 36. Migration strategy

Do not edit production database manually.

Create migrations for:

```text
caseware_connections
caseware_links
document_caseware_syncs
```

Only create:

```text
caseware_credentials
```

if the final approved architecture actually requires it.

Migration order:

```text
1. CasewareConnection
2. CasewareLink
3. DocumentCasewareSync
4. indexes/constraints
```

Deploy migrations first.

Then deploy application code that uses the new tables.

---

# 37. Environment variables

Use the project's established `.env` naming conventions.

Potential variables:

```env
CASEWARE_API_ENABLED=false
CASEWARE_API_TIMEOUT_SECONDS=30
CASEWARE_ENCRYPTION_KEY=
CASEWARE_ALLOWED_HOSTS=
```

Do NOT put tenant-specific Caseware client secrets into the global `.env` if the application is multi-tenant.

Tenant-specific credentials belong encrypted in the database.

The global encryption key belongs in server secret management.

---

# 38. Production deployment on Hostinger VPS

The Caseware integration does not require Caseware to run on the VPS.

The VPS hosts:

```text
Nginx
Next.js
FastAPI
PostgreSQL
MinIO/S3
Redis/queue if already used
```

Caseware remains external.

Production checklist:

```text
HTTPS enabled
Firewall configured
database backups
MinIO backups
secret encryption
environment variables
no Caseware secrets in Git
no Caseware secrets in frontend
no debug logs containing tokens
outbound HTTPS to Caseware allowed
DNS/TLS valid
worker process running if background sync is used
```

---

# 39. Rate limiting and resilience

Caseware calls should be protected by:

```text
timeouts
retry policy
circuit breaker where appropriate
rate limiting
idempotency
structured logging
```

Retry:

```text
network timeout
temporary 5xx
```

Do not blindly retry:

```text
400
401
403
404
validation error
```

For 401:

```text
refresh/reacquire token
retry once
```

If it fails again:

```text
mark connection error
```

---

# 40. Error UX

Do not expose raw Caseware API responses to users.

Bad:

```text
HTTP 403:
{"internal_stack_trace": ...}
```

Better:

```text
Caseware could not accept this document.

Reason:
Your Caseware connection no longer has permission to upload documents.

Please ask the firm owner to reconnect or update the Caseware integration.
```

The server logs the detailed vendor response securely.

---

# 41. Testing plan

## Unit tests

Test:

```text
token acquisition
token cache
token expiry
secret encryption/decryption
tenant isolation
document authorization
task authorization
Caseware mapping
idempotency
error mapping
```

## API tests

Test:

```text
Owner connects Caseware
Staff cannot connect Caseware
Owner can test connection
Staff can access assigned task
Unassigned staff gets 403/404
Client cannot access Caseware routes
Tenant A cannot access Tenant B
```

## Document tests

```text
client upload
owner sees
assigned staff sees
unassigned staff does not see
client cannot see internal documents
document sync record created
duplicate sync is idempotent
failed sync can be retried
```

## Caseware integration tests

Use a Caseware test/sandbox environment if Caseware provides one.

Never use a production accounting firm's credentials in automated tests.

---

# 42. End-to-end acceptance test

The implementation is not complete until this scenario passes:

### Setup

```text
Tenant:
ABC Accounting

Owner:
Alice

Staff:
Bob
Charlie

Client:
XYZ Manufacturing

Client.owner_id:
Bob
```

### Engagement

Alice creates engagement letter.

Client signs.

Status:

```text
signed
```

### Client upload

Client uploads:

```text
bank.pdf
trial-balance.xlsx
general-ledger.xlsx
```

### Authorization

Alice:

```text
can see all
```

Bob:

```text
can see XYZ documents
```

Charlie:

```text
cannot see XYZ documents
```

### Task

Alice creates:

```text
Task:
2026 Annual Accounts
```

and assigns Bob.

### Caseware

Owner has configured Caseware connection.

Bob opens task.

Bob sees:

```text
Caseware connected
```

Bob selects:

```text
bank.pdf
trial-balance.xlsx
general-ledger.xlsx
```

and clicks:

```text
Send to Caseware
```

The backend transfers the files.

The UI shows:

```text
Synced
```

Bob clicks:

```text
Work in Caseware
```

and is taken to the officially supported Caseware experience/authentication path.

### Security test

Charlie attempts:

```http
GET /clients/XYZ/documents
```

Expected:

```text
403 or 404
```

Charlie attempts:

```http
POST /tasks/{bob-task}/caseware/documents/sync
```

Expected:

```text
403 or 404
```

Client attempts:

```http
GET /caseware/status
```

Expected:

```text
403 or 404
```

---

# 43. Caseware official capability facts to respect

Current Caseware documentation confirms:

## Cloud API

Caseware Cloud API V2 is recommended for new implementations. Authentication uses OAuth 2.0 client credentials and is intended for server-to-server communication.

Reference:

https://www.caseware.com/docs/en/cloud/caseware-cloud/cloud-api/get-started-with-cloud-api

## API client

Caseware Cloud API clients are created from:

```text
Cloud
  ->
Settings
  ->
Integration
  ->
API Settings
```

The firm needs Admin/equivalent permissions.

Caseware currently documents a maximum of 50 API clients per firm and recommends one application per API client.

Reference:

https://www.caseware.com/docs/en/cloud/caseware-cloud/api-settings

## SSO

Caseware Cloud supports SSO with Entra ID, ADFS and Okta using OpenID Connect.

Reference:

https://www.caseware.com/docs/en/cloud/caseware-cloud/administration/single-sign-on/single-sign-on-faqs

## Engagement documents

Caseware Cloud engagement files can contain supporting documents such as Word, Excel and PDF files. Caseware currently documents a 500 MB maximum upload size per file for the relevant engagement document workflow.

Reference:

https://www.caseware.com/docs/en/cloud/caseware-cloud/engagement-management/documentation-and-review/attach-documents-to-an-engagement-file

## Engagement structure

Caseware Cloud lets users create an engagement by selecting a Cloud App, selecting the client entity, naming the engagement and configuring dates/budget information; engagement teams can then be assigned.

Reference:

https://www.caseware.com/docs/en/cloud/caseware-cloud/engagement-management/planning/create-and-set-up-an-engagement-file

---

# 44. What is NOT confirmed by this plan

Claude MUST NOT represent any of the following as already supported by Caseware unless Caseware confirms it:

```text
Caseware Cloud can be embedded in SpeedNum using iframe
Caseware login credentials can be injected automatically
Caseware UI can be white-labelled
Caseware UI can be OEMed
Caseware Cloud provides a generic embed SDK
Caseware Cloud allows arbitrary third-party parent origins
Caseware API can perform every UI action
One Caseware account can legally be shared between staff
One Caseware license covers unlimited SpeedNum users
Caseware allows SaaS redistribution
```

These are vendor/commercial/product questions.

---

# 45. Required vendor confirmation before production

The owner/product team should obtain written answers from Caseware for:

```text
1. Exact Caseware product and edition
2. API availability on the firm's plan
3. API pricing/additional fees
4. End-user licensing requirements
5. SSO availability
6. Supported identity providers
7. Whether a specific engagement can be deep-linked
8. Whether an engagement can be embedded
9. Whether iframe embedding is supported
10. Whether an embed SDK exists
11. Whether a third-party SaaS parent origin can be authorized
12. Whether OAuth/delegated user access is supported
13. Whether API upload into engagement files is supported for the selected product
14. Whether document operations required by SpeedNum are supported
15. Whether OEM/white-label/redistribution is permitted
16. Multi-tenant SaaS restrictions
17. Data residency requirements
18. Audit/compliance requirements
19. Sandbox/test environment availability
20. API rate limits
```

Production implementation should be blocked on the critical items:

```text
1, 2, 4, 6, 8, 10, 11, 12, 13, 15, 16
```

---

# 46. Implementation order for Claude Code

Claude Code should implement in this exact order.

## Phase A — Audit

```text
A1. Inspect repository
A2. Verify existing models/routes/services
A3. Verify permissions
A4. Verify document access gap
A5. Verify task assignment
A6. Verify integrations page
A7. Write CASEWARE_REPO_AUDIT.md
```

Do not modify code in this phase unless necessary to fix an obvious existing security defect.

---

## Phase B — Fix document authorization

Implement:

```text
B1. Client document list authorization
B2. Client document upload authorization
B3. Client document download authorization
B4. Client document delete authorization
B5. Task attachment authorization
B6. Tenant isolation
B7. Tests
```

Use the existing permission helpers.

Do not duplicate permission logic.

---

## Phase C — Workflow glue

Implement:

```text
C1. Engagement signed event/hook
C2. Document-upload notifications
C3. Owner/staff scoping
C4. Task → client validation
C5. Tests
```

---

## Phase D — Caseware foundation

Only after product confirmation:

```text
D1. CasewareConnection model
D2. migration
D3. encrypted secret service
D4. Caseware API client
D5. token acquisition
D6. token caching
D7. connection test
D8. owner-only connection endpoints
D9. integrations UI
D10. tests
```

---

## Phase E — Caseware mapping

```text
E1. CasewareLink model
E2. migration
E3. client mapping UI
E4. engagement mapping
E5. API lookup/create operations as supported
E6. authorization
E7. tests
```

---

## Phase F — Document synchronization

```text
F1. DocumentCasewareSync model
F2. migration
F3. selected document UI
F4. server-side MinIO/S3 retrieval
F5. Caseware upload
F6. status tracking
F7. idempotency
F8. retry
F9. background processing if appropriate
F10. audit events
F11. tests
```

---

## Phase G — Work in Caseware

Start with:

```text
G1. Caseware deep-link / officially supported navigation
G2. SSO if available
G3. task workspace
G4. Caseware status
G5. error handling
```

Only implement:

```text
iframe
embed SDK
embedded session
Electron webview
```

after vendor confirmation.

---

## Phase H — Production hardening

```text
H1. security review
H2. tenant-isolation review
H3. secrets review
H4. API timeout/retry review
H5. audit logs
H6. backups
H7. monitoring
H8. production deployment
H9. end-to-end acceptance test
```

---

# 47. Definition of Done

The feature is DONE only when:

```text
[ ] Existing engagement signing still works
[ ] Client upload still works
[ ] Owner can see client documents
[ ] Assigned staff can see permitted documents
[ ] Unassigned staff cannot see them
[ ] Owner-only task creation remains enforced
[ ] Staff can only update allowed task fields
[ ] Caseware credentials are never exposed to frontend
[ ] Caseware client secret is encrypted
[ ] Caseware API token is server-side
[ ] Tenant isolation is enforced
[ ] Caseware connection can be tested
[ ] Caseware entity/engagement mapping exists
[ ] Documents can be synced where the API supports it
[ ] Sync state is persisted
[ ] Duplicate syncs are controlled
[ ] Failures are recoverable
[ ] Audit events exist
[ ] No sensitive values are logged
[ ] Caseware work can be opened through an officially supported mechanism
[ ] No unauthorized iframe/password injection exists
[ ] Production environment variables are configured
[ ] Database migrations are tested
[ ] E2E workflow passes
```

---

# 48. Stop conditions — Claude must ask the owner instead of guessing

Claude Code MUST stop and report rather than inventing an implementation if:

```text
Caseware product is unknown
Caseware API access is unavailable
Caseware API operation needed for upload is unavailable
Caseware licensing is unclear
Caseware embedding permission is unknown
SSO requirements are unknown
Caseware requires a product-specific desktop workflow
The repository's actual architecture differs materially from this specification
The existing authorization model cannot safely express the requested restriction
```

The correct response is:

```text
BLOCKED: <reason>

What was verified:
...

What is missing:
...

Recommended decision:
...
```

Do not silently choose a risky workaround.

---

# 49. Recommended first milestone

The first production milestone should NOT be "full Caseware embedded UI."

It should be:

```text
MILESTONE 1

Engagement signed
    ->
Client uploads documents
    ->
Owner/assigned-staff authorization works
    ->
Owner assigns task
    ->
Staff opens task
    ->
Caseware connection exists
    ->
Client documents can be sent to Caseware through approved API
    ->
Staff can open Caseware through approved authentication/deep-link
```

This proves the business workflow without taking an unsupported dependency on browser iframe behavior.

---

# 50. Final instruction to Claude Code

Read this document together with:

```text
CASEWARE_WORKFLOW_SPEC.md
```

Then:

1. Inspect the real SpeedNum repository.
2. Do not rebuild existing features.
3. Produce `docs/CASEWARE_REPO_AUDIT.md`.
4. Report any mismatch between this plan and the real code.
5. Implement Phase B first.
6. Add tests before moving forward.
7. Implement Caseware foundation only after the exact Caseware product/API capability is confirmed.
8. Keep all Caseware secrets server-side.
9. Do not implement password injection.
10. Do not implement iframe embedding unless Caseware officially supports it.
11. Do not claim that the Caseware UI is embedded unless it actually is and the vendor has authorized the mechanism.
12. Preserve tenant isolation and client/staff document restrictions at every API boundary.
13. Use migrations for all database changes.
14. Finish with the end-to-end acceptance test described above.

The goal is a real, supportable production integration — not a demo that only appears to work in one browser.
