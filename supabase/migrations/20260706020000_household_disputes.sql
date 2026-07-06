-- Refund & dispute automation for household bookings.
--
-- Today the "money-back guarantee" exists only in email copy — there is no code
-- path to refund a completed job, and auto-completed jobs (48h no response)
-- transfer the helper's pay immediately, so a customer who finally objects has
-- to be refunded by hand in the Stripe dashboard AND the transfer reversed.
--
-- This adds:
--   • dispute/refund bookkeeping on the booking row
--   • a 'reversed' payout status + a hold_until cooling-off timestamp so an
--     auto-completed job's payout can be safely cancelled+refunded during the
--     window instead of clawed back after transfer
ALTER TABLE public.household_bookings
  ADD COLUMN IF NOT EXISTS disputed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispute_reason text,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_refund_id text;

-- Cooling-off hold: capture-household-payment stamps this (now + N hours) for
-- AUTO-completed jobs so release-household-payouts only transfers once it has
-- elapsed; a customer-confirmed completion leaves it NULL and pays out at once.
ALTER TABLE public.household_payouts
  ADD COLUMN IF NOT EXISTS hold_until timestamptz;

-- Allow a payout to be marked 'reversed' when a dispute cancels a held (not yet
-- transferred) payout, so it's excluded from the release sweep and auditable.
ALTER TABLE public.household_payouts
  DROP CONSTRAINT IF EXISTS household_payouts_status_check;
ALTER TABLE public.household_payouts
  ADD CONSTRAINT household_payouts_status_check
  CHECK (status IN ('pending', 'released', 'transferred', 'failed', 'reversed'));

-- verify_jwt = false on the new customer-facing dispute function (booking-id
-- gated, same trust model as customer_cancel).
