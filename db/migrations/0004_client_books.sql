-- =============================================================================
-- SpeedNum — client books (the data behind the client portal)
-- Target: Supabase Postgres (>= 15)
-- Run order: 0001_schema.sql -> 0002_rls.sql -> 0003_functions.sql -> 0004_client_books.sql
--
-- 0001 covers the firm side: clients, services, tasks, deadlines, letters.
-- The client portal (/dashboard/* in the frontend) shows a single client its own
-- books — invoices it issued, expenses it incurred, its payroll, its filings.
-- Those records live here.
--
-- Every table carries BOTH tenant_id and client_id. tenant_id is what the API
-- filters on for firm staff; client_id is what a portal user is pinned to. A row
-- belongs to exactly one client of exactly one firm.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums — one block each so a partial re-run still creates the rest. (0001 puts
-- every create type in a single block, where the first duplicate_object skips
-- everything after it.)
-- -----------------------------------------------------------------------------
do $$ begin
  create type invoice_status as enum ('draft', 'sent', 'paid', 'overdue', 'void');
exception when duplicate_object then null; end $$;

do $$ begin
  create type expense_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type employment_type as enum ('full_time', 'part_time', 'contract');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pay_run_status as enum ('draft', 'scheduled', 'processed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tax_filing_status as enum ('open', 'filed', 'overdue');
exception when duplicate_object then null; end $$;

do $$ begin
  create type document_kind as enum ('invoice', 'receipt', 'tax', 'contract', 'statement', 'other');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Portal users
--
-- A profile with client_id set is a client-portal user: it sees one client's
-- books and nothing else. Firm staff leave it null and are scoped by tenant_id
-- alone. This is the only change 0004 makes to an existing table's shape.
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists client_id uuid references public.clients (id) on delete cascade;

create index if not exists profiles_client_idx on public.profiles (client_id);

comment on column public.profiles.client_id is
  'Set = this login is a client-portal user pinned to that client. Null = firm staff.';

-- -----------------------------------------------------------------------------
-- Invoices the client issued to its own customers
--
-- Deliberately not named `invoices`: these are the client''s sales invoices, not
-- the firm''s billing of the client (which is engagement_letters + annual_fee).
-- -----------------------------------------------------------------------------
create table if not exists public.client_invoices (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  client_id     uuid not null references public.clients (id) on delete cascade,
  number        text not null,
  customer_name text not null,
  description   text,
  issued_on     date not null default current_date,
  due_on        date not null,
  amount        numeric(12, 2) not null default 0,
  tax           numeric(12, 2) not null default 0,
  currency      text not null default 'CAD',
  status        invoice_status not null default 'draft',
  paid_on       date,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (client_id, number)
);

create index if not exists client_invoices_tenant_idx on public.client_invoices (tenant_id, status);
create index if not exists client_invoices_client_idx on public.client_invoices (client_id, issued_on desc);

create trigger client_invoices_set_updated_at before update on public.client_invoices
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Expenses
-- -----------------------------------------------------------------------------
create table if not exists public.client_expenses (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  client_id   uuid not null references public.clients (id) on delete cascade,
  vendor      text not null,
  category    text not null default 'General',
  spent_on    date not null default current_date,
  amount      numeric(12, 2) not null default 0,
  -- GST/HST paid, tracked separately because it is the input tax credit.
  gst         numeric(12, 2) not null default 0,
  status      expense_status not null default 'pending',
  method      text,
  has_receipt boolean not null default false,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists client_expenses_tenant_idx on public.client_expenses (tenant_id, status);
create index if not exists client_expenses_client_idx on public.client_expenses (client_id, spent_on desc);
create index if not exists client_expenses_category_idx on public.client_expenses (client_id, category);

create trigger client_expenses_set_updated_at before update on public.client_expenses
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Payroll — employees and the pay runs that pay them
--
-- Per-period amounts are stored, not derived: CPP/EI/tax depend on the rules in
-- force for the period, so recomputing an old run from today''s rates would
-- silently rewrite history.
-- -----------------------------------------------------------------------------
create table if not exists public.client_employees (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  client_id       uuid not null references public.clients (id) on delete cascade,
  full_name       text not null,
  role            text,
  employment_type employment_type not null default 'full_time',
  province        text not null default 'AB',
  -- per pay period
  gross           numeric(12, 2) not null default 0,
  cpp             numeric(12, 2) not null default 0,
  ei              numeric(12, 2) not null default 0,
  income_tax      numeric(12, 2) not null default 0,
  net             numeric(12, 2) not null default 0,
  is_active       boolean not null default true,
  started_on      date,
  ended_on        date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists client_employees_client_idx on public.client_employees (client_id, is_active);
create index if not exists client_employees_tenant_idx on public.client_employees (tenant_id);

create trigger client_employees_set_updated_at before update on public.client_employees
  for each row execute function public.set_updated_at();

create table if not exists public.client_pay_runs (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  client_id      uuid not null references public.clients (id) on delete cascade,
  period_label   text not null,
  period_start   date,
  period_end     date,
  pay_date       date not null,
  employee_count integer not null default 0,
  gross          numeric(12, 2) not null default 0,
  deductions     numeric(12, 2) not null default 0,
  net            numeric(12, 2) not null default 0,
  status         pay_run_status not null default 'draft',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists client_pay_runs_client_idx on public.client_pay_runs (client_id, pay_date desc);
create index if not exists client_pay_runs_tenant_idx on public.client_pay_runs (tenant_id, status);

create trigger client_pay_runs_set_updated_at before update on public.client_pay_runs
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Tax obligations
--
-- Distinct from public.deadlines: a deadline is the firm''s internal work item
-- (who prepares it, is it filed). This is the client-visible money owed to a
-- revenue authority for a period.
-- -----------------------------------------------------------------------------
create table if not exists public.client_tax_obligations (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  client_id    uuid not null references public.clients (id) on delete cascade,
  deadline_id  uuid references public.deadlines (id) on delete set null,
  name         text not null,
  authority    text not null default 'CRA',
  period_label text,
  due_on       date not null,
  amount       numeric(12, 2) not null default 0,
  status       tax_filing_status not null default 'open',
  filed_at     timestamptz,
  reference    text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists client_taxes_client_idx on public.client_tax_obligations (client_id, due_on);
create index if not exists client_taxes_tenant_idx on public.client_tax_obligations (tenant_id, status);

create trigger client_taxes_set_updated_at before update on public.client_tax_obligations
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Documents — extend the table 0001 already created rather than add a second one
-- -----------------------------------------------------------------------------
alter table public.documents
  add column if not exists kind document_kind not null default 'other';

create index if not exists documents_kind_idx on public.documents (client_id, kind);

-- -----------------------------------------------------------------------------
-- Row Level Security
--
-- Same defence-in-depth posture as 0002: the API connects as owner and filters
-- in code, these policies protect anything arriving via Supabase's authenticated
-- role (PostgREST/Storage/Realtime/browser supabase-js). On a deployment target
-- with no Supabase project colocated with this database, that role and
-- `auth.uid()` do not exist and nothing ever connects to Postgres except this
-- application's own owner-role connection — so there is no remaining consumer
-- for these policies, and creating them would just fail on the missing role.
-- Guarded the same way as 0002 (which defines the helper functions these
-- policies call): skip the whole section when `authenticated` doesn't exist,
-- rather than fail migration or install dead policies. Firm staff get the
-- whole tenant; a portal user gets one client — enforced by app/deps.py's
-- BookScope on a deployment target where this section is skipped.
-- -----------------------------------------------------------------------------
do $rls_0004$
begin
  if to_regrole('authenticated') is null then
    raise notice '0004_client_books.sql: skipping Supabase RLS policies (no "authenticated" role on this Postgres instance).';
    return;
  end if;

  execute $func$
    create or replace function public.current_client_id()
    returns uuid
    language sql
    stable
    security definer
    set search_path = public
    as $body$
      select client_id from public.profiles where id = auth.uid();
    $body$
  $func$;

  execute 'grant execute on function public.current_client_id() to authenticated';

  execute 'alter table public.client_invoices        enable row level security';
  execute 'alter table public.client_expenses        enable row level security';
  execute 'alter table public.client_employees       enable row level security';
  execute 'alter table public.client_pay_runs        enable row level security';
  execute 'alter table public.client_tax_obligations enable row level security';

  -- A row is visible when you are staff at the owning firm, or the portal
  -- user for that exact client, or a superadmin.
  declare
    t text;
    book_tables text[] := array[
      'client_invoices', 'client_expenses', 'client_employees',
      'client_pay_runs', 'client_tax_obligations'
    ];
  begin
    foreach t in array book_tables loop
      execute format('drop policy if exists %I on public.%I', t || '_rw', t);
      execute format($pol$
        create policy %I on public.%I
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
      $pol$, t || '_rw', t);
    end loop;
  end;

  -- 0002 scoped documents by tenant only. Re-scope so a portal user sees its
  -- own client's files that the firm marked visible, plus anything it
  -- uploaded itself — hiding a client's own upload from that same client
  -- would make no sense. Mirrors
  -- app/routers/client_documents.py::_visible_to_portal exactly; keep the
  -- two in sync.
  execute 'drop policy if exists documents_tenant_rw on public.documents';
  execute $docpol$
    create policy documents_tenant_rw on public.documents
      for all
      to authenticated
      using (
        public.is_superadmin()
        or (tenant_id = public.current_tenant_id()
            and (public.current_client_id() is null
                 or (client_id = public.current_client_id()
                     and (is_client_visible or uploaded_by = auth.uid()))))
      )
      with check (
        public.is_superadmin()
        or (tenant_id = public.current_tenant_id()
            and (public.current_client_id() is null
                 or client_id = public.current_client_id()))
      )
  $docpol$;
end $rls_0004$;
