-- Partner commission: FIRST-YEAR window (owner call, 2026-07-23).
-- ---------------------------------------------------------------------------
-- The deal is "3% of every job your student completes IN THEIR FIRST YEAR" —
-- but both accrual triggers paid forever (the original design said "lifetime
-- attribution"). This caps accrual at 12 months from the attribution row's
-- created_at (stamped the moment the student signs up with the code), for the
-- direct-pay trigger AND the legacy payout trigger alike.
--
-- The attribution itself stays lifetime (the signup remains credited to the
-- partner; the funnel's "Joined" count is untouched) — only the money window
-- closes. Jobs completed after the window simply accrue nothing. All partner-
-- facing copy (Partners page, /refer, the card, the digest email) says "first
-- year" as of the same change.
--
-- Both functions keep the existing contracts: exception-safe (accrual can
-- NEVER block a payout or a completion flip), dedup on booking_id, and
-- CREATE OR REPLACE preserves the 2026-07-20 EXECUTE revokes.

-- ── Legacy payout-row trigger (in-flight escrow bookings) ──────────────────
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

    -- First-year window: commission only accrues on jobs completed within
    -- 12 months of the helper signing up with the code.
    if v_attr.created_at < now() - interval '12 months' then return NEW; end if;

    select * into v_code from referral_codes where id = v_attr.code_id;
    if not found or not v_code.active then return NEW; end if;

    select coalesce(price_estimate_cents, 0) into v_job
      from household_bookings where id = NEW.booking_id;
    if v_job is null or v_job <= 0 then return NEW; end if;

    v_amt := floor(v_job * v_code.commission_bps / 10000.0);
    if v_amt <= 0 then return NEW; end if;

    insert into referral_commissions (code_id, helper_id, booking_id, payout_id, job_cents, amount_cents)
      values (v_code.id, v_helper_id, NEW.booking_id, NEW.id, v_job, v_amt)
      on conflict (booking_id) where booking_id is not null do nothing;
  exception when others then
    -- A commission accrual problem must NEVER block a helper's payout.
    raise warning 'accrue_referral_commission failed: %', sqlerrm;
  end;
  return NEW;
end;
$$;

-- ── Direct-pay trigger (all new bookings) ──────────────────────────────────
create or replace function public.accrue_referral_commission_direct_pay()
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
    -- Legacy escrow bookings accrue via their payout row — skip them here.
    if coalesce(NEW.booking_data->>'direct_pay', '') <> 'true' then return NEW; end if;
    if NEW.student_id is null then return NEW; end if;

    select id into v_helper_id from household_helpers where user_id = NEW.student_id limit 1;
    if v_helper_id is null then return NEW; end if;

    select * into v_attr from referral_attributions where helper_id = v_helper_id;
    if not found then return NEW; end if;

    -- First-year window: commission only accrues on jobs completed within
    -- 12 months of the helper signing up with the code.
    if v_attr.created_at < now() - interval '12 months' then return NEW; end if;

    select * into v_code from referral_codes where id = v_attr.code_id;
    if not found or not v_code.active then return NEW; end if;

    v_job := coalesce(NEW.price_estimate_cents, 0);
    if v_job <= 0 then return NEW; end if;

    v_amt := floor(v_job * v_code.commission_bps / 10000.0);
    if v_amt <= 0 then return NEW; end if;

    insert into referral_commissions (code_id, helper_id, booking_id, job_cents, amount_cents)
      values (v_code.id, v_helper_id, NEW.id, v_job, v_amt)
      on conflict (booking_id) where booking_id is not null do nothing;
  exception when others then
    -- Accrual must NEVER block a booking's completion flip.
    raise warning 'accrue_referral_commission_direct_pay failed: %', sqlerrm;
  end;
  return NEW;
end;
$$;
