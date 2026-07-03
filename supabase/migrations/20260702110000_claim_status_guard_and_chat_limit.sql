-- Review hardening (2026-07-02, part 2)
-- ---------------------------------------------------------------------------
-- 1. A claim must land in 'accepted'. The claim policy's WITH CHECK only
--    pinned student_id, so an approved helper could UPDATE a pending booking
--    straight to 'in_progress'/'completed' — skipping the whole pay-after-
--    accept step (notify-household-accepted never fires, remind-unpaid-bookings
--    only watches status='accepted'). Same gap existed in the hand-created
--    production policy this replaces.
-- 2. send_household_chat gets a per-booking rate limit (40 msgs / 10 min) via
--    the shared check_and_bump_rate_limit RPC — the booking id is a bearer
--    token, so an unthrottled anonymous write path invites spam.

drop policy if exists "Helpers can claim pending bookings" on public.household_bookings;
create policy "Helpers can claim pending bookings"
  on public.household_bookings for update to authenticated
  using (
    student_id is null
    and status = 'pending'
    and exists (
      select 1 from public.household_helpers h
      where h.user_id = auth.uid() and h.status = 'approved'
    )
  )
  with check (auth.uid() = student_id and status = 'accepted');

create or replace function public.send_household_chat(p_booking_id uuid, p_body text)
returns setof public.household_chat
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking public.household_bookings;
  v_body    text;
begin
  v_body := left(btrim(coalesce(p_body, '')), 1000);
  if v_body = '' then
    raise exception 'empty message';
  end if;

  if not public.check_and_bump_rate_limit('send-household-chat', p_booking_id::text, 40, 600) then
    raise exception 'rate limited';
  end if;

  select * into v_booking from public.household_bookings where id = p_booking_id;
  if not found then
    raise exception 'booking not found';
  end if;
  if v_booking.status in ('cancelled', 'completed') then
    raise exception 'booking closed';
  end if;
  if v_booking.student_id is null then
    raise exception 'no helper assigned yet';
  end if;

  -- Callers other than the assigned helper speak as the customer. The
  -- customer usually has no account, so their messages carry sender_id NULL
  -- (or their customer_id when the booking has one).
  if auth.uid() is not null and auth.uid() = v_booking.student_id then
    return query
      insert into public.household_chat (booking_id, sender_id, body)
      values (p_booking_id, auth.uid(), v_body)
      returning *;
  else
    return query
      insert into public.household_chat (booking_id, sender_id, body)
      values (p_booking_id, v_booking.customer_id, v_body)
      returning *;
  end if;
end;
$$;
