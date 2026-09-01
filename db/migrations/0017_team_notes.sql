-- =============================================================================
-- SpidNums — internal notes about a staff member
-- Target: Supabase Postgres (>= 15)
-- Run order: ... -> 0016_client_messages.sql -> 0017_team_notes.sql
--
-- Admin-only free-text notes on a team member's profile page (capacity,
-- specialisations, time off). Flat like client_messages: add and remove, no
-- editing, no threading.
-- =============================================================================

create table if not exists public.team_notes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  author_id   uuid references public.profiles (id) on delete set null,
  author_name text not null,
  body        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists team_notes_profile_idx
  on public.team_notes (profile_id, created_at desc);
create index if not exists team_notes_tenant_idx
  on public.team_notes (tenant_id);

comment on table public.team_notes is
  'Internal admin-only notes about a staff member — capacity, specialisations, time off. Flat, no threading. See routers/team.py.';

-- -----------------------------------------------------------------------------
-- Row Level Security — same shape and guard as 0016_client_messages.sql:
-- skipped when this Postgres instance has no "authenticated" role. Team notes
-- are firm-internal, so unlike client_messages there is no portal-side split —
-- any authenticated member of the tenant can read/write, matching how the API
-- scopes it (AdminUserDep for write, TenantUserDep for read).
-- -----------------------------------------------------------------------------
do $rls_0017$
begin
  if to_regrole('authenticated') is null then
    raise notice '0017_team_notes.sql: skipping Supabase RLS policy (no "authenticated" role on this Postgres instance).';
    return;
  end if;

  execute 'alter table public.team_notes enable row level security';
  execute 'drop policy if exists team_notes_rw on public.team_notes';
  execute $pol$
    create policy team_notes_rw on public.team_notes
      for all
      to authenticated
      using (public.is_superadmin() or tenant_id = public.current_tenant_id())
      with check (public.is_superadmin() or tenant_id = public.current_tenant_id())
  $pol$;
end $rls_0017$;
