-- Data cleanup (2026-07-29) — void the phantom payout rows the buggy
-- release-household-payouts backfill created for DIRECT-PAY bookings.
--
-- Until the fix in this branch, the reconciliation backfill inserted an
-- 85%-of-job-price payout row for every completed direct-pay booking (it never
-- filtered booking_data.direct_pay). Direct-pay bookings must never have a
-- payout row — the customer pays the helper 100% directly and VANO only takes
-- its fee. Those phantom 'pending' rows (a) make nudge-helper-onboarding text
-- helpers "you've earned €X — add your bank details" and (b) would transfer real
-- money to onboarded helpers (a second payment).
--
-- This flips the never-transferred phantom rows (pending / transferring) to
-- 'reversed' — an existing, auditable status that the release sweep
-- (status in pending/transferring) and the onboarding nudge (status = pending)
-- both ignore. Rows that ALREADY transferred are deliberately left untouched:
-- real money moved and needs manual Stripe reconciliation; the NOTICE reports
-- how many so they can be reviewed. Legacy-escrow payouts are never direct_pay,
-- so they are unaffected.

do $$
declare
  v_voided integer;
  v_already_paid integer;
begin
  update public.household_payouts p
     set status = 'reversed'
    from public.household_bookings b
   where p.booking_id = b.id
     and p.status in ('pending','transferring')
     and (b.booking_data->>'direct_pay') = 'true';
  get diagnostics v_voided = row_count;

  select count(*) into v_already_paid
    from public.household_payouts p
    join public.household_bookings b on b.id = p.booking_id
   where p.status = 'transferred'
     and (b.booking_data->>'direct_pay') = 'true';

  raise notice 'void_phantom_directpay_payouts: reversed % phantom pending/transferring payout(s); % direct-pay payout(s) already TRANSFERRED need manual Stripe review',
    v_voided, v_already_paid;
end $$;
