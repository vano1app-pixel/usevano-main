-- Gap-recruit nudges: when a job dispatches into thin coverage (few or no
-- matching helpers in the city), dispatch-household-job texts a handful of
-- available same-city helpers who DON'T have the category — "a paying job
-- just skipped you, add the category to get the next one". Real missed
-- demand converts far better than a sign-up checkbox, and it recruits
-- supply into the exact category+city gap.
--
--   • gap_nudged_at — per-helper stamp, written BEFORE sending (the same
--     idempotency convention as the crons). One nudge per helper per 7 days
--     across ALL categories so it never smells like spam.
ALTER TABLE public.household_helpers
  ADD COLUMN IF NOT EXISTS gap_nudged_at timestamptz;
