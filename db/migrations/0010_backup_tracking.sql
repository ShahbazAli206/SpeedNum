-- =============================================================================
-- Disaster-recovery backup tracking. Postgres is the trust root for backup
-- integrity: the actual snapshot bytes (pg_dump, storage tar, manifest) live
-- as objects in MinIO's private `backups` bucket, but the checksums recorded
-- here are what a downstream consumer (the desktop backup app) pins against
-- — an object-storage-level tamper without also compromising this database
-- is therefore not enough to pass verification.
--
-- `sequence` is the ordering/dedup key everywhere in this system, never
-- `created_at` — a desktop client comparing wall-clock timestamps across a
-- VPS and a Windows laptop cannot assume clocks agree; a monotonic integer
-- assigned by this table can.
-- =============================================================================

create table if not exists public.backup_snapshots (
  id                     uuid primary key default gen_random_uuid(),
  sequence               bigint generated always as identity,
  parent_snapshot_id     uuid references public.backup_snapshots (id),
  status                 text not null default 'pending'
                           check (status in ('pending', 'uploading', 'ready', 'failed')),
  snapshot_kind          text not null check (snapshot_kind in ('full', 'incremental')),
  schema_version         text,
  app_version            text,
  manifest_object_key    text,
  manifest_sha256        text,
  postgres_sha256        text,
  postgres_size_bytes    bigint,
  storage_sha256         text,
  storage_size_bytes     bigint,
  storage_index_sha256   text,
  config_sha256          text,
  tenants_count          integer,
  clients_count          integer,
  documents_count        integer,
  storage_objects_count  integer,
  storage_bytes_total    bigint,
  error_message          text,
  trigger_source         text not null check (trigger_source in ('scheduled', 'manual')),
  triggered_by           uuid references public.profiles (id) on delete set null,
  downloaded_at          timestamptz,
  last_drill_at          timestamptz,
  last_drill_ok          boolean,
  created_at             timestamptz not null default now(),
  completed_at           timestamptz
);

-- `sequence` is the sort/dedupe key (see header); unique + indexed so "give
-- me everything after sequence N" is a cheap range scan.
create unique index if not exists backup_snapshots_sequence_idx on public.backup_snapshots (sequence);
create index if not exists backup_snapshots_status_idx on public.backup_snapshots (status);
create index if not exists backup_snapshots_parent_idx on public.backup_snapshots (parent_snapshot_id);

-- Every backup/restore-adjacent action, for forensics — a compromised
-- superadmin session backing up (and therefore reading) every tenant's data
-- is the single biggest blast radius in this application, so this trail
-- records who touched what and from where. `snapshot_sequence` is
-- denormalized so the audit trail still reads sensibly after the snapshot
-- row itself is eventually pruned by retention.
create table if not exists public.backup_audit_log (
  id                 uuid primary key default gen_random_uuid(),
  snapshot_id        uuid references public.backup_snapshots (id) on delete set null,
  snapshot_sequence  bigint,
  actor_profile_id   uuid references public.profiles (id) on delete set null,
  action             text not null check (action in (
                       'trigger', 'list', 'download_url_issued', 'download_confirmed',
                       'restore_drill_run', 'restore_drill_result', 'prune'
                     )),
  detail             jsonb not null default '{}'::jsonb,
  ip_address         text,
  user_agent         text,
  created_at         timestamptz not null default now()
);

create index if not exists backup_audit_log_snapshot_idx on public.backup_audit_log (snapshot_id);
create index if not exists backup_audit_log_actor_idx on public.backup_audit_log (actor_profile_id);
create index if not exists backup_audit_log_created_idx on public.backup_audit_log (created_at);

comment on table public.backup_snapshots is
  'One row per disaster-recovery backup snapshot. Bytes live in MinIO''s backups bucket; this row is the trust root for their checksums and the authoritative ready/failed status.';
comment on table public.backup_audit_log is
  'Forensic trail for every backup/restore-adjacent action — who triggered, listed, downloaded, or drilled a snapshot, and from where.';
