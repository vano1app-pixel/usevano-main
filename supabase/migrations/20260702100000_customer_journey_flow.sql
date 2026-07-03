-- Customer-journey flow fixes (2026-07-02)
-- ---------------------------------------------------------------------------
-- 1. Anonymous customers can send chat: quick-book customers have no account
--    (customer_id IS NULL), so the INSERT policy could never match them. A
--    SECURITY DEFINER RPC keyed on the booking id (the same bearer secret the
--    read RPCs use) lets the customer reply; sender_id NULL = "the customer".
-- 2. Approved helpers can SEE pending unclaimed jobs. The 20260702020000
--    lockdown dropped the public-read policy, which also removed the only
--    SELECT path the in-app "Available" tab and /student-job deep links used.
--    (Production already carries the matching claim/UPDATE policy — recreated
--    here so environments built from migrations agree.)
-- 3. get_household_booking stops leaking the arrival code to the assigned
--    helper: the 4-digit code is the customer's proof-of-presence secret and
--    must be heard at the door, not read via the API.
-- 4. Friend-referral programme v2: commission = 5% of what the referred friend
--    actually EARNS (household_payouts.amount_cents, their net payout), only
--    for the friend's first 12 months. Still funded from VANO's cut; the
--    helper's own pay is untouched, so the minimum-wage invariant holds.

-- ── 1. Anonymous customer chat ─────────────────────────────────────────────
alter table public.household_chat alter column sender_id drop not null;

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

revoke all on function public.send_household_chat(uuid, text) from public;
grant execute on function public.send_household_chat(uuid, text) to anon, authenticated;

-- ── 2. Helpers can browse + claim pending unclaimed jobs ───────────────────
drop policy if exists "Approved helpers can read pending bookings" on public.household_bookings;
create policy "Approved helpers can read pending bookings"
  on public.household_bookings for select to authenticated
  using (
    student_id is null
    and status = 'pending'
    and exists (
      select 1 from public.household_helpers h
      where h.user_id = auth.uid() and h.status = 'approved'
    )
  );

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
  with check (auth.uid() = student_id);

-- ── 3. Redact the arrival code from the assigned helper ────────────────────
create or replace function public.get_household_booking(p_booking_id uuid)
returns setof public.household_bookings
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  r public.household_bookings;
begin
  select * into r from public.household_bookings where id = p_booking_id limit 1;
  if not found then
    return;
  end if;
  if auth.uid() is not null and auth.uid() = r.student_id then
    r.arrival_code := null;
  end if;
  return next r;
end;
$$;

-- ── 4. Friend referral: 5% of the friend's earnings, first 12 months ───────
create or replace function public.accrue_referral_commission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_helper_id uuid;
  v_code      referral_codes%rowtype;
  v_attr      referral_attributions%rowtype;
  v_job       integer;
  v_amt       integer;
begin
  begin
    select id into v_helper_id from household_helpers where user_id = NEW.student_id limit 1;
    if v_helper_id is null then return NEW; end if;

    select * into v_attr from referral_attributions where helper_id = v_helper_id;
    if not found then return NEW; end if;

    -- "For their first year": commission only accrues on payouts inside the
    -- 12 months after the friend joined with the code.
    if v_attr.created_at < now() - interval '12 months' then return NEW; end if;

    select * into v_code from referral_codes where id = v_attr.code_id;
    if not found or not v_code.active then return NEW; end if;

    select coalesce(price_estimate_cents, 0) into v_job
      from household_bookings where id = NEW.booking_id;

    -- "5% of what your friend earns": the base is the friend's net payout
    -- (amount_cents), not the gross job price.
    v_amt := floor(coalesce(NEW.amount_cents, 0) * v_code.commission_bps / 10000.0);
    if v_amt <= 0 then return NEW; end if;

    insert into referral_commissions (code_id, helper_id, booking_id, payout_id, job_cents, amount_cents)
      values (v_code.id, v_helper_id, NEW.booking_id, NEW.id, coalesce(v_job, 0), v_amt)
      on conflict (payout_id) do nothing;
  exception when others then
    -- A commission accrual problem must NEVER block a helper's payout.
    raise warning 'accrue_referral_commission failed: %', sqlerrm;
  end;
  return NEW;
end;
$$;
