-- Security hardening (2026-07-29) — move arrival_code + rating_token OFF the
-- household_bookings row so the assigned helper can never read them.
--
-- FINDING: both secrets lived as columns on household_bookings. The RPC
-- get_household_booking nulled them for the assigned helper, but the columns
-- were still on the row, so a malicious assigned helper could read them two
-- ways the RPC can't guard:
--   1. a raw PostgREST select  ...household_bookings?select=arrival_code,rating_token
--   2. the realtime UPDATE payload StudentJobDetail subscribes to (Realtime
--      enforces row RLS but NOT column privileges, so the code rode the wire).
-- With arrival_code a helper marks a job in_progress without arriving; with
-- rating_token they post a fake 5★ self-rating.
--
-- FIX: the real values now live ONLY in household_booking_secrets (RLS on, no
-- anon/authenticated policies → service-role + SECURITY DEFINER only). The base
-- columns are kept (so the RPC return type and every frontend type are
-- unchanged) but are always NULL, so a direct select or a realtime payload
-- carries nothing. get_household_booking splices the secrets back in for the
-- anonymous CUSTOMER only. The edge functions (household-arrival,
-- capture-household-payment, rate-household-booking) read/write the secrets
-- table instead of the base columns.

create table if not exists public.household_booking_secrets (
  booking_id   uuid primary key references public.household_bookings(id) on delete cascade,
  arrival_code text,
  rating_token text,
  updated_at   timestamptz not null default now()
);

alter table public.household_booking_secrets enable row level security;
-- No policies for anon/authenticated → only the service role and SECURITY
-- DEFINER functions can touch it. Belt-and-braces revoke of the default grants.
revoke all on public.household_booking_secrets from anon, authenticated;

-- Move any existing values off the base row, then blank the base columns so the
-- old plaintext stops riding PostgREST/realtime for in-flight bookings.
insert into public.household_booking_secrets (booking_id, arrival_code, rating_token)
select id, arrival_code, rating_token
  from public.household_bookings
 where arrival_code is not null or rating_token is not null
on conflict (booking_id) do update
  set arrival_code = coalesce(excluded.arrival_code, public.household_booking_secrets.arrival_code),
      rating_token = coalesce(excluded.rating_token, public.household_booking_secrets.rating_token);

update public.household_bookings
   set arrival_code = null, rating_token = null
 where arrival_code is not null or rating_token is not null;

-- The customer read path: return the base row, and for anyone who is NOT the
-- assigned helper (i.e. the anonymous customer on /track) splice the real
-- secrets in from the service-role-only table. The helper branch keeps the
-- explicit strip as defence-in-depth. coalesce('{}') means a missing secret
-- degrades to null rather than breaking tracking.
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
