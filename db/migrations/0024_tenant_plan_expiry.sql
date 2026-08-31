-- =============================================================================
-- Tenant plan / server-domain expiry dates.
--
-- Until now a firm's only lifecycle state was `is_active` (a manual superadmin
-- suspend toggle) and an informational `trial_ends_at` that nothing ever
-- enforced. These two nullable dates make expiry real and date-driven:
--
--   plan_expires_at     — when the company's subscription/plan lapses.
--   service_expires_at  — when the company's server/domain access is
--                         deactivated and needs reactivating.
--
-- Both are real columns (not tenants.settings JSONB) because they drive access
-- enforcement (deps.get_current_user / local_auth._ensure_firm_active refuse a
-- firm past either date) and a cross-tenant "expiring soon" sweep, so they have
-- to be queryable and indexable. Null = no expiry tracked for that axis.
--
-- The per-threshold "already reminded" markers that stop the daily sweep from
-- re-nagging live in tenants.settings->'expiry_notified' (JSONB, no column
-- needed) and are cleared whenever a date here moves forward.
-- =============================================================================

alter table public.tenants
  add column if not exists plan_expires_at    timestamptz,
  add column if not exists service_expires_at timestamptz;

comment on column public.tenants.plan_expires_at is
  'When this company''s plan/subscription lapses. Past this, every login under the firm is refused (like a suspend) until a superadmin extends it. Null = no plan expiry tracked.';
comment on column public.tenants.service_expires_at is
  'When this company''s server/domain access is deactivated and needs reactivating. Enforced the same way as plan_expires_at. Null = not tracked.';

-- The superadmin "expiring soon / overdue" sweep scans only the rows that have a
-- date set, so a partial index keeps it off the (many) null-date customer rows.
create index if not exists tenants_plan_expires_at_idx
  on public.tenants (plan_expires_at) where plan_expires_at is not null;
create index if not exists tenants_service_expires_at_idx
  on public.tenants (service_expires_at) where service_expires_at is not null;
