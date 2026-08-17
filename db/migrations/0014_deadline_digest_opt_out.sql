-- =============================================================================
-- Per-admin opt-out of the daily deadline/task digest email.
--
-- Closes a real gap found during the final handover audit: the Settings page
-- had an "Email alerts" card (recipient override + task/reminder checkboxes)
-- that only ever wrote to the browser's localStorage. The real digest sender
-- (backend/app/services/reminders.py::admin_recipients) always emailed every
-- active owner/admin in the tenant regardless of that UI — the controls were
-- decorative. This adds the one piece of that UI that's both real to build
-- and safe to honor: each admin can opt themselves out. The recipient-email
-- override and the tasks/reminders split were removed rather than wired up —
-- redirecting a firm's client-work digest to an arbitrary address is a data
-- exposure risk `admin_recipients` deliberately avoids by only ever emailing
-- real accounts on the tenant, and nothing else in the system splits the
-- digest by category.
-- =============================================================================

alter table public.profiles
  add column if not exists notify_deadline_digest boolean not null default true;

comment on column public.profiles.notify_deadline_digest is
  'Whether this profile receives the daily deadline/task digest email (owners/admins only — see services/reminders.py::admin_recipients). Self-service opt-out via PATCH /auth/me.';
