-- =============================================================================
-- Social login (OAuth 2.0 / OIDC), self-hosted end to end: a provider only
-- ever verifies the user's identity — the session, the profile, and every
-- byte of business data stay on this database. See services/oauth_google.py
-- and services/local_auth.py's start_oauth/complete_oauth.
-- =============================================================================

-- One row per (provider, provider account) actually linked to a profile.
-- Deliberately separate from `profiles`/`auth_credentials`: a profile can
-- have a password, one or more linked providers, or both — this table is
-- additive, never a replacement for local auth.
create table if not exists public.oauth_identities (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid not null references public.profiles (id) on delete cascade,
  provider           text not null,
  -- The provider's stable subject identifier ("sub" claim) — never the
  -- email, which a provider account can change.
  provider_user_id   text not null,
  -- The email claim at link time, kept for support/audit only; never used
  -- to look up or authorize an account after linking.
  email              text,
  created_at         timestamptz not null default now(),
  unique (provider, provider_user_id)
);

create index if not exists oauth_identities_profile_idx on public.oauth_identities (profile_id);

-- Short-lived, single-use state for one in-flight authorization-code+PKCE
-- round trip. A row is deleted the moment it's consumed (or once expired) —
-- this is deliberately not an audit log.
create table if not exists public.oauth_login_states (
  state          text primary key,
  provider       text not null,
  code_verifier  text not null,
  nonce          text not null,
  -- Same-origin-relative path to send the browser to after a successful
  -- login, validated server-side before ever being stored (see
  -- local_auth.start_oauth) — never trust it back out unchecked.
  next_path      text,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null
);

create index if not exists oauth_login_states_expires_idx on public.oauth_login_states (expires_at);

comment on table public.oauth_identities is
  'Links a profile to a provider account (Google, etc.) by stable subject ID. Additive to local password auth, never a replacement.';
comment on table public.oauth_login_states is
  'Single-use PKCE/state/nonce for one in-flight OAuth authorization-code round trip. Rows are deleted on use or expiry, not retained as a log.';
