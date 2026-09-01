-- =============================================================================
-- SpidNums — client-portal messages
-- Target: Supabase Postgres (>= 15)
-- Run order: ... -> 0015_desktop_releases.sql -> 0016_client_messages.sql
--
-- The channel for "a client wants to tell the firm something" — a question, a
-- complaint, anything that isn't one of the structured books (invoices,
-- expenses, payroll, taxes, documents). Deliberately flat: no threads, no
-- reply chain, no status workflow. A row is sent once and read (or not) by
-- staff; a firm that needs a full helpdesk should not get one bolted onto the
-- portal.
--
-- Mirrored into public.notifications on insert (see
-- backend/app/routers/client_messages.py) so it surfaces in the bell exactly
-- like a deadline or a signed letter, rather than being a second, silent inbox.
-- =============================================================================

create table if not exists public.client_messages (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  client_id     uuid not null references public.clients (id) on delete cascade,
  sender_id     uuid references public.profiles (id) on delete set null,
  -- Denormalized: who sent it survives the sender's account being deleted.
  sender_name   text not null,
  is_from_client boolean not null default true,
  subject       text,
  body          text not null,
  is_read       boolean not null default false,
  read_at       timestamptz,
  read_by       uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists client_messages_tenant_idx
  on public.client_messages (tenant_id, created_at desc);
create index if not exists client_messages_client_idx
  on public.client_messages (client_id, created_at desc);
create index if not exists client_messages_unread_idx
  on public.client_messages (tenant_id, is_read) where is_read = false;

comment on table public.client_messages is
  'Free-text messages sent from the client portal to the firm (questions, complaints, anything outside the structured books). Flat, one-way, no threading. Mirrored into notifications on insert so it shows in the bell.';

-- -----------------------------------------------------------------------------
-- Row Level Security — same shape and same guard as 0004_client_books.sql:
-- skipped when this Postgres instance has no "authenticated" role (no
-- colocated Supabase project). Firm staff see the whole tenant; a portal user
-- sees only its own client's messages.
-- -----------------------------------------------------------------------------
do $rls_0016$
begin
  if to_regrole('authenticated') is null then
    raise notice '0016_client_messages.sql: skipping Supabase RLS policy (no "authenticated" role on this Postgres instance).';
    return;
  end if;

  execute 'alter table public.client_messages enable row level security';
  execute 'drop policy if exists client_messages_rw on public.client_messages';
  execute $pol$
    create policy client_messages_rw on public.client_messages
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
end $rls_0016$;
