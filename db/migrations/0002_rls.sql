-- =============================================================================
-- Row Level Security
--
-- The FastAPI backend connects as the Postgres owner (BYPASSRLS) and enforces
-- tenant scoping in code. These policies are defence-in-depth for anything that
-- reaches the database through Supabase's `anon` / `authenticated` roles
-- (PostgREST, Realtime, Storage, supabase-js in the browser).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_superadmin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_tenant_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('owner', 'admin') from public.profiles where id = auth.uid()),
    false
  );
$$;

grant execute on function public.current_tenant_id()  to authenticated;
grant execute on function public.current_role()       to authenticated;
grant execute on function public.is_superadmin()      to authenticated;
grant execute on function public.is_tenant_admin()    to authenticated;

-- -----------------------------------------------------------------------------
-- Enable RLS everywhere
-- -----------------------------------------------------------------------------
alter table public.tenants                 enable row level security;
alter table public.profiles                enable row level security;
alter table public.invitations             enable row level security;
alter table public.clients                 enable row level security;
alter table public.contacts                enable row level security;
alter table public.services                enable row level security;
alter table public.client_services         enable row level security;
alter table public.projects                enable row level security;
alter table public.tasks                   enable row level security;
alter table public.deadlines               enable row level security;
alter table public.engagement_letters      enable row level security;
alter table public.engagement_letter_items enable row level security;
alter table public.documents               enable row level security;
alter table public.notifications           enable row level security;
alter table public.custom_fields           enable row level security;
alter table public.audit_logs              enable row level security;
alter table public.leads                   enable row level security;

-- -----------------------------------------------------------------------------
-- Tenant-scoped tables: one read/write policy each
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
  tenant_tables text[] := array[
    'clients', 'contacts', 'services', 'client_services', 'projects', 'tasks',
    'deadlines', 'engagement_letters', 'documents', 'custom_fields'
  ];
begin
  foreach t in array tenant_tables loop
    execute format('drop policy if exists %I on public.%I', t || '_tenant_rw', t);
    execute format($f$
      create policy %I on public.%I
        for all
        to authenticated
        using (tenant_id = public.current_tenant_id() or public.is_superadmin())
        with check (tenant_id = public.current_tenant_id() or public.is_superadmin())
    $f$, t || '_tenant_rw', t);
  end loop;
end $$;

-- Letter line items inherit access from their parent letter.
drop policy if exists letter_items_tenant_rw on public.engagement_letter_items;
create policy letter_items_tenant_rw on public.engagement_letter_items
  for all
  to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_superadmin())
  with check (tenant_id = public.current_tenant_id() or public.is_superadmin());

-- -----------------------------------------------------------------------------
-- Tenants
-- -----------------------------------------------------------------------------
drop policy if exists tenants_select on public.tenants;
create policy tenants_select on public.tenants
  for select to authenticated
  using (id = public.current_tenant_id() or public.is_superadmin());

drop policy if exists tenants_update on public.tenants;
create policy tenants_update on public.tenants
  for update to authenticated
  using ((id = public.current_tenant_id() and public.is_tenant_admin()) or public.is_superadmin())
  with check ((id = public.current_tenant_id() and public.is_tenant_admin()) or public.is_superadmin());

-- -----------------------------------------------------------------------------
-- Profiles
-- -----------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or tenant_id = public.current_tenant_id() or public.is_superadmin());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()) or public.is_superadmin())
  with check (id = auth.uid() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()) or public.is_superadmin());

-- -----------------------------------------------------------------------------
-- Invitations (admins only)
-- -----------------------------------------------------------------------------
drop policy if exists invitations_admin_rw on public.invitations;
create policy invitations_admin_rw on public.invitations
  for all to authenticated
  using ((tenant_id = public.current_tenant_id() and public.is_tenant_admin()) or public.is_superadmin())
  with check ((tenant_id = public.current_tenant_id() and public.is_tenant_admin()) or public.is_superadmin());

-- -----------------------------------------------------------------------------
-- Notifications — a user sees firm-wide (profile_id null) plus their own
-- -----------------------------------------------------------------------------
drop policy if exists notifications_rw on public.notifications;
create policy notifications_rw on public.notifications
  for all to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (profile_id is null or profile_id = auth.uid())
  )
  with check (tenant_id = public.current_tenant_id());

-- -----------------------------------------------------------------------------
-- Audit logs — read-only for admins, append handled by the backend
-- -----------------------------------------------------------------------------
drop policy if exists audit_logs_read on public.audit_logs;
create policy audit_logs_read on public.audit_logs
  for select to authenticated
  using ((tenant_id = public.current_tenant_id() and public.is_tenant_admin()) or public.is_superadmin());

-- -----------------------------------------------------------------------------
-- Leads — the public marketing form may insert, nobody but superadmins may read
-- -----------------------------------------------------------------------------
drop policy if exists leads_insert_public on public.leads;
create policy leads_insert_public on public.leads
  for insert to anon, authenticated
  with check (true);

drop policy if exists leads_read_superadmin on public.leads;
create policy leads_read_superadmin on public.leads
  for select to authenticated
  using (public.is_superadmin());
