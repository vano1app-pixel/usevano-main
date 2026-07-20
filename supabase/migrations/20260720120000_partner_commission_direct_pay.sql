-- Partner commissions under DIRECT-PAY (July 2026 fix).
-- ---------------------------------------------------------------------------
-- The original accrual trigger (trg_accrue_referral_commission) fires on
-- household_payouts INSERTs — but direct-pay bookings write NO payout row
-- (capture-household-payment only flips status), so since the direct-pay
-- pivot a recruited helper's completed jobs earned their partner NOTHING.
-- Verified live 2026-07-20: payout trigger present, zero commissions ever.
--
-- Fix: a second exception-safe trigger accrues on the booking's own
-- completed flip, gated to direct-pay bookings only; the payout trigger
-- stays for in-flight legacy escrow. Both paths dedup on booking_id, so a
-- booking can never accrue twice whichever trigger reaches it first.
-- Also adds notified_at for the notify-partner-commissions email cron.

-- One commission per booking (payout_id stays unique for legacy rows).
create unique index if not exists referral_commissions_booking_uniq
  on public.referral_commissions (booking_id)
  where booking_id is not null;

-- Stamp for the "you just earned €X" partner email (cron sweeps null rows).
alter table public.referral_commissions
  add column if not exists notified_at timestamptz;

-- ── Legacy payout-row trigger: conflict target moves to booking_id ─────────
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

-- ── Direct-pay: accrue when the booking itself completes ───────────────────
-- household_bookings.student_id is the helper's auth user_id (accept-job
-- stamps it), the same id-space the payout trigger resolves.
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

drop trigger if exists trg_accrue_referral_commission_direct_pay on public.household_bookings;
create trigger trg_accrue_referral_commission_direct_pay
  after update of status on public.household_bookings
  for each row
  when (NEW.status = 'completed' and OLD.status is distinct from NEW.status)
  execute function public.accrue_referral_commission_direct_pay();

-- ── Backfill: any attributed helper's completed direct-pay jobs that the
--    dead window missed (idempotent; zero rows expected as of 2026-07-20). ──
insert into referral_commissions (code_id, helper_id, booking_id, job_cents, amount_cents)
select ra.code_id, h.id, b.id,
       coalesce(b.price_estimate_cents, 0),
       floor(coalesce(b.price_estimate_cents, 0) * rc.commission_bps / 10000.0)::int
from household_bookings b
join household_helpers h      on h.user_id = b.student_id
join referral_attributions ra on ra.helper_id = h.id
join referral_codes rc        on rc.id = ra.code_id and rc.active
where b.status = 'completed'
  and coalesce(b.booking_data->>'direct_pay', '') = 'true'
  and floor(coalesce(b.price_estimate_cents, 0) * rc.commission_bps / 10000.0)::int > 0
on conflict (booking_id) where booking_id is not null do nothing;
