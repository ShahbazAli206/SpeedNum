-- =============================================================================
-- Backup device registration and revocation.
--
-- Deliberately independent of auth_refresh_tokens/JWT machinery: a desktop
-- backup client authenticates like any other client (its own JWT/refresh
-- token), but additionally carries a device_id it sends on every
-- /admin/backups/* and /admin/devices/* call. Revoking a device here takes
-- effect immediately and does not depend on that device's JWT expiring or
-- being individually tracked — the whole point of a *device*-level control
-- separate from a *session*-level one is that revocation must work even if
-- the device somehow still holds a valid, unexpired session token (a stolen
-- laptop is the exact scenario this defends against: the disk holds a valid
-- refresh token in OS keychain, but the device itself can be cut off).
-- =============================================================================

create table if not exists public.backup_devices (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  platform         text,
  app_version      text,
  registered_by    uuid references public.profiles (id) on delete set null,
  status           text not null default 'active' check (status in ('active', 'revoked')),
  last_seen_at     timestamptz,
  revoked_at       timestamptz,
  revoked_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists backup_devices_status_idx on public.backup_devices (status);

-- Retention needs to know which snapshots a still-active device has fully
-- verified locally before pruning one, so "the server deleted its copy"
-- never means "every copy of this data is now gone" (see BACKUP_OPERATIONS.md).
create table if not exists public.backup_snapshot_devices (
  snapshot_id      uuid not null references public.backup_snapshots (id) on delete cascade,
  device_id        uuid not null references public.backup_devices (id) on delete cascade,
  downloaded_at    timestamptz not null default now(),
  primary key (snapshot_id, device_id)
);

alter table public.backup_audit_log
  add column if not exists device_id uuid references public.backup_devices (id) on delete set null;

comment on table public.backup_devices is
  'Registered desktop backup clients. Revoking a device blocks it immediately on its next call, independent of its JWT/refresh-token state.';
comment on table public.backup_snapshot_devices is
  'Which still-registered devices have confirmed a full, verified local copy of which snapshot — retention only prunes a snapshot once at least one active device has one.';
