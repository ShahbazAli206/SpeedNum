-- =============================================================================
-- SpidNums — owner-submitted plan change requests
-- Target: Supabase Postgres (>= 15) / plain Postgres 16 (VPS)
-- Run order: ... -> 0019_platform_finance.sql -> 0020_plan_change_requests.sql
--
-- An owner picks a plan tier on /billing and submits a request; nothing
-- applies automatically. A platform superadmin reviews it from
-- /admin/plan-requests and either approves it (which updates the tenant's
-- plan and seat caps) or rejects it. See app/routers/plan_requests.py and
-- app/plans.py for the suggested seat catalog.
-- =============================================================================

do $$ begin
  create type plan_request_status as enum ('pending', 'approved', 'rejected', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.plan_change_requests (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  requested_by     uuid references public.profiles (id) on delete set null,
  current_plan     text not null,
  requested_plan   text not null,
  note             text,
  status           plan_request_status not null default 'pending',
  resolution_note  text,
  resolved_by      uuid references public.profiles (id) on delete set null,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists plan_change_requests_tenant_idx
  on public.plan_change_requests (tenant_id, created_at desc);
create index if not exists plan_change_requests_pending_idx
  on public.plan_change_requests (status) where status = 'pending';

comment on table public.plan_change_requests is
  'An owner''s request to upgrade/downgrade their firm''s plan — reviewed and applied by the platform superadmin, never self-serve. See app/routers/plan_requests.py.';

-- -----------------------------------------------------------------------------
-- RLS: same tenant-scoped read/write shape as reminders (0007) and
-- notifications — any signed-in member of the tenant can read and create
-- requests, only server-side superadmin logic (which bypasses RLS via the
-- owner-role connection) resolves them. Skipped on a plain Postgres instance
-- with no "authenticated" role, same guard as every other RLS block since
-- 0004 — see that migration for the full reasoning.
-- -----------------------------------------------------------------------------
do $rls_0020$
begin
  if to_regrole('authenticated') is null then
    raise notice '0020_plan_change_requests.sql: skipping Supabase RLS policy (no "authenticated" role on this Postgres instance).';
    return;
  end if;

  execute 'alter table public.plan_change_requests enable row level security';
  execute 'drop policy if exists plan_change_requests_rw on public.plan_change_requests';
  execute $pol$
    create policy plan_change_requests_rw on public.plan_change_requests
      for all to authenticated
      using (tenant_id = public.current_tenant_id())
      with check (tenant_id = public.current_tenant_id())
  $pol$;
end $rls_0020$;
