-- =============================================================================
-- SpidNums — engagement letter rich terms + firm-side signature
-- Target: Supabase Postgres (>= 15)
-- Run order: 0001_schema.sql -> 0002_rls.sql -> 0003_functions.sql ->
--            0004_client_books.sql -> 0005_client_portal_invite.sql ->
--            0006_engagement_letter_signing.sql
--
-- The letter already had a client-side signature (signer_name/signature_data/
-- signed_at, set by the public /portal/{token}/sign flow). This adds a
-- *separate* firm-side signature (the accountant signs their own copy in the
-- admin app before/while sending) and a dedicated rich-HTML terms field, kept
-- apart from the plain-text `body` intro paragraph.
-- =============================================================================

alter table public.engagement_letters
  add column if not exists terms_html text;

comment on column public.engagement_letters.terms_html is
  'Rich HTML terms & conditions produced by the admin Terms editor — separate from the plain-text `body` intro paragraph.';

alter table public.engagement_letters
  add column if not exists firm_signer_name text;

alter table public.engagement_letters
  add column if not exists firm_signer_title text;

alter table public.engagement_letters
  add column if not exists firm_signature_data text;

alter table public.engagement_letters
  add column if not exists firm_signed_at timestamptz;

comment on column public.engagement_letters.firm_signature_data is
  'PNG data URL of the firm''s own signature (typed, drawn, or uploaded), applied via POST /engagements/{id}/sign. Distinct from the client''s signature_data.';
