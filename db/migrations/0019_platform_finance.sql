-- =============================================================================
-- SpidNums — provider-side finance ledger (income from tenants, operating
-- expenses) for the platform superadmin's profit dashboard.
-- Target: Supabase Postgres (>= 15) / plain Postgres 16 (VPS)
-- Run order: ... -> 0018_roles_permissions.sql -> 0019_platform_finance.sql
--
-- This is the provider's own bookkeeping — not to be confused with a
-- tenant's client-facing books (public.invoices/expenses from
-- 0004_client_books.sql, a client's own sales invoices/expenses). Manual
-- entry only for now, no payment processor: a superadmin logs "Acme Corp
-- paid $499" and "Hostinger $12/mo" by hand. See app/routers/platform_finance.py.
--
-- No RLS on either table: unlike every tenant-scoped table in this schema,
-- these carry no meaningful tenant_id-based row ownership for Postgres RLS to
-- enforce (platform_expenses has no tenant_id at all; platform_income's is
-- informational, not a boundary a tenant's own staff ever cross, since only
-- the platform superadmin's own routes touch these tables — SuperadminDep,
-- see deps.py). Same reasoning already applies to public.audit_logs and the
-- tenants table itself, which also carry no RLS policy in this schema.
-- =============================================================================

create table if not exists public.platform_expenses (
  id           uuid primary key default gen_random_uuid(),
  category     text not null,                    -- hosting | domains | development | maintenance | other
  vendor       text,
  amount       numeric(12,2) not null,
  currency     text not null default 'USD',
  expense_date date not null default current_date,
  is_recurring boolean not null default false,
  notes        text,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists platform_expenses_date_idx
  on public.platform_expenses (expense_date desc);

comment on table public.platform_expenses is
  'Provider operating costs (hosting, domains, dev/maintenance) — superadmin-only manual ledger. See app/routers/platform_finance.py.';

create table if not exists public.platform_income (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references public.tenants (id) on delete set null,
  amount        numeric(12,2) not null,
  currency      text not null default 'USD',
  received_date date not null default current_date,
  method        text not null default 'manual',   -- manual | stripe (future)
  notes         text,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists platform_income_date_idx
  on public.platform_income (received_date desc);
create index if not exists platform_income_tenant_idx
  on public.platform_income (tenant_id);

comment on table public.platform_income is
  'Money received from tenant firms (subscription/plan payments) — superadmin-only manual ledger. tenant_id is set null (not cascaded) if the tenant is later deleted, so historical revenue is never lost. See app/routers/platform_finance.py.';
