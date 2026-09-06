-- Buy orders + helper claim (2026-09-06, owner brief: "demand posts a job,
-- supply claims it, no dispatcher"). Everything here is additive and
-- idempotent — apply by hand in the SQL editor BEFORE the merge that needs it.
--
-- 1. Helpers get a last-known position so open orders can be sorted by
--    distance (they had only a city string). Written by find-open-orders when
--    the Find screen sends the phone's location; never in the background.
-- 2. Bookings get search tags + an area label so a helper can search
--    "cleaning tonight" / "dog walk salthill", plus an optional customer
--    photo of the job.
-- 3. delete-helper-account could never actually delete the auth user of a
--    helper who had taken a job: household_bookings.student_id and
--    household_payouts.student_id referenced auth.users with NO ACTION, so the
--    delete failed quietly. Apple 5.1.1(v) expects the account to go. The
--    ledger keeps its rows; the helper link becomes NULL.
-- 4. The offers upsert (dispatch-household-job, onConflict booking_id,helper_id)
--    depends on a unique index that only ever existed on the live DB
--    (uq_job_offer_booking_helper). Same name here so live is a no-op and a
--    fresh database gets it too.

alter table public.household_helpers
  add column if not exists last_lat numeric(9, 6),
  add column if not exists last_lng numeric(9, 6),
  add column if not exists location_updated_at timestamptz;

alter table public.household_bookings
  add column if not exists search_tags text[],
  add column if not exists area_label text,
  add column if not exists customer_photo_url text;

create index if not exists household_bookings_search_tags_idx
  on public.household_bookings using gin (search_tags);

-- Open-board query shape: pending + unassigned, newest first.
create index if not exists household_bookings_open_idx
  on public.household_bookings (created_at desc)
  where status = 'pending' and student_id is null;

create unique index if not exists uq_job_offer_booking_helper
  on public.household_job_offers (booking_id, helper_id);

-- FK: helper's auth user may be deleted; bookings/payouts keep their rows.
do $$
declare
  c record;
begin
  for c in
    select con.conname, rel.relname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace n on n.oid = rel.relnamespace
      join pg_attribute a on a.attrelid = rel.oid and a.attnum = any (con.conkey)
     where n.nspname = 'public'
       and rel.relname in ('household_bookings', 'household_payouts')
       and con.contype = 'f'
       and a.attname = 'student_id'
       and con.confdeltype <> 'n'   -- not already SET NULL
  loop
    execute format('alter table public.%I drop constraint %I', c.relname, c.conname);
    execute format(
      'alter table public.%I add constraint %I foreign key (student_id) references auth.users(id) on delete set null',
      c.relname, c.conname
    );
  end loop;
end $$;

-- household_payouts.student_id was NOT NULL — SET NULL needs it nullable.
alter table public.household_payouts alter column student_id drop not null;

-- The customer's read RPC also returns the new photo column. Same body as
-- 20260729000005 (secrets spliced in for the anonymous customer only); the
-- return type is the table row, so the new column rides along automatically —
-- re-created here so the function's cached row type picks up the column.
create or replace function public.get_household_booking(p_booking_id uuid)
returns setof public.household_bookings
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (
    jsonb_populate_record(
      null::public.household_bookings,
      case
        when auth.uid() is not null and auth.uid() = h.student_id
          then to_jsonb(h) - 'arrival_code' - 'rating_token'
        else to_jsonb(h)
             || coalesce(
                  (select jsonb_build_object('arrival_code', s.arrival_code, 'rating_token', s.rating_token)
                     from public.household_booking_secrets s
                    where s.booking_id = h.id),
                  '{}'::jsonb)
      end
    )
  ).*
  from public.household_bookings h
  where h.id = p_booking_id
  limit 1;
$$;
revoke all on function public.get_household_booking(uuid) from public;
grant execute on function public.get_household_booking(uuid) to anon, authenticated;
