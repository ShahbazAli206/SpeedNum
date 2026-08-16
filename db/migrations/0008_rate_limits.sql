-- =============================================================================
-- Rate limiting — fixed-window counters shared across every API worker
-- Target: any Postgres 16+ (portable — no Supabase-specific SQL)
--
-- Backs services/rate_limit.py. A Postgres table rather than an in-process
-- counter or Redis: WEB_CONCURRENCY=4 means four separate uvicorn processes,
-- so an in-memory counter would only ever see one worker's quarter of the
-- traffic (same class of problem services/scheduler.py already solved with
-- a Postgres advisory lock for the reminder sweep); Redis would be a new
-- piece of infrastructure for one feature when the database already in this
-- stack does the job.
-- =============================================================================

create table if not exists public.rate_limit_hits (
  bucket_key   text        not null,
  window_start timestamptz not null,
  count        integer     not null default 1,
  primary key (bucket_key, window_start)
);

-- Old windows are useless the moment they end (nothing ever reads a past
-- window), so this index only exists to make the cleanup delete cheap.
create index if not exists rate_limit_hits_window_idx
  on public.rate_limit_hits (window_start);

comment on table public.rate_limit_hits is
  'Fixed-window request counters. One row per (bucket key, window start); INSERT ... ON CONFLICT DO UPDATE ... RETURNING count makes the increment-and-check atomic under concurrent workers. Rows past their window are dead and swept opportunistically by services/rate_limit.py.';
