-- =============================================================================
-- SpeedNum — tenant-defined custom roles and granular permissions
-- Target: Supabase Postgres (>= 15) / plain Postgres 16 (VPS)
-- Run order: ... -> 0017_team_notes.sql -> 0018_roles_permissions.sql
--
-- Replaces the hardcoded "if role == 'admin'" scoping check (clients.py's
-- _owner_scope) with a tenant-owned, per-role permission grant. `profiles.role`
-- (the owner/admin/member/viewer enum) is left exactly as-is — it still
-- identifies the Owner (role = 'owner') and is otherwise only a legacy label.
-- A new nullable `profiles.role_id` points at a tenant-scoped `roles` row for
-- any non-owner staff member; permission checks (see app/permissions.py) walk
-- role_permissions for that role. Owner and platform superadmin bypass the
-- table entirely and always pass every check (see app/permissions.has_permission)
-- — deliberately not represented as rows here, per the plan's migration notes.
--
-- Role names are free-form per tenant (this migration seeds three starter
-- roles per existing tenant named Admin/Member/Viewer, matching the old fixed
-- enum's behaviour exactly, so no existing tenant's access changes on deploy —
-- the owner can rename/add/remove roles afterward from the new /roles API).
-- =============================================================================

create table if not exists public.roles (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Case-insensitive uniqueness per tenant ("Admin" and "admin" collide) — the
-- API validates this too, but the constraint is the actual guarantee.
create unique index if not exists roles_tenant_name_idx
  on public.roles (tenant_id, lower(name));

comment on table public.roles is
  'Tenant-defined staff role types (free-form names, e.g. "Clerk Admin"). See app/permissions.py.';

create table if not exists public.role_permissions (
  role_id        uuid not null references public.roles (id) on delete cascade,
  permission_key text not null,
  allowed        boolean not null default true,
  primary key (role_id, permission_key)
);

comment on table public.role_permissions is
  'Per-role permission grants. permission_key is validated against app/permissions.PERMISSION_KEYS at the API layer, not a DB constraint, so new keys never need a migration.';

alter table public.profiles
  add column if not exists role_id uuid references public.roles (id) on delete set null;

comment on column public.profiles.role_id is
  'Tenant-defined role for permission checks (app/permissions.py). Null for the Owner and platform superadmin, who bypass the permission system entirely, and for client-portal accounts, for whom it is meaningless.';

create index if not exists profiles_role_id_idx on public.profiles (role_id);

-- -----------------------------------------------------------------------------
-- Backfill: give every existing tenant its three starter roles, with grants
-- that reproduce today's hardcoded behaviour exactly (see the
-- _LEGACY_DEFAULTS table in app/permissions.py — keep the two in sync by hand
-- if either changes), then point every existing non-owner staff profile at
-- the matching role. Owner and client-portal profiles are left with
-- role_id = null on purpose.
-- -----------------------------------------------------------------------------
do $backfill_0018$
declare
  t record;
  admin_role_id  uuid;
  member_role_id uuid;
  viewer_role_id uuid;
begin
  for t in select id from public.tenants loop
    insert into public.roles (tenant_id, name, description)
    values (t.id, 'Admin', 'Restricted to their own assigned clients.')
    returning id into admin_role_id;

    insert into public.roles (tenant_id, name, description)
    values (t.id, 'Member', 'Full access to the firm''s book.')
    returning id into member_role_id;

    insert into public.roles (tenant_id, name, description)
    values (t.id, 'Viewer', 'Full access to the firm''s book.')
    returning id into viewer_role_id;

    insert into public.role_permissions (role_id, permission_key, allowed) values
      (admin_role_id, 'clients.view_all', false),
      (admin_role_id, 'clients.manage',   true),
      (admin_role_id, 'clients.delete',   true),
      (admin_role_id, 'clients.assign',   true),
      (admin_role_id, 'services.manage',  true),
      (admin_role_id, 'tasks.view_all',   true),
      (admin_role_id, 'tasks.manage',     true),

      (member_role_id, 'clients.view_all', true),
      (member_role_id, 'clients.manage',   true),
      (member_role_id, 'clients.delete',   false),
      (member_role_id, 'clients.assign',   true),
      (member_role_id, 'services.manage',  true),
      (member_role_id, 'tasks.view_all',   true),
      (member_role_id, 'tasks.manage',     true),

      (viewer_role_id, 'clients.view_all', true),
      (viewer_role_id, 'clients.manage',   true),
      (viewer_role_id, 'clients.delete',   false),
      (viewer_role_id, 'clients.assign',   true),
      (viewer_role_id, 'services.manage',  true),
      (viewer_role_id, 'tasks.view_all',   true),
      (viewer_role_id, 'tasks.manage',     true);

    update public.profiles
       set role_id = admin_role_id
     where tenant_id = t.id and client_id is null and role = 'admin';

    update public.profiles
       set role_id = member_role_id
     where tenant_id = t.id and client_id is null and role = 'member';

    update public.profiles
       set role_id = viewer_role_id
     where tenant_id = t.id and client_id is null and role = 'viewer';
  end loop;
end $backfill_0018$;

-- -----------------------------------------------------------------------------
-- Row Level Security — same guarded shape as every prior migration (0016,
-- 0017): skipped when this Postgres instance has no "authenticated" role
-- (i.e. the plain-Postgres/VPS deployment target, where the app enforces
-- tenant scoping itself). role_permissions has no tenant_id of its own, so its
-- policy joins through roles.
-- -----------------------------------------------------------------------------
do $rls_0018$
begin
  if to_regrole('authenticated') is null then
    raise notice '0018_roles_permissions.sql: skipping Supabase RLS policies (no "authenticated" role on this Postgres instance).';
    return;
  end if;

  execute 'alter table public.roles enable row level security';
  execute 'drop policy if exists roles_rw on public.roles';
  execute $pol$
    create policy roles_rw on public.roles
      for all
      to authenticated
      using (public.is_superadmin() or tenant_id = public.current_tenant_id())
      with check (public.is_superadmin() or tenant_id = public.current_tenant_id())
  $pol$;

  execute 'alter table public.role_permissions enable row level security';
  execute 'drop policy if exists role_permissions_rw on public.role_permissions';
  execute $pol$
    create policy role_permissions_rw on public.role_permissions
      for all
      to authenticated
      using (
        public.is_superadmin()
        or role_id in (select id from public.roles where tenant_id = public.current_tenant_id())
      )
      with check (
        public.is_superadmin()
        or role_id in (select id from public.roles where tenant_id = public.current_tenant_id())
      )
  $pol$;
end $rls_0018$;
