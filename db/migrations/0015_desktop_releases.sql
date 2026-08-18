-- =============================================================================
-- Desktop app release metadata — backs the public GET /desktop/latest endpoint
-- (the web dashboard's "Download App" button and the installed app's deep-link
-- update-check both read from this) and the superadmin release-management
-- list. Not electron-updater's own feed (deploy/Caddyfile.example's
-- /desktop-releases/* -> MinIO still serves the actual installer bytes and
-- electron-updater's latest.yml unchanged) -- this table is a second, small,
-- purpose-built source of truth for the *website's* release awareness, kept
-- in sync with each publish by the same operator step that uploads the
-- installer (see DESKTOP.md's release procedure).
--
-- "Current" release = the most recent row by released_at. No separate
-- boolean flag to keep in sync -- one row per publish, ordered by time, is
-- the simplest thing that can't drift.
-- =============================================================================

create table if not exists public.desktop_releases (
  id             uuid primary key default gen_random_uuid(),
  version        text not null,
  platform       text not null default 'windows-x64',
  installer_url  text not null,
  sha256         text not null,
  release_notes  text,
  released_at    timestamptz not null default now(),
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists desktop_releases_released_at_idx
  on public.desktop_releases (released_at desc);

comment on table public.desktop_releases is
  'One row per published desktop installer version. GET /desktop/latest (public, no auth) returns the most recent row. Published only via POST /admin/desktop-releases (superadmin), which validates the version is a real semver newer than the current latest, the installer_url is under the real desktop-releases host, and sha256 is a well-formed 64-hex-char digest -- see routers/desktop_releases.py.';
comment on column public.desktop_releases.sha256 is
  'Lowercase 64-hex-char SHA-256 of the installer .exe, computed at publish time -- separate from electron-builder''s own sha512 in latest.yml, which this table does not read from (deliberately: the website''s release awareness should not depend on parsing electron-builder''s YAML format).';
