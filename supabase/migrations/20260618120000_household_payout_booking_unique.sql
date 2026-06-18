-- Money-safety: exactly one payout per booking.
--
-- Without this, two concurrent completions (a helper double-tap, or the
-- customer "mark done" racing the timed-job completion cron) can both pass the
-- non-atomic count-check in capture-household-payment and insert two
-- household_payouts rows -> two Stripe transfers. The per-payout
-- `Idempotency-Key: vano_household_payout_<id>` does NOT dedupe them because
-- each row has a distinct id. This constraint makes the INSERT itself the
-- atomic guard: the losing race gets a null row back (insert violates the
-- constraint) and the transfer block is skipped (`if (payoutId && ...)`), so the
-- job still completes but the helper is paid exactly once.
--
-- Verified before adding: zero existing duplicate booking_ids in the table.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.household_payouts'::regclass
      AND conname = 'household_payouts_booking_id_key'
  ) THEN
    ALTER TABLE public.household_payouts
      ADD CONSTRAINT household_payouts_booking_id_key UNIQUE (booking_id);
  END IF;
END $$;
