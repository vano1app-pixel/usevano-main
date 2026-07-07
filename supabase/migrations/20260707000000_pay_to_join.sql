-- Pay-to-join model: the €2 sign-up fee is now THE gate to being on the
-- platform (status 'approved', dispatchable). Student-email + Stripe-Identity
-- checks no longer block approval — they earn the "Verified" badge instead
-- (id_verified, already rendered as the ✓ tick on helper cards and profiles).
--
-- Why: requiring all three up front stalled real supply (helpers paid but sat
-- pending on a spam-filtered OTP or an unfinished ID check). The badge is the
-- carrot — dispatch offers jobs to verified helpers first — while the fee
-- keeps sign-ups genuine.

CREATE OR REPLACE FUNCTION public.household_helpers_autoapprove()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.status = 'pending' AND NEW.signup_paid THEN
    NEW.status := 'approved';
    -- Fresh approval defaults to available so paying actually puts them in the
    -- dispatch pool; they can toggle off from the dashboard.
    NEW.is_available := true;
  END IF;
  RETURN NEW;
END;
$fn$;

-- Narrow the trigger to the one column that now matters (was: email/ID/fee).
DROP TRIGGER IF EXISTS trg_helpers_autoapprove ON public.household_helpers;
CREATE TRIGGER trg_helpers_autoapprove
BEFORE UPDATE OF signup_paid ON public.household_helpers
FOR EACH ROW WHEN (new.status = 'pending')
EXECUTE FUNCTION public.household_helpers_autoapprove();

-- One-time sweep: anyone who already paid but was left pending under the old
-- three-gate rule goes live now.
UPDATE public.household_helpers
SET status = 'approved', is_available = true
WHERE status = 'pending' AND signup_paid;
