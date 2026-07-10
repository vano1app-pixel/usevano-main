-- Anti-manipulation for ratings. The anonymous-customer model has no secret
-- separating the customer from the assigned helper (both hold the booking
-- UUID), so a helper who knew their own completed booking ids could POST a
-- 5-star rate-household-booking for each, preempting the customer's honest
-- rating (bounded to one per booking by the unique constraint, but real —
-- ratings drive dispatch ordering + the public profile).
--
-- Fix: a per-booking rating_token minted at completion (capture-household-
-- payment). rate-household-booking requires it when present. The token is
-- delivered to the CUSTOMER via the tracking page (the anon RPC returns it)
-- and WITHHELD from the assigned helper — same model as arrival_code: the RPC
-- nulls it for the helper, and the helper's app never selects it.
alter table public.household_bookings add column if not exists rating_token text;

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
      end
    )
  ).*
  from public.household_bookings h
  where h.id = p_booking_id
  limit 1;
$$;

revoke all on function public.get_household_booking(uuid) from public;
grant execute on function public.get_household_booking(uuid) to anon, authenticated;
