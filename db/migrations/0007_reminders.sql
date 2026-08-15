-- =============================================================================
-- SpeedNum — reminders
-- Target: Supabase Postgres (>= 15)
-- Run order: 0001 -> 0002 -> 0003 -> 0004 -> 0005 -> 0006_* -> 0007_reminders.sql
--
-- A reminder is the *acted-upon* record of a countdown crossing a threshold —
-- "10 days left on Lakeview Dental's T2", "this task is 3 days overdue". It is
-- deliberately its own table rather than a view over `deadlines`, because a
-- firm acknowledges, snoozes and dismisses reminders on a different cadence
-- than it files the underlying obligation: the T2 is still open after someone
-- has read the 10-day warning, and the 3-day warning must still fire later.
--
-- `dedupe_key` is what makes the sweep idempotent. It encodes the source row
-- and the threshold that fired ("deadline:<uuid>:10"), so re-running the sweep
-- any number of times a day inserts each reminder exactly once, while a *new*
-- threshold on the same deadline is a genuinely new row.
-- =============================================================================

do $$ begin
  create type reminder_status as enum ('open', 'acknowledged', 'snoozed', 'done', 'dismissed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type reminder_severity as enum ('info', 'warning', 'critical');
exception when duplicate_object then null; end $$;

create table if not exists public.reminders (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,

  -- What produced it. Exactly one of the source ids below is set.
  kind              text not null,          -- deadline | task | letter | portal
  dedupe_key        text not null,
  deadline_id       uuid references public.deadlines (id) on delete cascade,
  task_id           uuid references public.tasks (id) on delete cascade,
  letter_id         uuid references public.engagement_letters (id) on delete cascade,
  client_id         uuid references public.clients (id) on delete cascade,

  -- Who should see it first. Null = the whole firm (admins get the email).
  assignee_id       uuid references public.profiles (id) on delete set null,

  title             text not null,
  body              text,
  link              text,
  due_date          date not null,
  -- The threshold that fired: 10 / 7 / 3 / 1 days before, 0 on the due date,
  -- negative once overdue (-1 = the "it is now late" reminder).
  days_before       integer not null,
  severity          reminder_severity not null default 'info',

  status            reminder_status not null default 'open',
  snoozed_until     date,
  emailed_at        timestamptz,
  acknowledged_at   timestamptz,
  acknowledged_by   uuid references public.profiles (id) on delete set null,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint reminders_dedupe_unique unique (tenant_id, dedupe_key)
);

create index if not exists reminders_tenant_status_due_idx
  on public.reminders (tenant_id, status, due_date);
create index if not exists reminders_tenant_created_idx
  on public.reminders (tenant_id, created_at desc);
create index if not exists reminders_assignee_idx
  on public.reminders (assignee_id) where assignee_id is not null;
create index if not exists reminders_client_idx
  on public.reminders (client_id) where client_id is not null;

comment on table public.reminders is
  'Threshold-crossing alerts (10/7/3/1/0 days out, then overdue) generated from deadlines, tasks and unsigned letters. One row per (source, threshold) via dedupe_key, so the sweep is idempotent.';
comment on column public.reminders.dedupe_key is
  'Stable identity of the source row + threshold, e.g. "deadline:<uuid>:10". The unique constraint on (tenant_id, dedupe_key) is what makes repeated sweeps safe.';
comment on column public.reminders.days_before is
  'Threshold that fired, in days remaining when generated. 0 = due today, negative = already overdue.';

-- Keep updated_at honest. set_updated_at() is defined in 0001_schema.sql.
drop trigger if exists reminders_set_updated_at on public.reminders;
create trigger reminders_set_updated_at
  before update on public.reminders
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS — same shape as notifications: firm-wide rows (assignee_id null) plus
-- your own. See 0002_rls.sql for the helper functions.
--
-- Guarded like 0004: skipped when this Postgres instance has no
-- `authenticated` role (no colocated Supabase project, so no consumer other
-- than this application's own owner-role connection — see 0004 for the full
-- reasoning).
-- -----------------------------------------------------------------------------
do $rls_0007$
begin
  if to_regrole('authenticated') is null then
    raise notice '0007_reminders.sql: skipping Supabase RLS policy (no "authenticated" role on this Postgres instance).';
    return;
  end if;

  execute 'alter table public.reminders enable row level security';
  execute 'drop policy if exists reminders_rw on public.reminders';
  execute $pol$
    create policy reminders_rw on public.reminders
      for all to authenticated
      using (
        tenant_id = public.current_tenant_id()
        and (assignee_id is null or assignee_id = auth.uid() or public.is_tenant_admin())
      )
      with check (tenant_id = public.current_tenant_id())
  $pol$;
end $rls_0007$;

-- -----------------------------------------------------------------------------
-- Reminder lead times live on the tenant so a firm can tune them. Read by
-- backend/app/services/reminders.py, which falls back to the default ladder
-- when the key is absent.
-- -----------------------------------------------------------------------------
update public.tenants
   set settings = jsonb_set(
         coalesce(settings, '{}'::jsonb),
         '{reminder_days}',
         '[30, 14, 10, 7, 3, 1, 0]'::jsonb,
         true
       )
 where not (coalesce(settings, '{}'::jsonb) ? 'reminder_days');
