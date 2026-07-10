-- The anonymous tracking RPC get_household_booking did `select *`, returning
-- the 4-digit arrival_code to anyone presenting the booking UUID — INCLUDING
-- the assigned helper, whose job screen (/student-job/:bookingId) is keyed on
-- that same UUID. So a helper could open /track/<id> (or call the anon RPC),
-- read the code off the customer's "read this to your helper" card, and type
-- it into StudentJobDetail to flip the job in_progress WITHOUT ever meeting the
-- customer — defeating the in-person handshake and skipping the customer+admin
-- alert that start_without_code fires.
--
-- Fix: null out arrival_code in the RPC output when the caller IS the assigned
-- helper (auth.uid() = student_id). The anonymous customer (auth.uid() NULL)
-- still receives it, so their tracking page is unchanged. Return type stays
-- `setof household_bookings`, so no frontend change is needed.
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
          then to_jsonb(h) - 'arrival_code'
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
