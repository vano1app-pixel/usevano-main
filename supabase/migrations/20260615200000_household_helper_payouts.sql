-- Automatic payouts for household helpers via Stripe Connect.
--
-- Extends the existing "Vano Pay" Connect/escrow plumbing (which today
-- only pays freelancers via student_profiles) to household helpers.
--
-- A helper's Connect Express account lives on their household_helpers
-- row, keyed by household_helpers.user_id = the helper's auth user id.
-- That id equals household_bookings.student_id and
-- household_payouts.student_id, so a payout row can always be matched
-- back to the helper that earned it.
--
-- Helpers can work with NO payout setup: earnings are written as
-- household_payouts.status = 'pending' and auto-released by a Stripe
-- Transfer once they finish onboarding (capture-household-payment fires
-- it best-effort on completion; release-household-payouts sweeps the
-- backlog on a cron).

-- household_helpers.user_id already exists (added 20260602000000 so an
-- authenticated worker can manage their own row, and accept-job updates
-- it). Re-declare with IF NOT EXISTS so this migration is safe on any
-- branch where it might be missing.
ALTER TABLE public.household_helpers
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS stripe_account_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS household_helpers_user_id_idx
  ON public.household_helpers (user_id);
CREATE INDEX IF NOT EXISTS household_helpers_stripe_account_id_idx
  ON public.household_helpers (stripe_account_id);

-- RLS: a logged-in helper must be able to SELECT their own
-- household_helpers row (so the frontend payout card can read
-- stripe_account_id + stripe_payouts_enabled) and their own
-- household_payouts (so it can sum pending earnings).
--
-- Both reads are already covered by existing row-level policies —
-- "helpers_read_own" (auth.uid() = user_id) on household_helpers and
-- "Students can read own payouts" (auth.uid() = student_id) on
-- household_payouts. RLS is row-level not column-level, so the new
-- columns are readable under the existing SELECT policy with no change.
--
-- We re-create the helper SELECT policy idempotently here only to
-- guarantee it exists on branches where the 20260602000000 migration
-- hasn't run; nothing is loosened.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'household_helpers'
      AND policyname = 'helpers_read_own'
  ) THEN
    CREATE POLICY "helpers_read_own"
      ON public.household_helpers FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'household_payouts'
      AND policyname = 'Students can read own payouts'
  ) THEN
    CREATE POLICY "Students can read own payouts"
      ON public.household_payouts FOR SELECT
      USING (auth.uid() = student_id);
  END IF;
END $$;
