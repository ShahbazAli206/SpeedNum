-- =============================================================================
-- SpeedNum — editable plan catalog
-- Run order: ... -> 0024_tenant_plan_expiry.sql -> 0025_plans.sql
--
-- The billing catalog (plan names, prices, seat caps, and the set of plans
-- itself) was a hardcoded Python constant (app/plans.py's PLAN_CATALOG). This
-- moves it into the database so the platform superadmin can edit prices/names/
-- seats and add or remove plans from /admin/plans without a deploy — company
-- owners read the active plans via GET /billing/plans. PLAN_CATALOG stays as
-- the seed (below) and as a fallback when the table is empty.
--
-- price is whole USD dollars per month; null = "quoted per firm" (Enterprise).
-- max_clients / max_staff null = unlimited.
-- =============================================================================

create table if not exists public.plans (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique,
  label        text not null,
  price        integer,
  max_clients  integer,
  max_staff    integer,
  blurb        text not null default '',
  position     integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists plans_active_position_idx on public.plans (is_active, position);

comment on table public.plans is
  'Editable billing plan catalog managed by the platform superadmin (/admin/plans). Company owners read the active rows via GET /billing/plans. app/plans.py''s PLAN_CATALOG is the seed + empty-table fallback only.';

create trigger plans_set_updated_at before update on public.plans
  for each row execute function public.set_updated_at();

-- Seed the default ladder (idempotent — skipped if a key already exists). USD.
insert into public.plans (key, label, price, max_clients, max_staff, blurb, position) values
  ('trial',      'Trial',      0,    10,   2,    '14-day trial of the full product.',           0),
  ('starter',    'Starter',    49,   25,   3,    'Solo practitioners and small teams.',         1),
  ('growth',     'Growth',     149,  100,  10,   'Growing practices with several accountants.', 2),
  ('pro',        'Pro',        399,  500,  25,   'Established firms with a full team.',          3),
  ('enterprise', 'Enterprise', null, null, null, 'Unlimited clients and staff, custom terms.',  4)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- RLS: the catalog is a global, non-sensitive list. Any signed-in user may read
-- it (the billing page needs it); writes only ever happen through the backend's
-- owner-role connection, which bypasses RLS, so there is no write policy. Same
-- "skip on plain Postgres with no authenticated role" guard as every RLS block
-- since 0004.
-- -----------------------------------------------------------------------------
do $rls_0025$
begin
  if to_regrole('authenticated') is null then
    raise notice '0025_plans.sql: skipping Supabase RLS policy (no "authenticated" role on this Postgres instance).';
    return;
  end if;

  execute 'alter table public.plans enable row level security';
  execute 'drop policy if exists plans_read on public.plans';
  execute 'create policy plans_read on public.plans for select to authenticated using (true)';
end $rls_0025$;
