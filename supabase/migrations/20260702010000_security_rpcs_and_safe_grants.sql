-- ── Security hardening, part 1 of 2 (ADDITIVE — safe to apply immediately) ──
-- Applied to production 2026-07-02. Part 2 (20260702020000) drops the
-- bulk-read policies and MUST only be applied AFTER the frontend that uses
-- these RPCs is deployed, or the anonymous tracking page breaks.
--
-- Why: the anonymous customer flow is meant to work like "knowing the booking
-- id (an unguessable UUID) grants access to THAT booking". The old policy
-- `USING (customer_id IS NULL)` never enforced the id, so anyone with the
-- public anon key could read every anonymous booking's PII (name, address,
-- phone, email, GPS) in bulk. These SECURITY DEFINER functions restore the
-- intended model: you get exactly one booking, and only if you present its id.

create or replace function public.get_household_booking(p_booking_id uuid)
returns setof public.household_bookings
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select * from public.household_bookings where id = p_booking_id limit 1;
$$;

create or replace function public.get_household_chat(p_booking_id uuid)
returns setof public.household_chat
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select * from public.household_chat where booking_id = p_booking_id order by created_at;
$$;

-- Homepage activity ticker: non-PII only (category + area + time).
create or replace function public.recent_household_activity()
returns table (category text, city text, created_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select category, city, created_at
  from public.household_bookings
  where status in ('accepted','in_progress','completed')
    and created_at > (now() - interval '48 hours')
  order by created_at desc
  limit 12;
$$;

revoke all on function public.get_household_booking(uuid) from public;
revoke all on function public.get_household_chat(uuid) from public;
revoke all on function public.recent_household_activity() from public;
grant execute on function public.get_household_booking(uuid) to anon, authenticated;
grant execute on function public.get_household_chat(uuid) to anon, authenticated;
grant execute on function public.recent_household_activity() to anon, authenticated;

-- H1: stop an assigned helper editing price/payout fields. The client only
-- writes these five columns (claim: student_id+status; live location:
-- worker_lat/lng/updated_at). Column-scoped UPDATE grant blocks tampering with
-- price_estimate_cents, paid_at, customer_* etc. RLS row policies still apply.
revoke update on public.household_bookings from authenticated;
grant update (student_id, status, worker_lat, worker_lng, worker_location_updated_at)
  on public.household_bookings to authenticated;

-- M1: ratings may only be written by rate-household-booking (service role),
-- which verifies completion. Reads stay public (reviews are public content).
drop policy if exists "Anyone can insert a rating" on public.household_ratings;

-- Authenticated party-scoped chat read, so dropping the USING(true) policy in
-- part 2 doesn't lock helpers out of their own threads. Anonymous customers
-- read chat via get_household_chat().
drop policy if exists "Parties read own booking chat" on public.household_chat;
create policy "Parties read own booking chat"
  on public.household_chat for select to authenticated
  using (exists (
    select 1 from public.household_bookings b
    where b.id = household_chat.booking_id
      and (b.student_id = auth.uid() or b.customer_id = auth.uid())
  ));
