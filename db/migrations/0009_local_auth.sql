-- =============================================================================
-- Self-hosted authentication — replaces Supabase Auth as the identity
-- provider. Portable: no Supabase-specific SQL, runs on any Postgres 16+.
--
-- One table per concern rather than piling columns onto `profiles`:
-- `profiles` stays business data (what the rest of the app already queries
-- constantly); credentials/sessions/tokens are security-sensitive and
-- change on a completely different cadence, so keeping them separate means
-- an ordinary `select * from profiles` never touches a password hash.
-- =============================================================================

-- One row per profile with a password. A profile with no row here cannot
-- log in with a password at all (relevant for a portal account created by
-- staff before it has ever set one — see services/local_auth.py's
-- provisioning flow).
create table if not exists public.auth_credentials (
  profile_id        uuid primary key references public.profiles (id) on delete cascade,
  password_hash     text not null,
  email_verified    boolean not null default false,
  failed_logins     integer not null default 0,
  locked_until      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger auth_credentials_set_updated_at before update on public.auth_credentials
  for each row execute function public.set_updated_at();

-- Refresh tokens, hashed — never store the raw token server-side, the same
-- reasoning as a password. `replaced_by` links a rotation chain: presenting
-- an already-rotated token again (replaced_by is not null, or revoked_at is
-- set) is a reuse signal, handled by revoking the whole chain in
-- services/local_auth.py rather than just rejecting the one request.
create table if not exists public.auth_refresh_tokens (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  token_hash    text not null unique,
  user_agent    text,
  ip_address    text,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  replaced_by   uuid references public.auth_refresh_tokens (id) on delete set null
);

create index if not exists auth_refresh_tokens_profile_idx on public.auth_refresh_tokens (profile_id);
create index if not exists auth_refresh_tokens_expires_idx on public.auth_refresh_tokens (expires_at);

-- Single-use, short-lived, hashed tokens for email verification and the
-- one-click "magic link" sign-in email (the same primitive serves both —
-- they differ only in what consuming the token does).
create table if not exists public.auth_email_tokens (
  token_hash    text primary key,
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  purpose       text not null check (purpose in ('verify_email', 'magic_link')),
  expires_at    timestamptz not null,
  used_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists auth_email_tokens_profile_idx on public.auth_email_tokens (profile_id);

-- Password reset tokens, separate table rather than folded into
-- auth_email_tokens: a reset token authorizes changing the credential
-- itself (higher-stakes than proving email ownership), worth keeping the
-- two unambiguous even though the shape is similar.
create table if not exists public.auth_password_reset_tokens (
  token_hash    text primary key,
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  expires_at    timestamptz not null,
  used_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists auth_password_reset_tokens_profile_idx on public.auth_password_reset_tokens (profile_id);

comment on table public.auth_credentials is
  'Password hash (Argon2id) and account-lockout state, one row per profile that can log in with a password.';
comment on table public.auth_refresh_tokens is
  'Hashed refresh tokens with rotation tracking (replaced_by). Presenting a token that has already been replaced or revoked is a reuse signal.';
comment on table public.auth_email_tokens is
  'Single-use hashed tokens for email verification and magic-link sign-in.';
comment on table public.auth_password_reset_tokens is
  'Single-use hashed tokens authorizing a password change via the forgot-password flow.';
