-- =============================================================================
-- SpidNums — staff attendance timesheet (first-login / confirmed-logout per day)
-- Target: Postgres (>= 15)
-- Run order: ... -> 0028_task_timers.sql / 0028_video_calls.sql -> 0029_timesheet.sql
--
-- One row per (profile, work_date). `start_time` is stamped the moment a
-- real sign-in (password, magic link, or OAuth — never a silent token
-- refresh) is the first one that profile makes that day; it is never
-- overwritten afterward. `end_time` stays null until the staff member
-- explicitly confirms "yes, this is my end time" on a Logout click — a
-- day with no confirmed logout (closed the tab, dismissed the prompt, or
-- left the app open) simply keeps end_time null, exactly like an empty
-- sign-off. A later confirmed logout the same day overwrites end_time with
-- that newer timestamp, so "log in again, work more, confirm logout again"
-- always banks the *last* confirmed moment. See
-- backend/app/services/attendance.py and backend/app/routers/timesheet.py.
--
-- Firm staff only (profile.client_id is null) — a client-portal login never
-- touches this table, so — matching task_timers' own precedent
-- (0028_task_timers.sql) — this carries no RLS policy; tenant scoping is
-- enforced in FastAPI code like the rest of the firm-side app.
-- =============================================================================

create table if not exists public.attendance_days (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  work_date   date not null,
  -- First real sign-in of the day. Never overwritten once set.
  start_time  timestamptz not null,
  -- Null = no confirmed logout yet today. Set (and re-set) only by an
  -- explicit staff confirmation, never by a raw session end.
  end_time    timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (profile_id, work_date)
);

create index if not exists attendance_days_tenant_idx on public.attendance_days (tenant_id);
create index if not exists attendance_days_profile_idx on public.attendance_days (profile_id);
create index if not exists attendance_days_work_date_idx on public.attendance_days (work_date);

create trigger attendance_days_set_updated_at before update on public.attendance_days
  for each row execute function public.set_updated_at();

comment on table public.attendance_days is
  'Daily attendance: first-login start_time and confirmed-logout end_time per staff profile. end_time is null until the staff member explicitly confirms their end-of-day. See backend/app/services/attendance.py.';
