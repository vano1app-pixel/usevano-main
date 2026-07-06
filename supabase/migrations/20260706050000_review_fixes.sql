-- Fixes from the money/dispatch code review.
--
-- accepted_at: sweep-stalled-jobs keyed its "helper is late" clock off paid_at,
-- which stays ancient after a re-dispatch — so a freshly-accepted replacement
-- helper got pinged/escalated immediately. Stamp when a helper actually claims
-- the job so the stall clock restarts on every acceptance.
ALTER TABLE public.household_bookings
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
