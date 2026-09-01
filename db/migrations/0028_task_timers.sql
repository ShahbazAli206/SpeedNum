-- =============================================================================
-- SpidNums — task timers (per-assignee time tracking on Task Master tasks)
-- Target: Supabase Postgres (>= 15)
-- Run order: ... -> 0027_client_message_attachments.sql -> 0028_task_timers.sql
--
-- One row per (task, assignee) pair the assignee has ever tracked time
-- against — reassigning a task later doesn't erase or merge a previous
-- assignee's logged time; whoever picks it up next just gets a fresh row.
-- `accumulated_seconds` is the banked total from every finished segment;
-- `started_at` is set only while a segment is actively running (null when
-- stopped), so "resume where you left off" is accumulated_seconds + (now -
-- started_at) without a full per-session log. See
-- backend/app/routers/task_timers.py.
--
-- The partial unique index enforces "one running timer per assignee",
-- tenant-wide, at the database level — not just in application code.
--
-- Staff-only, same reach as task_comments (0013_task_attachments_comments.sql):
-- no client-portal endpoint ever touches this table (client-portal task
-- visibility doesn't exist at all yet), so — matching that table's own
-- precedent — this carries no RLS policy; tenant scoping is enforced in
-- FastAPI code like the rest of Task Master.
-- =============================================================================

create table if not exists public.task_timers (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  task_id             uuid not null references public.tasks (id) on delete cascade,
  assignee_id         uuid not null references public.profiles (id) on delete cascade,
  status              text not null default 'stopped' check (status in ('running', 'stopped')),
  accumulated_seconds bigint not null default 0,
  -- Set only while status = 'running'; the moment the current segment began.
  started_at          timestamptz,
  -- Informational only ("last worked 2 days ago") — not used in any duration math.
  last_stopped_at     timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (task_id, assignee_id)
);

create index if not exists task_timers_tenant_idx on public.task_timers (tenant_id);
create index if not exists task_timers_task_idx on public.task_timers (task_id);

-- One running timer per assignee, tenant-wide — the DB-level guarantee
-- behind "one active timer at a time" (the router double-checks in code
-- first too, for a clean 409 instead of a raw constraint violation).
create unique index if not exists task_timers_one_running_per_assignee
  on public.task_timers (assignee_id) where status = 'running';

create trigger task_timers_set_updated_at before update on public.task_timers
  for each row execute function public.set_updated_at();

comment on table public.task_timers is
  'Time tracked per (task, assignee) pair. accumulated_seconds is the banked total across finished segments; started_at is set only while running. See backend/app/routers/task_timers.py.';
