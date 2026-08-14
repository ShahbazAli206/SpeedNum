-- =============================================================================
-- SpeedNum — client-portal invite tracking
-- Target: Supabase Postgres (>= 15)
-- Run order: 0001_schema.sql -> 0002_rls.sql -> 0003_functions.sql ->
--            0004_client_books.sql -> 0005_client_portal_invite.sql
--
-- Backs the "New client -> branded welcome email -> one-click sign-in ->
-- forced password change on first login" flow. Provisioning the Supabase Auth
-- user itself happens through the Admin API (backend/app/services/
-- supabase_admin.py), not SQL — this migration only adds the bookkeeping
-- columns the API and frontend need on tables 0001/0004 already created.
-- =============================================================================

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

comment on column public.profiles.must_change_password is
  'True right after a client-portal invite (or resend) issues a temporary password; cleared once the user sets their own via POST /auth/complete-password-change.';

alter table public.clients
  add column if not exists portal_invited_at timestamptz;

alter table public.clients
  add column if not exists portal_invited_by uuid references public.profiles (id) on delete set null;

comment on column public.clients.portal_invited_at is
  'When the client was last (re)invited to the portal — drives the "Resend welcome email" card on the client record.';

comment on column public.clients.portal_invited_by is
  'Which firm staff member sent the most recent portal invite/resend.';
