-- =============================================================================
-- SpeedNum — fix engagement letter tax rate storage and totals math
-- Target: Supabase Postgres (>= 15) / plain Postgres 16 (VPS)
-- Run order: ... -> 0020_plan_change_requests.sql -> 0021_fix_engagement_tax_rate.sql
--
-- `tax_rate` has always been a plain percentage everywhere it's read (the
-- frontend's "Tax rate (%)" field sends e.g. 13 for 13%, and every letter
-- view/PDF/DOCX renders it back as "{tax_rate}%"). Two bugs followed from
-- that mismatch:
--   1. 0001_schema.sql defined the column as numeric(5,4) — only 1 digit
--      before the decimal point (max 9.9999) — so any rate of 10% or more
--      (the UI's own default is 13%) overflowed on insert with a raw
--      asyncpg NumericValueOutOfRangeError, surfacing to users as a
--      generic "Could not reach the API" (the crash response has no CORS
--      headers, so the browser's fetch() sees a network failure rather
--      than the real 500).
--   2. Both the Python total calculator (app/routers/engagements.py::_totals)
--      and the 0003_functions.sql recalc_letter_totals() trigger computed
--      tax as `subtotal * tax_rate` with no /100, so any rate under 10 that
--      *did* fit the old column (e.g. 5% GST) was still charged at 500% of
--      subtotal instead of 5%.
-- This widens the column to fit real percentages and fixes the trigger's
-- math to match; app/routers/engagements.py and app/models.py are fixed in
-- the same change. Existing rows are recomputed so any letter created
-- before this fix (only tax_rate < 10 could have been saved at all) ends
-- up with the tax_amount/total it should have had all along.
-- =============================================================================

alter table public.engagement_letters
  alter column tax_rate type numeric(6, 2);

create or replace function public.recalc_letter_totals()
returns trigger
language plpgsql
as $$
declare
  v_letter uuid := coalesce(new.letter_id, old.letter_id);
begin
  update public.engagement_letters l
     set subtotal   = t.subtotal,
         tax_amount = round(t.subtotal * l.tax_rate / 100, 2),
         total      = t.subtotal + round(t.subtotal * l.tax_rate / 100, 2)
    from (
      select coalesce(sum(amount), 0) as subtotal
        from public.engagement_letter_items
       where letter_id = v_letter
    ) t
   where l.id = v_letter;

  return null;
end;
$$;

update public.engagement_letters
   set tax_amount = round(subtotal * tax_rate / 100, 2),
       total      = subtotal + round(subtotal * tax_rate / 100, 2)
 where tax_rate <> 0;
