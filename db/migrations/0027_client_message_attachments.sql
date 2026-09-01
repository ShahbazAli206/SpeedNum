-- =============================================================================
-- SpidNums — attachments on client-portal messages
-- Target: Supabase Postgres (>= 15)
-- Run order: ... -> 0026_invoicing_and_bills.sql -> 0027_client_message_attachments.sql
--
-- Files hung off a client_messages row (0016_client_messages.sql) — mirrors
-- support_attachments (0023_support_messages.sql): the same presigned
-- documents-bucket pipeline, minted server-side under
-- {tenant_id}/client-messages/{client_id}/{uuid}-{name}. tenant_id and
-- client_id are both denormalized from the parent message (same reasoning as
-- support_messages denormalizing tenant_id from support_threads) so RLS below
-- can mirror client_messages_rw exactly without a join.
--
-- Access is unchanged by this migration: a message's own client_id/tenant_id
-- scoping in backend/app/routers/client_messages.py still decides who can
-- read or attach files — a client only ever reaches its own thread, staff
-- only the clients they're allowed to message.
-- =============================================================================

create table if not exists public.client_message_attachments (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.client_messages (id) on delete cascade,
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  client_id    uuid not null references public.clients (id) on delete cascade,
  name         text not null,
  -- Object key in the private `documents` bucket, minted server-side
  -- ({tenant_id}/client-messages/{client_id}/{uuid}-{name}) — same presigned
  -- pipeline as support/task/client-document attachments.
  storage_path text not null,
  mime_type    text,
  size_bytes   bigint,
  created_at   timestamptz not null default now()
);

create index if not exists client_message_attachments_message_idx
  on public.client_message_attachments (message_id);

comment on table public.client_message_attachments is
  'Files attached to a client-portal message, stored via the presigned documents bucket (not inline). See backend/app/routers/client_messages.py.';

-- -----------------------------------------------------------------------------
-- Row Level Security — same shape and same guard as 0016_client_messages.sql:
-- skipped when this Postgres instance has no "authenticated" role (no
-- colocated Supabase project). Mirrors client_messages_rw exactly since this
-- table carries the same tenant_id/client_id scoping.
-- -----------------------------------------------------------------------------
do $rls_0027$
begin
  if to_regrole('authenticated') is null then
    raise notice '0027_client_message_attachments.sql: skipping Supabase RLS policy (no "authenticated" role on this Postgres instance).';
    return;
  end if;

  execute 'alter table public.client_message_attachments enable row level security';
  execute 'drop policy if exists client_message_attachments_rw on public.client_message_attachments';
  execute $pol$
    create policy client_message_attachments_rw on public.client_message_attachments
      for all
      to authenticated
      using (
        public.is_superadmin()
        or (tenant_id = public.current_tenant_id()
            and (public.current_client_id() is null
                 or client_id = public.current_client_id()))
      )
      with check (
        public.is_superadmin()
        or (tenant_id = public.current_tenant_id()
            and (public.current_client_id() is null
                 or client_id = public.current_client_id()))
      )
  $pol$;
end $rls_0027$;
