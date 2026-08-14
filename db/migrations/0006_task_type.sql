-- =============================================================================
-- SpeedNum — task type (Internal / Client / Other)
-- Target: Supabase Postgres (>= 15)
-- Run order: 0001 -> 0002 -> 0003 -> 0004 -> 0005 -> 0006_task_type.sql
--
-- Task Master groups work three ways regardless of whether a specific client
-- is attached — a "Client" task can exist with no client_id set (scoped to
-- the client relationship in general, not one record), which is why this is
-- its own column rather than being derived from client_id IS NOT NULL.
-- =============================================================================

do $$ begin
  create type task_type as enum ('internal', 'client', 'other');
exception when duplicate_object then null; end $$;

alter table public.tasks
  add column if not exists task_type task_type not null default 'internal';

-- Backfill existing rows from the one signal already on record: a task tied
-- to a specific client was clearly client work, whatever type it's given
-- going forward is a firm decision, not something to keep re-deriving.
update public.tasks set task_type = 'client' where client_id is not null;

comment on column public.tasks.task_type is
  'Internal / Client / Other — independent of client_id, which may be null even for "client" work.';
