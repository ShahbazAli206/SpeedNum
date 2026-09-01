-- =============================================================================
-- SpidNums — video calling (self-hosted LiveKit SFU)
-- Target: any Postgres 16+ (portable — no Supabase-specific SQL)
-- Run order: ... -> 0027_client_message_attachments.sql -> 0028_video_calls.sql
--
-- Data model for spidnums_VIDEO_CALL_IMPLEMENTATION_SPEC.md §11-16. LiveKit
-- itself (deploy/docker-compose.yml's `livekit`/`coturn` services, added in
-- Phase 1) owns WebRTC signaling, media transport and realtime in-room
-- data/chat delivery — this schema is the FastAPI/Postgres side: who is
-- allowed to be in a call, the call's lifecycle, and a persisted audit trail
-- and chat history. See VIDEO_CALL_PROGRESS.md for the full design context.
--
-- A call is a session with N participants, not a fixed caller+callee pair
-- (spec §11) — group calls and mid-call invitations both build on the same
-- five tables:
--   call_sessions     one row per call, from ringing to ended
--   call_participants who is/was in it, and their per-participant state
--   call_invitations  a mid-call (or initial) invite, separate from
--                     participant state because an invitation can be
--                     declined/expired without ever becoming a participant
--   call_events       append-only lifecycle audit trail (spec §33.9 — never
--                     media contents, only who/what/when)
--   call_messages     in-call chat persistence. LiveKit's realtime data
--                     channel is the actual delivery path (spec §16); this
--                     table is history, not the transport.
--
-- Deliberately absent from this schema, per spec §33 (Canada privacy/CRA
-- guidance): no recording, no stored media, no chat retention column here —
-- retention is enforced by application-level sweeps against created_at
-- (added when call_messages persistence actually lands, Phase 11), not a
-- schema constraint baked in now.
-- =============================================================================

create type public.call_type as enum ('audio', 'video');

create type public.call_session_status as enum (
  'ringing', 'accepted', 'declined', 'missed', 'cancelled', 'ended', 'failed'
);

create type public.call_participant_role as enum ('initiator', 'participant', 'moderator');

create type public.call_participant_status as enum (
  'invited', 'ringing', 'joined', 'declined', 'left', 'removed'
);

create type public.call_invitation_status as enum (
  'pending', 'accepted', 'declined', 'expired', 'cancelled'
);

create type public.call_event_type as enum (
  'call_created', 'call_ringing', 'call_accepted', 'call_declined', 'call_missed',
  'participant_invited', 'participant_joined', 'participant_left', 'participant_removed',
  'call_ended'
);

-- -----------------------------------------------------------------------------
-- call_sessions
-- -----------------------------------------------------------------------------
create table if not exists public.call_sessions (
  id                  uuid primary key default gen_random_uuid(),
  -- Nullable per spec §12 ("nullable where platform calls require it"). Under
  -- the calling matrix actually enforced by app/permissions.py::can_call, this
  -- is always populated in practice — a platform<->Owner call is scoped to the
  -- Owner's own tenant (mirrors support_threads.tenant_id), and every other
  -- call is intra-tenant by construction. Left nullable in the schema anyway
  -- rather than fighting the spec's explicit instruction for a hypothetical
  -- future case (e.g. platform-internal calls) that isn't reachable today.
  tenant_id           uuid references public.tenants (id) on delete cascade,
  room_name           text not null unique,
  -- Denormalized copy of who started it — also present as the `initiator`-role
  -- row in call_participants, kept here too so a call's own identity survives
  -- even if that participant row is ever removed. Event survives the
  -- initiator's account being deleted (see ClientMessage.sender_id precedent).
  initiator_profile_id uuid references public.profiles (id) on delete set null,
  call_type           public.call_type not null default 'video',
  status              public.call_session_status not null default 'ringing',
  started_at          timestamptz not null default now(),
  connected_at        timestamptz,
  ended_at            timestamptz,
  duration_seconds    integer,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists call_sessions_tenant_status_idx
  on public.call_sessions (tenant_id, status);
create index if not exists call_sessions_initiator_idx
  on public.call_sessions (initiator_profile_id);
create index if not exists call_sessions_created_idx
  on public.call_sessions (created_at desc);

-- -----------------------------------------------------------------------------
-- call_participants
-- -----------------------------------------------------------------------------
create table if not exists public.call_participants (
  id              uuid primary key default gen_random_uuid(),
  call_session_id uuid not null references public.call_sessions (id) on delete cascade,
  -- No ON DELETE SET NULL here (unlike the actor/sender columns below):
  -- profiles in this app are soft-deactivated (Profile.is_active), never hard
  -- -deleted in the ordinary product flow, so this follows the same
  -- plain-FK convention as Task.assignee_id/Client.owner_id rather than the
  -- "denormalized historical actor" pattern.
  profile_id      uuid not null references public.profiles (id),
  role            public.call_participant_role not null default 'participant',
  status          public.call_participant_status not null default 'invited',
  invited_at      timestamptz not null default now(),
  joined_at       timestamptz,
  left_at         timestamptz,
  created_at      timestamptz not null default now(),
  -- One participant row per (call, profile) — re-invites/re-joins update the
  -- existing row's status rather than accumulating duplicates.
  unique (call_session_id, profile_id)
);

create index if not exists call_participants_call_idx
  on public.call_participants (call_session_id);
create index if not exists call_participants_profile_idx
  on public.call_participants (profile_id, status);

-- -----------------------------------------------------------------------------
-- call_invitations
-- -----------------------------------------------------------------------------
create table if not exists public.call_invitations (
  id                 uuid primary key default gen_random_uuid(),
  call_session_id    uuid not null references public.call_sessions (id) on delete cascade,
  inviter_profile_id uuid not null references public.profiles (id),
  invitee_profile_id uuid not null references public.profiles (id),
  status             public.call_invitation_status not null default 'pending',
  created_at         timestamptz not null default now(),
  responded_at       timestamptz
);

create index if not exists call_invitations_call_idx
  on public.call_invitations (call_session_id);
-- Drives "my pending invitations" (spec §21's accept/decline flow).
create index if not exists call_invitations_invitee_idx
  on public.call_invitations (invitee_profile_id, status);

-- -----------------------------------------------------------------------------
-- call_events — append-only audit trail (spec §33.9). Never media contents,
-- never tokens/secrets (spec §15) — metadata is small structured context only
-- (e.g. {"reason": "timeout"} on a call_missed event).
-- -----------------------------------------------------------------------------
create table if not exists public.call_events (
  id              uuid primary key default gen_random_uuid(),
  call_session_id uuid not null references public.call_sessions (id) on delete cascade,
  actor_profile_id uuid references public.profiles (id) on delete set null,
  event_type      public.call_event_type not null,
  event_metadata  jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists call_events_call_idx
  on public.call_events (call_session_id, created_at);

-- -----------------------------------------------------------------------------
-- call_messages — in-call chat persistence (spec §16, §33.2). LiveKit's own
-- realtime data channel is the actual delivery path; this table is history.
-- No retention/expiry column by design — see this file's header comment.
-- -----------------------------------------------------------------------------
create table if not exists public.call_messages (
  id               uuid primary key default gen_random_uuid(),
  call_session_id  uuid not null references public.call_sessions (id) on delete cascade,
  sender_profile_id uuid references public.profiles (id) on delete set null,
  message          text not null,
  created_at       timestamptz not null default now(),
  edited_at        timestamptz,
  deleted_at       timestamptz
);

create index if not exists call_messages_call_idx
  on public.call_messages (call_session_id, created_at);

comment on table public.call_sessions is
  'One row per video/audio call, from ringing to ended. Not a fixed caller+callee pair — see call_participants for who is actually in it. See backend/app/routers/calls.py.';
comment on table public.call_participants is
  'Who is/was in a call and their per-participant lifecycle state. One row per (call_session_id, profile_id).';
comment on table public.call_invitations is
  'A mid-call or initial invitation to join a call — distinct from call_participants because an invitation can be declined/expired without ever becoming a participant.';
comment on table public.call_events is
  'Append-only lifecycle audit trail for calls (spec Canada-compliance §33.9). Never holds media contents, LiveKit tokens or E2EE keys.';
comment on table public.call_messages is
  'In-call chat history. LiveKit realtime data is the live-delivery path (spec §16) — this table exists for persistence/history, with retention enforced at the application layer, not by a schema-level expiry.';

-- -----------------------------------------------------------------------------
-- Row Level Security — same shape and same guard as every migration since
-- 0016: skipped when this Postgres instance has no "authenticated" role (the
-- VPS target, where authorization is enforced by deps.py/permissions.py
-- instead — see app/permissions.py's can_call/can_invite_to_call, added in
-- Phase 3). Kept for the documented Supabase-Postgres rollback path.
-- -----------------------------------------------------------------------------
do $rls_0028$
begin
  if to_regrole('authenticated') is null then
    raise notice '0028_video_calls.sql: skipping Supabase RLS policies (no "authenticated" role on this Postgres instance).';
    return;
  end if;

  execute 'alter table public.call_sessions     enable row level security';
  execute 'alter table public.call_participants  enable row level security';
  execute 'alter table public.call_invitations   enable row level security';
  execute 'alter table public.call_events        enable row level security';
  execute 'alter table public.call_messages      enable row level security';

  execute 'drop policy if exists call_sessions_rw on public.call_sessions';
  execute $pol$
    create policy call_sessions_rw on public.call_sessions
      for all
      to authenticated
      using (public.is_superadmin() or tenant_id = public.current_tenant_id())
      with check (public.is_superadmin() or tenant_id = public.current_tenant_id())
  $pol$;

  -- The four child tables have no tenant_id of their own (they scope through
  -- call_session_id) — same join-through-parent shape used elsewhere in this
  -- schema for tables one level removed from a tenant-scoped parent.
  execute 'drop policy if exists call_participants_rw on public.call_participants';
  execute $pol$
    create policy call_participants_rw on public.call_participants
      for all
      to authenticated
      using (
        public.is_superadmin()
        or exists (
          select 1 from public.call_sessions s
          where s.id = call_participants.call_session_id
            and s.tenant_id = public.current_tenant_id()
        )
      )
      with check (
        public.is_superadmin()
        or exists (
          select 1 from public.call_sessions s
          where s.id = call_participants.call_session_id
            and s.tenant_id = public.current_tenant_id()
        )
      )
  $pol$;

  execute 'drop policy if exists call_invitations_rw on public.call_invitations';
  execute $pol$
    create policy call_invitations_rw on public.call_invitations
      for all
      to authenticated
      using (
        public.is_superadmin()
        or exists (
          select 1 from public.call_sessions s
          where s.id = call_invitations.call_session_id
            and s.tenant_id = public.current_tenant_id()
        )
      )
      with check (
        public.is_superadmin()
        or exists (
          select 1 from public.call_sessions s
          where s.id = call_invitations.call_session_id
            and s.tenant_id = public.current_tenant_id()
        )
      )
  $pol$;

  execute 'drop policy if exists call_events_rw on public.call_events';
  execute $pol$
    create policy call_events_rw on public.call_events
      for all
      to authenticated
      using (
        public.is_superadmin()
        or exists (
          select 1 from public.call_sessions s
          where s.id = call_events.call_session_id
            and s.tenant_id = public.current_tenant_id()
        )
      )
      with check (
        public.is_superadmin()
        or exists (
          select 1 from public.call_sessions s
          where s.id = call_events.call_session_id
            and s.tenant_id = public.current_tenant_id()
        )
      )
  $pol$;

  execute 'drop policy if exists call_messages_rw on public.call_messages';
  execute $pol$
    create policy call_messages_rw on public.call_messages
      for all
      to authenticated
      using (
        public.is_superadmin()
        or exists (
          select 1 from public.call_sessions s
          where s.id = call_messages.call_session_id
            and s.tenant_id = public.current_tenant_id()
        )
      )
      with check (
        public.is_superadmin()
        or exists (
          select 1 from public.call_sessions s
          where s.id = call_messages.call_session_id
            and s.tenant_id = public.current_tenant_id()
        )
      )
  $pol$;
end $rls_0028$;
