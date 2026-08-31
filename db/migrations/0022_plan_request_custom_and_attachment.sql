-- =============================================================================
-- Plan-request: custom plans + an image attachment.
--
-- Two new nullable ints let an owner ask for a bespoke plan (requested_plan =
-- 'custom') with their own client/staff-seat counts, instead of only picking a
-- catalog tier — the superadmin still confirms the final caps at approval.
--
-- `attachment` holds an optional image the owner attached to explain the
-- request, stored inline as a base64 data URL (data:image/...), the same
-- no-storage-infra convention the firm logo uses (tenants.logo_url). A single
-- small screenshot, not the presigned-S3 documents pipeline.
-- =============================================================================

alter table public.plan_change_requests
  add column if not exists custom_clients integer,
  add column if not exists custom_seats   integer,
  add column if not exists attachment     text;

comment on column public.plan_change_requests.custom_clients is
  'Desired client cap when requested_plan = ''custom'' (null for a catalog-tier request). The superadmin prefills the approval from this but still confirms the final cap.';
comment on column public.plan_change_requests.custom_seats is
  'Desired staff-seat cap when requested_plan = ''custom'' (null otherwise). Same review flow as custom_clients.';
comment on column public.plan_change_requests.attachment is
  'Optional base64 image data URL (data:image/...) the owner attached to the request. Stored inline like tenants.logo_url, not via the documents/presign pipeline.';
