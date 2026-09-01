-- =============================================================================
-- SpidNums — invoicing & bills across the three money levels
-- Target: Supabase Postgres (>= 15) / plain Postgres 16 (VPS)
-- Run order: ... -> 0025_plans.sql -> 0026_invoicing_and_bills.sql
--
-- Fills the two levels that had no invoicing/bills surface:
--
--   * Company (accounting firm / tenant): firm_invoices (+items, +payments) is
--     the firm's accounts-receivable — invoices it sends its clients, with line
--     items and partial payments. firm_bills is its accounts-payable — its own
--     operating bills (rent, software, ...). Both tenant-scoped. Distinct from
--     0004's client_invoices/client_expenses, which are the *client's own* books.
--
--   * Platform (provider / superadmin): platform_invoices (+items) are the
--     invoice *documents* the provider sends tenant firms, layered on top of
--     0019's platform_income (money received). A payment against a platform
--     invoice is recorded as a platform_income row carrying invoice_id, so the
--     existing profit dashboard is unchanged and the same row surfaces on the
--     firm's Bills page as a paid subscription bill.
--
-- Reuses the invoice_status enum from 0004. RLS mirrors 0004 exactly (guarded by
-- to_regrole('authenticated'); the app enforces scoping on the VPS target where
-- that role does not exist).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
do $$ begin
  create type bill_status as enum ('unpaid', 'paid');
exception when duplicate_object then null; end $$;

-- =============================================================================
-- Company (tenant) — accounts receivable: invoices the firm sends its clients
-- =============================================================================
create table if not exists public.firm_invoices (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  client_id      uuid not null references public.clients (id) on delete cascade,
  number         text not null,
  title          text not null default 'Invoice',
  description    text,
  issued_on      date not null default current_date,
  due_on         date not null,
  currency       text not null default 'CAD',
  subtotal       numeric(12, 2) not null default 0,
  -- plain percentage (13 == 13%), same convention as engagement_letters.tax_rate
  tax_rate       numeric(6, 2) not null default 0,
  tax_amount     numeric(12, 2) not null default 0,
  total          numeric(12, 2) not null default 0,
  -- sum of firm_invoice_payments; maintained by the API on payment insert/delete
  amount_paid    numeric(12, 2) not null default 0,
  status         invoice_status not null default 'draft',
  paid_on        date,
  recipient_name  text,
  recipient_email text,
  sent_at        timestamptz,
  notes          text,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (client_id, number)
);

create index if not exists firm_invoices_tenant_idx on public.firm_invoices (tenant_id, status);
create index if not exists firm_invoices_client_idx on public.firm_invoices (client_id, issued_on desc);

create trigger firm_invoices_set_updated_at before update on public.firm_invoices
  for each row execute function public.set_updated_at();

create table if not exists public.firm_invoice_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  invoice_id  uuid not null references public.firm_invoices (id) on delete cascade,
  service_id  uuid references public.services (id) on delete set null,
  description text not null,
  quantity    numeric(8, 2) not null default 1,
  unit_price  numeric(12, 2) not null default 0,
  amount      numeric(12, 2) not null default 0,
  position    integer not null default 0
);

create index if not exists firm_invoice_items_invoice_idx on public.firm_invoice_items (invoice_id, position);

create table if not exists public.firm_invoice_payments (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  invoice_id  uuid not null references public.firm_invoices (id) on delete cascade,
  amount      numeric(12, 2) not null default 0,
  paid_on     date not null default current_date,
  method      text,
  notes       text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists firm_invoice_payments_invoice_idx on public.firm_invoice_payments (invoice_id, paid_on desc);

-- =============================================================================
-- Company (tenant) — accounts payable: the firm's own operating bills
-- =============================================================================
create table if not exists public.firm_bills (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  category     text not null default 'other',   -- software | rent | salary | utilities | subscription | other
  vendor       text,
  amount       numeric(12, 2) not null default 0,
  currency     text not null default 'CAD',
  bill_date    date not null default current_date,
  due_date     date,
  status       bill_status not null default 'unpaid',
  paid_on      date,
  is_recurring boolean not null default false,
  notes        text,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists firm_bills_tenant_idx on public.firm_bills (tenant_id, status);
create index if not exists firm_bills_date_idx on public.firm_bills (tenant_id, bill_date desc);

create trigger firm_bills_set_updated_at before update on public.firm_bills
  for each row execute function public.set_updated_at();

-- =============================================================================
-- Platform (provider) — invoice documents sent to tenant firms
--
-- No RLS, no tenant_id boundary — superadmin-only, same posture as
-- platform_expenses/platform_income (see 0019). tenant_id is informational and
-- set null (not cascaded) on tenant deletion so history survives.
-- =============================================================================
create table if not exists public.platform_invoices (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references public.tenants (id) on delete set null,
  number      text not null,
  title       text not null default 'Invoice',
  issued_on   date not null default current_date,
  due_on      date not null,
  currency    text not null default 'USD',
  subtotal    numeric(12, 2) not null default 0,
  tax_rate    numeric(6, 2) not null default 0,
  tax_amount  numeric(12, 2) not null default 0,
  total       numeric(12, 2) not null default 0,
  amount_paid numeric(12, 2) not null default 0,
  status      invoice_status not null default 'draft',
  paid_on     date,
  notes       text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists platform_invoices_tenant_idx on public.platform_invoices (tenant_id);
create index if not exists platform_invoices_date_idx on public.platform_invoices (issued_on desc);

create trigger platform_invoices_set_updated_at before update on public.platform_invoices
  for each row execute function public.set_updated_at();

create table if not exists public.platform_invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.platform_invoices (id) on delete cascade,
  description text not null,
  quantity    numeric(8, 2) not null default 1,
  unit_price  numeric(12, 2) not null default 0,
  amount      numeric(12, 2) not null default 0,
  position    integer not null default 0
);

create index if not exists platform_invoice_items_invoice_idx on public.platform_invoice_items (invoice_id, position);

-- A platform-invoice payment IS a platform_income row (keeps the profit
-- dashboard and the firm's Bills page in sync with no extra table). Link it back
-- to the invoice; set null if the invoice is later deleted so the income (money
-- that really changed hands) is never lost.
alter table public.platform_income
  add column if not exists invoice_id uuid references public.platform_invoices (id) on delete set null;

create index if not exists platform_income_invoice_idx on public.platform_income (invoice_id);

-- -----------------------------------------------------------------------------
-- Permission backfill — new invoices.* keys for every existing role, matching
-- today's behaviour (see _LEGACY_DEFAULTS in app/permissions.py; keep in sync).
-- invoices.view_all copies the role's clients.view_all (a restricted role that
-- only sees its own clients also only sees those clients' invoices);
-- invoices.manage is granted to all, since the capability is brand new and
-- granting it introduces no regression. Owner/superadmin bypass this table.
-- -----------------------------------------------------------------------------
insert into public.role_permissions (role_id, permission_key, allowed)
  select rp.role_id, 'invoices.view_all', rp.allowed
    from public.role_permissions rp
   where rp.permission_key = 'clients.view_all'
on conflict (role_id, permission_key) do nothing;

insert into public.role_permissions (role_id, permission_key, allowed)
  select r.id, 'invoices.manage', true
    from public.roles r
on conflict (role_id, permission_key) do nothing;

-- -----------------------------------------------------------------------------
-- Row Level Security — same guarded shape as 0004/0016/0017/0018. Skipped where
-- the "authenticated" role does not exist (VPS target: the app enforces scoping
-- itself via app/deps.py BookScope). firm_bills is firm-internal, so a portal
-- account (current_client_id() not null) is excluded from it entirely.
-- -----------------------------------------------------------------------------
do $rls_0026$
begin
  if to_regrole('authenticated') is null then
    raise notice '0026_invoicing_and_bills.sql: skipping Supabase RLS policies (no "authenticated" role on this Postgres instance).';
    return;
  end if;

  execute 'alter table public.firm_invoices         enable row level security';
  execute 'alter table public.firm_invoice_items    enable row level security';
  execute 'alter table public.firm_invoice_payments enable row level security';
  execute 'alter table public.firm_bills            enable row level security';

  -- Invoice header: staff at the owning firm, or the portal user for that exact
  -- client, or a superadmin.
  execute 'drop policy if exists firm_invoices_rw on public.firm_invoices';
  execute $pol$
    create policy firm_invoices_rw on public.firm_invoices
      for all
      to authenticated
      using (
        public.is_superadmin()
        or (tenant_id = public.current_tenant_id()
            and (public.current_client_id() is null
                 or client_id = public.current_client_id()))
      )
      with check (
        public.is_superadmin()
        or (tenant_id = public.current_tenant_id()
            and (public.current_client_id() is null
                 or client_id = public.current_client_id()))
      )
  $pol$;

  -- Items and payments carry no client_id of their own — scope them through the
  -- parent invoice so a portal user can never reach another client's lines.
  declare
    t text;
    child_tables text[] := array['firm_invoice_items', 'firm_invoice_payments'];
  begin
    foreach t in array child_tables loop
      execute format('drop policy if exists %I on public.%I', t || '_rw', t);
      execute format($pol$
        create policy %I on public.%I
          for all
          to authenticated
          using (
            public.is_superadmin()
            or exists (
              select 1 from public.firm_invoices fi
              where fi.id = %I.invoice_id
                and fi.tenant_id = public.current_tenant_id()
                and (public.current_client_id() is null
                     or fi.client_id = public.current_client_id())
            )
          )
          with check (
            public.is_superadmin()
            or exists (
              select 1 from public.firm_invoices fi
              where fi.id = %I.invoice_id
                and fi.tenant_id = public.current_tenant_id()
                and (public.current_client_id() is null
                     or fi.client_id = public.current_client_id())
            )
          )
      $pol$, t || '_rw', t, t, t);
    end loop;
  end;

  -- Firm bills are internal to firm staff — never visible to a portal account.
  execute 'drop policy if exists firm_bills_rw on public.firm_bills';
  execute $pol$
    create policy firm_bills_rw on public.firm_bills
      for all
      to authenticated
      using (
        public.is_superadmin()
        or (tenant_id = public.current_tenant_id() and public.current_client_id() is null)
      )
      with check (
        public.is_superadmin()
        or (tenant_id = public.current_tenant_id() and public.current_client_id() is null)
      )
  $pol$;
end $rls_0026$;
