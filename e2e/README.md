# End-to-end / auto-testing accounts

Credentials and URLs for automated testing against the live QA deployment.

## Files
- **`test-accounts.example.json`** — committed template (no real passwords).
- **`test-accounts.local.json`** — the real QA credentials. **Gitignored — never committed.**
  It holds a live **superadmin** login (cross-tenant powers), so it stays out of git history.

## Setting up on another machine
1. Clone/pull the repo (you get this README + the example template).
2. Create `e2e/test-accounts.local.json` — either copy the file from your other machine
   (it's tiny), or `cp test-accounts.example.json test-accounts.local.json` and fill in the
   passwords from your password manager.
3. Point your test runner at `test-accounts.local.json`.

## Environments
| What | URL |
|---|---|
| Web app (Vercel) | https://speed-num.vercel.app |
| Login | https://speed-num.vercel.app/login |
| Backend API | https://test.spidnums.com |

## Accounts (roles)
| Role | Email | Lands on |
|---|---|---|
| superadmin + firm owner | `qa-owner-aug19@axelytix.com` | `/overview` → `/admin` for the platform console |
| firm admin | `qa-admin-aug20@axelytix.com` | `/overview` |
| accountant (member) | `qa.accountant.one@axelytix.example` | `/overview` |
| client portal | `accounts@qatestclient.example` | `/dashboard` |

Passwords live in `test-accounts.local.json` (gitignored).

## Superadmin console smoke checks (what to assert)
After signing in as the superadmin and visiting `/admin`:
- KPIs show numbers (not "—"/"undefined"): Total / Trialing / Suspended tenants, Clients.
- `/admin` tenants table lists firms with per-row actions: impersonate, view, edit, suspend, delete.
- Impersonate a firm → `/overview` shows a "Viewing X as super admin" banner → **Exit to platform** returns to `/admin`.
- `/admin/reach` → search footprint + platform scale (Visitors/Pageviews show "—" until a Vercel token is set).
- `/admin/settings` → platform email status + "Send test email".
- Create a tenant → 201 + a one-time temp password is shown.

> Note: as of the last test run the QA backend had an intermittent Docker-DNS
> flake causing some requests to hang. If pages hang on the loading spinner,
> retry — and see the deploy notes for the fix.
