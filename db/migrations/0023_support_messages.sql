-- =============================================================================
-- SpeedNum — company-owner ↔ platform support messaging
-- Target: Supabase Postgres (>= 15)
-- Run order: ... -> 0022_plan_request_custom_and_attachment.sql -> 0023_support_messages.sql
--
-- A threaded, two-way channel between a company owner (a tenant's Owner) and the
-- SpeedNum platform provider (the is_superadmin operator, working inside the
-- workspace tenant flagged settings.is_platform). Distinct from
-- 0016_client_messages.sql, which is a client↔firm channel scoped to one tenant
-- and one client, flat and one-way: this one crosses the tenant boundary (the
-- super-admin reads every firm's thread from the platform side) and IS a
-- conversation — replies both ways, read receipts per side.
--
-- One thread per company (support_threads.tenant_id is unique). Messages carry
-- `from_platform` to say which side spoke; `read_at` is set when the *other*
-- side has seen the message, which is what drives each side's unread badge.
--
-- Mirrored into public.notifications on insert (see
-- backend/app/routers/support.py): a firm message notifies the platform
-- workspace tenant, a platform reply notifies the firm's Owners.
-- =============================================================================

create table if not exists public.support_threads (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null unique references public.tenants (id) on delete cascade,
  -- Bumped on every message so the platform inbox can sort companies by most
  -- recent activity without a per-thread aggregate.
  last_message_at timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists public.support_messages (
  id            uuid primary key default gen_random_uuid(),
  thread_id     uuid not null references public.support_threads (id) on delete cascade,
  -- Denormalized copy of the thread's tenant, so the tenant-scoped reads and
  -- the unread index below never need to join through support_threads.
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  sender_id     uuid references public.profiles (id) on delete set null,
  -- Denormalized: who sent it survives the sender's account being deleted.
  sender_name   text not null,
  -- true  = sent by the platform super-admin (the "firm owner" side)
  -- false = sent by the company owner (the firm side)
  from_platform boolean not null default false,
  body          text not null,
  -- Set when the *recipient* side has read it (null = still unread by them).
  -- The recipient is the opposite side of from_platform.
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);

create table if not exists public.support_attachments (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.support_messages (id) on delete cascade,
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  name         text not null,
  -- Object key in the private `documents` bucket, minted server-side
  -- ({tenant_id}/support/{thread_id}/{uuid}-{name}) — same presigned pipeline
  -- as task/client attachments (backend/app/services/storage_supabase.py).
  storage_path text not null,
  mime_type    text,
  size_bytes   bigint,
  created_at   timestamptz not null default now()
);

create index if not exists support_messages_thread_idx
  on public.support_messages (thread_id, created_at);
create index if not exists support_messages_tenant_idx
  on public.support_messages (tenant_id, created_at desc);
-- Drives both unread badges: firm side counts from_platform = true rows,
-- platform side counts from_platform = false rows, both where read_at is null.
create index if not exists support_messages_unread_idx
  on public.support_messages (tenant_id, from_platform) where read_at is null;
create index if not exists support_attachments_message_idx
  on public.support_attachments (message_id);

comment on table public.support_threads is
  'One support conversation per company (tenant) between the company Owner and the SpeedNum platform super-admin. See backend/app/routers/support.py.';
comment on table public.support_messages is
  'Messages in a company↔platform support thread. from_platform marks the sender side; read_at is set when the opposite side reads it (drives per-side unread badges).';
comment on table public.support_attachments is
  'Files attached to a support message, stored via the presigned documents bucket (not inline).';

-- -----------------------------------------------------------------------------
-- Row Level Security — same shape and same guard as 0016_client_messages.sql:
-- skipped when this Postgres instance has no "authenticated" role (no colocated
-- Supabase project). The platform super-admin (is_superadmin) sees every firm's
-- thread; a firm sees only its own tenant's rows. The owner-only refinement is
-- enforced by the API deps (OwnerOrSuperadminDep), not here — RLS stays at the
-- tenant grain like the rest of the schema.
-- -----------------------------------------------------------------------------
do $rls_0023$
begin
  if to_regrole('authenticated') is null then
    raise notice '0023_support_messages.sql: skipping Supabase RLS policy (no "authenticated" role on this Postgres instance).';
    return;
  end if;

  execute 'alter table public.support_threads enable row level security';
  execute 'drop policy if exists support_threads_rw on public.support_threads';
  execute $pol$
    create policy support_threads_rw on public.support_threads
      for all
      to authenticated
      using (public.is_superadmin() or tenant_id = public.current_tenant_id())
      with check (public.is_superadmin() or tenant_id = public.current_tenant_id())
  $pol$;

  execute 'alter table public.support_messages enable row level security';
  execute 'drop policy if exists support_messages_rw on public.support_messages';
  execute $pol$
    create policy support_messages_rw on public.support_messages
      for all
      to authenticated
      using (public.is_superadmin() or tenant_id = public.current_tenant_id())
      with check (public.is_superadmin() or tenant_id = public.current_tenant_id())
  $pol$;

  execute 'alter table public.support_attachments enable row level security';
  execute 'drop policy if exists support_attachments_rw on public.support_attachments';
  execute $pol$
    create policy support_attachments_rw on public.support_attachments
      for all
      to authenticated
      using (public.is_superadmin() or tenant_id = public.current_tenant_id())
      with check (public.is_superadmin() or tenant_id = public.current_tenant_id())
  $pol$;
end $rls_0023$;
