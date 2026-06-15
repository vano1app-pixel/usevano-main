-- Arrival-code handshake + payout auto-release for the household flow.
--
-- Arrival code: when a helper taps "I've reached", a 4-digit code is generated
-- server-side and shown ONLY on the customer's tracking screen. The helper has
-- to read it from the customer and type it back in to start the job — proof
-- they actually turned up at the door. The code is never returned to the
-- helper's app (generation + verification happen in the household-arrival edge
-- function under the service role).
--
-- Payout auto-release: household helpers are paid via Revolut, so completion
-- already records a payout. We add a 'released' status + released_at so a job
-- marked complete instantly flags its payout as approved-for-payout with no
-- manual review step.

ALTER TABLE public.household_bookings
  ADD COLUMN IF NOT EXISTS arrival_code        TEXT,
  ADD COLUMN IF NOT EXISTS arrival_verified_at TIMESTAMPTZ;

-- Allow the new 'released' payout status and a release timestamp.
ALTER TABLE public.household_payouts
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;

ALTER TABLE public.household_payouts
  DROP CONSTRAINT IF EXISTS household_payouts_status_check;

ALTER TABLE public.household_payouts
  ADD CONSTRAINT household_payouts_status_check
  CHECK (status IN ('pending', 'released', 'transferred', 'failed'));
