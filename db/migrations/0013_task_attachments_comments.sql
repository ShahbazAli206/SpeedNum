-- =============================================================================
-- Task attachments and comments — closes a gap flagged in DESKTOP.md/PROGRESS.md
-- audits: tasks had no way to attach files or discuss progress.
--
-- Attachments reuse the existing `documents` table (task_id is a new,
-- nullable column alongside the existing client_id/letter_id) rather than a
-- separate task_attachments table — the whole upload/presign/download/delete
-- pipeline (services/storage.py, routers/client_documents.py's pattern) is
-- already tenant-isolated and battle-tested; a task attachment is just
-- another document with a different parent.
-- =============================================================================

alter table public.documents
  add column if not exists task_id uuid references public.tasks (id) on delete cascade;

create index if not exists documents_task_idx on public.documents (task_id);

comment on column public.documents.task_id is
  'Set when this document is a task attachment rather than a general client file or a signed letter. Mutually informative with client_id, not exclusive — a task attachment for a client-linked task still gets is_client_visible respected the same way client_documents.py already does.';

-- One row per comment. `is_client_visible` mirrors documents.is_client_visible's
-- reasoning: staff can write internal-only notes, and a client-portal author's
-- own comment is always visible to that same client (there's nothing to hide
-- from themselves).
create table if not exists public.task_comments (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  task_id            uuid not null references public.tasks (id) on delete cascade,
  author_id          uuid references public.profiles (id) on delete set null,
  body               text not null,
  is_client_visible  boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists task_comments_task_idx on public.task_comments (task_id);
create index if not exists task_comments_tenant_idx on public.task_comments (tenant_id);

create trigger task_comments_set_updated_at before update on public.task_comments
  for each row execute function public.set_updated_at();

comment on table public.task_comments is
  'Discussion/activity thread on a task. is_client_visible gates whether a client-portal user (once task visibility for portals exists) would ever see it — staff-authored comments default to internal-only.';
