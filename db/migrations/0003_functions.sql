-- =============================================================================
-- Signup bootstrap + default catalogue
--
-- Signup happens entirely in Supabase Auth from the browser. This trigger turns
-- a new auth.users row into a usable tenant: profile, firm, seeded services and
-- a welcome notification — no backend round-trip required.
--
-- Expected user metadata at signup:
--   { "full_name": "Dana Fraser", "firm_name": "Fraser & Co.", "invite_token": "..." }
-- =============================================================================

-- -----------------------------------------------------------------------------
-- slugify: "Fraser & Co." -> "fraser-co"
-- -----------------------------------------------------------------------------
create or replace function public.slugify(txt text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(both '-' from regexp_replace(lower(coalesce(txt, '')), '[^a-z0-9]+', '-', 'g')),
    ''
  );
$$;

create or replace function public.unique_tenant_slug(base text)
returns text
language plpgsql
as $$
declare
  candidate text := coalesce(public.slugify(base), 'firm');
  suffix    integer := 1;
begin
  while exists (select 1 from public.tenants where slug = candidate) loop
    suffix := suffix + 1;
    candidate := coalesce(public.slugify(base), 'firm') || '-' || suffix;
  end loop;
  return candidate;
end;
$$;

-- -----------------------------------------------------------------------------
-- Canadian practice service catalogue, seeded per tenant.
--
-- due_rule grammar
--   type:         offset_from_period_end | fixed_date
--   months/days:  offset applied to period_end
--   month/day:    fixed calendar date (day = -1 means "last day of month")
--   year_offset:  years added to period_end's year for fixed_date (default 1)
--   period_basis: fiscal (follow the client's year end) | calendar
-- -----------------------------------------------------------------------------
create or replace function public.seed_default_services(p_tenant uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.services (tenant_id, code, name, description, category, frequency, default_price, due_rule, lead_time_days)
  values
    (p_tenant, 'T2',       'T2 Corporate Tax Return',           'Federal and provincial corporate income tax return.',              'Tax',         'annual',    2500, '{"type":"offset_from_period_end","months":6,"period_basis":"fiscal"}',   60),
    (p_tenant, 'T2-BAL',   'Corporate Tax Balance Due',         'Balance of corporate tax owing (CCPC small business rate).',        'Tax',         'annual',       0, '{"type":"offset_from_period_end","months":3,"period_basis":"fiscal"}',   30),
    (p_tenant, 'YE-FS',    'Year-End Financial Statements',     'Compiled year-end financial statements and working papers.',        'Accounting',  'annual',    1800, '{"type":"offset_from_period_end","months":6,"period_basis":"fiscal"}',   60),
    (p_tenant, 'NTR',      'Notice to Reader Engagement',       'Compilation engagement per CSRS 4200.',                              'Assurance',   'annual',    1500, '{"type":"offset_from_period_end","months":6,"period_basis":"fiscal"}',   60),
    (p_tenant, 'REVIEW',   'Review Engagement',                 'Review engagement report per CSRE 2400.',                            'Assurance',   'annual',    4500, '{"type":"offset_from_period_end","months":6,"period_basis":"fiscal"}',   90),
    (p_tenant, 'GST-A',    'GST/HST Return (Annual)',           'Annual GST/HST filing and remittance.',                              'Tax',         'annual',     600, '{"type":"offset_from_period_end","months":3,"period_basis":"fiscal"}',   30),
    (p_tenant, 'GST-Q',    'GST/HST Return (Quarterly)',        'Quarterly GST/HST filing and remittance.',                           'Tax',         'quarterly',  250, '{"type":"offset_from_period_end","months":1,"period_basis":"fiscal"}',   15),
    (p_tenant, 'GST-M',    'GST/HST Return (Monthly)',          'Monthly GST/HST filing and remittance.',                             'Tax',         'monthly',    150, '{"type":"offset_from_period_end","months":1,"period_basis":"calendar"}', 10),
    (p_tenant, 'T4',       'T4 Slips & Summary',                'Employment income slips and summary for the calendar year.',        'Payroll',     'annual',     400, '{"type":"fixed_date","month":2,"day":-1,"period_basis":"calendar"}',     30),
    (p_tenant, 'T5',       'T5 Slips & Summary',                'Investment income slips and summary.',                               'Payroll',     'annual',     300, '{"type":"fixed_date","month":2,"day":-1,"period_basis":"calendar"}',     30),
    (p_tenant, 'T5018',    'T5018 Contractor Slips',            'Construction subcontractor payment reporting.',                      'Compliance',  'annual',     350, '{"type":"offset_from_period_end","months":6,"period_basis":"fiscal"}',   30),
    (p_tenant, 'T1',       'T1 Personal Tax Return',            'Personal income tax and benefit return.',                            'Tax',         'annual',     250, '{"type":"fixed_date","month":4,"day":30,"period_basis":"calendar"}',     45),
    (p_tenant, 'T1-SE',    'T1 Personal Return (Self-Employed)','Personal return with business or professional income.',              'Tax',         'annual',     450, '{"type":"fixed_date","month":6,"day":15,"period_basis":"calendar"}',     45),
    (p_tenant, 'T3',       'T3 Trust Return',                   'Trust income tax and information return.',                           'Tax',         'annual',     900, '{"type":"offset_from_period_end","days":90,"period_basis":"fiscal"}',    45),
    (p_tenant, 'PAYROLL',  'Payroll Processing & Remittance',   'Payroll runs plus source deduction remittance.',                     'Payroll',     'monthly',    200, '{"type":"offset_from_period_end","days":15,"period_basis":"calendar"}',   5),
    (p_tenant, 'BOOK-M',   'Monthly Bookkeeping',               'Transaction coding, reconciliations and monthly reporting.',         'Bookkeeping', 'monthly',    350, '{"type":"offset_from_period_end","days":21,"period_basis":"calendar"}',   7),
    (p_tenant, 'BOOK-Q',   'Quarterly Bookkeeping',             'Quarterly catch-up bookkeeping and reconciliations.',                'Bookkeeping', 'quarterly',  800, '{"type":"offset_from_period_end","months":1,"period_basis":"fiscal"}',   14),
    (p_tenant, 'WSIB',     'WSIB / WCB Reconciliation',         'Annual workers compensation reconciliation.',                        'Compliance',  'annual',     300, '{"type":"fixed_date","month":3,"day":31,"period_basis":"calendar"}',     30),
    (p_tenant, 'ANNRET',   'Annual Corporate Registry Return',  'Corporate registry annual return and minute book update.',           'Compliance',  'annual',     150, '{"type":"offset_from_period_end","months":6,"period_basis":"fiscal"}',   30),
    (p_tenant, 'ADVISORY', 'Advisory / Fractional CFO',         'Monthly advisory, cash-flow planning and management reporting.',     'Advisory',    'monthly',   1000, '{"type":"offset_from_period_end","days":15,"period_basis":"calendar"}',   5)
  on conflict (tenant_id, code) do nothing;
end;
$$;

-- -----------------------------------------------------------------------------
-- New auth user -> profile (+ tenant when the signup carried a firm name)
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta        jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_firm_name   text  := nullif(trim(v_meta ->> 'firm_name'), '');
  v_full_name   text  := nullif(trim(v_meta ->> 'full_name'), '');
  v_invite      text  := nullif(trim(v_meta ->> 'invite_token'), '');
  v_tenant_id   uuid;
  v_role        user_role := 'member';
  v_invitation  public.invitations%rowtype;
begin
  -- 1. Joining an existing firm through an invitation link
  if v_invite is not null then
    select * into v_invitation
      from public.invitations
     where token = v_invite
       and accepted_at is null
       and expires_at > now()
     limit 1;

    if found then
      v_tenant_id := v_invitation.tenant_id;
      v_role      := v_invitation.role;
      update public.invitations set accepted_at = now() where id = v_invitation.id;
    end if;
  end if;

  -- 2. Otherwise, starting a new firm
  if v_tenant_id is null and v_firm_name is not null then
    insert into public.tenants (name, slug, email, email_from_name)
    values (v_firm_name, public.unique_tenant_slug(v_firm_name), new.email, v_firm_name)
    returning id into v_tenant_id;

    v_role := 'owner';
    perform public.seed_default_services(v_tenant_id);
  end if;

  insert into public.profiles (id, tenant_id, email, full_name, role)
  values (new.id, v_tenant_id, new.email, coalesce(v_full_name, split_part(new.email, '@', 1)), v_role)
  on conflict (id) do update
    set tenant_id = coalesce(public.profiles.tenant_id, excluded.tenant_id),
        full_name = coalesce(public.profiles.full_name, excluded.full_name);

  if v_tenant_id is not null then
    insert into public.notifications (tenant_id, profile_id, type, title, body, link)
    values (
      v_tenant_id,
      new.id,
      'welcome',
      'Welcome to your practice workspace',
      'Import your client list, assign services, and your compliance calendar builds itself.',
      '/clients'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Recalculate engagement letter totals whenever line items change
-- -----------------------------------------------------------------------------
create or replace function public.recalc_letter_totals()
returns trigger
language plpgsql
as $$
declare
  v_letter uuid := coalesce(new.letter_id, old.letter_id);
begin
  update public.engagement_letters l
     set subtotal   = t.subtotal,
         tax_amount = round(t.subtotal * l.tax_rate, 2),
         total      = t.subtotal + round(t.subtotal * l.tax_rate, 2)
    from (
      select coalesce(sum(amount), 0) as subtotal
        from public.engagement_letter_items
       where letter_id = v_letter
    ) t
   where l.id = v_letter;

  return null;
end;
$$;

drop trigger if exists letter_items_recalc on public.engagement_letter_items;
create trigger letter_items_recalc
  after insert or update or delete on public.engagement_letter_items
  for each row execute function public.recalc_letter_totals();

-- -----------------------------------------------------------------------------
-- Storage bucket for client documents / signed letters
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;
