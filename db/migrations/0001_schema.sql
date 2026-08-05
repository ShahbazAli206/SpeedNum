-- =============================================================================
-- SpeedNum / SpidNums — core schema
-- Target: Supabase Postgres (>= 15)
-- Run order: 0001_schema.sql -> 0002_rls.sql -> 0003_functions.sql
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
do $$ begin
  create type user_role       as enum ('owner', 'admin', 'member', 'viewer');
  create type client_status   as enum ('prospect', 'active', 'inactive', 'archived');
  create type client_type     as enum ('corporation', 'sole_proprietor', 'partnership', 'individual', 'nonprofit', 'trust');
  create type service_freq    as enum ('annual', 'semi_annual', 'quarterly', 'monthly', 'one_time');
  create type project_status  as enum ('not_started', 'in_progress', 'review', 'complete', 'on_hold');
  create type task_status     as enum ('todo', 'in_progress', 'review', 'complete', 'blocked');
  create type task_priority   as enum ('low', 'medium', 'high', 'urgent');
  create type deadline_status as enum ('open', 'snoozed', 'filed', 'dismissed');
  create type letter_status   as enum ('draft', 'sent', 'viewed', 'signed', 'declined', 'void');
  create type field_type      as enum ('text', 'number', 'date', 'select', 'checkbox', 'email', 'phone');
  create type custom_entity   as enum ('client', 'task', 'project');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Shared trigger: keep updated_at fresh
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tenants (accounting firms) — the white-label unit
-- -----------------------------------------------------------------------------
create table if not exists public.tenants (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  slug              citext not null unique,
  legal_name        text,
  email             citext,
  phone             text,
  website           text,
  address_line1     text,
  address_line2     text,
  city              text,
  province          text,
  postal_code       text,
  country           text not null default 'CA',
  -- white-label
  logo_url          text,
  brand_color       text not null default '#1d4ed8',
  accent_color      text not null default '#0f172a',
  custom_domain     text unique,
  email_from_name   text,
  letter_footer     text,
  -- commercial
  plan              text not null default 'trial',
  seats             integer not null default 5,
  trial_ends_at     timestamptz not null default (now() + interval '14 days'),
  is_active         boolean not null default true,
  settings          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger tenants_set_updated_at before update on public.tenants
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Profiles — one row per auth.users row, pinned to a tenant
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  tenant_id     uuid references public.tenants (id) on delete cascade,
  email         citext not null,
  full_name     text,
  title         text,
  phone         text,
  avatar_url    text,
  role          user_role not null default 'member',
  weekly_capacity integer not null default 40,
  is_active     boolean not null default true,
  is_superadmin boolean not null default false,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists profiles_tenant_idx on public.profiles (tenant_id);

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Invitations — invite staff into a tenant
-- -----------------------------------------------------------------------------
create table if not exists public.invitations (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  email       citext not null,
  role        user_role not null default 'member',
  token       text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by  uuid references public.profiles (id) on delete set null,
  expires_at  timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);

create unique index if not exists invitations_tenant_email_idx
  on public.invitations (tenant_id, email) where accepted_at is null;

-- -----------------------------------------------------------------------------
-- Clients (CRM)
-- -----------------------------------------------------------------------------
create table if not exists public.clients (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  code              text,
  legal_name        text not null,
  business_name     text,
  client_type       client_type not null default 'corporation',
  status            client_status not null default 'active',
  business_number   text,                    -- CRA BN / SIN placeholder
  gst_number        text,
  payroll_number    text,
  email             citext,
  phone             text,
  address_line1     text,
  address_line2     text,
  city              text,
  province          text,
  postal_code       text,
  country           text not null default 'CA',
  -- fiscal
  year_end_month    smallint not null default 12 check (year_end_month between 1 and 12),
  year_end_day      smallint not null default 31 check (year_end_day between 1 and 31),
  incorporation_date date,
  -- commercial / ownership
  owner_id          uuid references public.profiles (id) on delete set null,
  annual_fee        numeric(12, 2) not null default 0,
  onboarded_at      date,
  portal_enabled    boolean not null default false,
  notes             text,
  tags              text[] not null default '{}',
  custom            jsonb not null default '{}'::jsonb,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists clients_tenant_idx        on public.clients (tenant_id);
create index if not exists clients_tenant_status_idx on public.clients (tenant_id, status);
create index if not exists clients_owner_idx         on public.clients (owner_id);
create unique index if not exists clients_tenant_code_idx
  on public.clients (tenant_id, code) where code is not null;
create index if not exists clients_search_idx
  on public.clients using gin (to_tsvector('simple',
    coalesce(legal_name, '') || ' ' || coalesce(business_name, '') || ' ' || coalesce(email::text, '')));

create trigger clients_set_updated_at before update on public.clients
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Contacts — people attached to a client
-- -----------------------------------------------------------------------------
create table if not exists public.contacts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  client_id   uuid not null references public.clients (id) on delete cascade,
  full_name   text not null,
  email       citext,
  phone       text,
  role        text,
  is_primary  boolean not null default false,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists contacts_client_idx on public.contacts (client_id);
create index if not exists contacts_tenant_idx on public.contacts (tenant_id);

create trigger contacts_set_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Services catalogue — drives deadline generation and letter pricing
-- due_rule shapes:
--   {"type":"offset_from_period_end","months":6}
--   {"type":"offset_from_period_end","days":30}
--   {"type":"fixed_date","month":4,"day":30}
--   {"type":"fixed_date","month":2,"day":-1}      -- -1 = last day of month
-- -----------------------------------------------------------------------------
create table if not exists public.services (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  code            text not null,
  name            text not null,
  description     text,
  category        text not null default 'General',
  frequency       service_freq not null default 'annual',
  default_price   numeric(12, 2) not null default 0,
  due_rule        jsonb not null default '{"type":"offset_from_period_end","months":6}'::jsonb,
  lead_time_days  integer not null default 30,   -- when work should start before due date
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists services_tenant_code_idx on public.services (tenant_id, code);
create index if not exists services_tenant_idx on public.services (tenant_id);

create trigger services_set_updated_at before update on public.services
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Client <-> Service assignments
-- -----------------------------------------------------------------------------
create table if not exists public.client_services (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  client_id          uuid not null references public.clients (id) on delete cascade,
  service_id         uuid not null references public.services (id) on delete cascade,
  price              numeric(12, 2),
  frequency_override service_freq,
  assignee_id        uuid references public.profiles (id) on delete set null,
  start_date         date not null default current_date,
  end_date           date,
  is_active          boolean not null default true,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (client_id, service_id)
);

create index if not exists client_services_tenant_idx on public.client_services (tenant_id);
create index if not exists client_services_client_idx on public.client_services (client_id);

create trigger client_services_set_updated_at before update on public.client_services
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Projects (engagement periods) and Tasks (kanban cards)
-- -----------------------------------------------------------------------------
create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  client_id     uuid not null references public.clients (id) on delete cascade,
  service_id    uuid references public.services (id) on delete set null,
  name          text not null,
  period_label  text,
  period_start  date,
  period_end    date,
  due_date      date,
  status        project_status not null default 'not_started',
  assignee_id   uuid references public.profiles (id) on delete set null,
  budget_hours  numeric(8, 2),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists projects_tenant_idx  on public.projects (tenant_id);
create index if not exists projects_client_idx  on public.projects (client_id);
create index if not exists projects_status_idx  on public.projects (tenant_id, status);

create trigger projects_set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  project_id    uuid references public.projects (id) on delete cascade,
  client_id     uuid references public.clients (id) on delete cascade,
  title         text not null,
  description   text,
  status        task_status not null default 'todo',
  priority      task_priority not null default 'medium',
  assignee_id   uuid references public.profiles (id) on delete set null,
  due_date      date,
  estimate_hours numeric(6, 2),
  position      integer not null default 0,
  completed_at  timestamptz,
  custom        jsonb not null default '{}'::jsonb,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists tasks_tenant_idx   on public.tasks (tenant_id);
create index if not exists tasks_project_idx  on public.tasks (project_id);
create index if not exists tasks_assignee_idx on public.tasks (assignee_id);
create index if not exists tasks_board_idx    on public.tasks (tenant_id, status, position);

create trigger tasks_set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Deadlines — generated from client_services, or added manually
-- Urgency (overdue / due soon / upcoming) is derived at read time from due_date,
-- so it can never go stale in the table.
-- -----------------------------------------------------------------------------
create table if not exists public.deadlines (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  client_id         uuid not null references public.clients (id) on delete cascade,
  service_id        uuid references public.services (id) on delete set null,
  client_service_id uuid references public.client_services (id) on delete cascade,
  project_id        uuid references public.projects (id) on delete set null,
  title             text not null,
  period_label      text,
  period_start      date,
  period_end        date,
  due_date          date not null,
  status            deadline_status not null default 'open',
  snoozed_until     date,
  filed_at          timestamptz,
  assignee_id       uuid references public.profiles (id) on delete set null,
  is_auto           boolean not null default true,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists deadlines_tenant_due_idx on public.deadlines (tenant_id, due_date);
create index if not exists deadlines_client_idx     on public.deadlines (client_id);
create index if not exists deadlines_status_idx     on public.deadlines (tenant_id, status);
-- one auto-generated deadline per client-service per period
create unique index if not exists deadlines_auto_period_idx
  on public.deadlines (client_service_id, period_end)
  where client_service_id is not null and is_auto;

create trigger deadlines_set_updated_at before update on public.deadlines
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Engagement letters + line items
-- -----------------------------------------------------------------------------
create table if not exists public.engagement_letters (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  client_id     uuid not null references public.clients (id) on delete cascade,
  title         text not null default 'Engagement Letter',
  body          text,
  status        letter_status not null default 'draft',
  token         text not null unique default encode(gen_random_bytes(24), 'hex'),
  currency      text not null default 'CAD',
  subtotal      numeric(12, 2) not null default 0,
  tax_rate      numeric(5, 4) not null default 0,
  tax_amount    numeric(12, 2) not null default 0,
  total         numeric(12, 2) not null default 0,
  period_start  date,
  period_end    date,
  recipient_name  text,
  recipient_email citext,
  sent_at       timestamptz,
  viewed_at     timestamptz,
  signed_at     timestamptz,
  declined_at   timestamptz,
  decline_reason text,
  signer_name   text,
  signer_title  text,
  signature_data text,                        -- data-url of the drawn signature
  signature_ip  text,
  pdf_path      text,
  expires_at    timestamptz,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists letters_tenant_idx on public.engagement_letters (tenant_id, status);
create index if not exists letters_client_idx on public.engagement_letters (client_id);

create trigger letters_set_updated_at before update on public.engagement_letters
  for each row execute function public.set_updated_at();

create table if not exists public.engagement_letter_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  letter_id   uuid not null references public.engagement_letters (id) on delete cascade,
  service_id  uuid references public.services (id) on delete set null,
  description text not null,
  quantity    numeric(8, 2) not null default 1,
  unit_price  numeric(12, 2) not null default 0,
  amount      numeric(12, 2) not null default 0,
  position    integer not null default 0
);

create index if not exists letter_items_letter_idx on public.engagement_letter_items (letter_id);

-- -----------------------------------------------------------------------------
-- Documents (Supabase Storage pointers)
-- -----------------------------------------------------------------------------
create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  client_id    uuid references public.clients (id) on delete cascade,
  letter_id    uuid references public.engagement_letters (id) on delete set null,
  name         text not null,
  storage_path text not null,
  mime_type    text,
  size_bytes   bigint,
  is_client_visible boolean not null default false,
  uploaded_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists documents_client_idx on public.documents (client_id);
create index if not exists documents_tenant_idx on public.documents (tenant_id);

-- -----------------------------------------------------------------------------
-- Notifications
-- -----------------------------------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  profile_id  uuid references public.profiles (id) on delete cascade,  -- null = whole firm
  type        text not null default 'info',
  title       text not null,
  body        text,
  link        text,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_inbox_idx on public.notifications (tenant_id, profile_id, is_read, created_at desc);

-- -----------------------------------------------------------------------------
-- Custom field definitions + values
-- -----------------------------------------------------------------------------
create table if not exists public.custom_fields (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  entity      custom_entity not null default 'client',
  key         text not null,
  label       text not null,
  field_type  field_type not null default 'text',
  options     jsonb not null default '[]'::jsonb,
  help_text   text,
  is_required boolean not null default false,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, entity, key)
);

create trigger custom_fields_set_updated_at before update on public.custom_fields
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Audit log — append only
-- -----------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id         bigserial primary key,
  tenant_id  uuid references public.tenants (id) on delete cascade,
  actor_id   uuid references public.profiles (id) on delete set null,
  actor_email text,
  action     text not null,          -- created | updated | deleted | signed | ...
  entity     text not null,          -- client | task | letter | ...
  entity_id  text,
  summary    text,
  metadata   jsonb not null default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_tenant_idx on public.audit_logs (tenant_id, created_at desc);
create index if not exists audit_logs_entity_idx on public.audit_logs (entity, entity_id);

-- -----------------------------------------------------------------------------
-- Marketing: leads captured from the public site
-- -----------------------------------------------------------------------------
create table if not exists public.leads (
  id         uuid primary key default gen_random_uuid(),
  name       text,
  email      citext not null,
  firm_name  text,
  phone      text,
  message    text,
  source     text not null default 'website',
  created_at timestamptz not null default now()
);
