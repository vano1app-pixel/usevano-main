-- Auto-pay backstop deadline for every in-progress job.
--
-- Completion is the customer's call (they rate + tap "mark complete"), but a
-- customer who never confirms must not strand the helper's pay. auto_complete_at
-- is the absolute time the cron will auto-complete + auto-pay on their behalf:
--   timed jobs  : booked end time + a short grace
--   one-off jobs: 24h after the job started
-- It's set when the arrival code is confirmed (household-arrival). Kept separate
-- from job_ends_at, which is only the timed countdown the screens show.

ALTER TABLE public.household_bookings
  ADD COLUMN IF NOT EXISTS auto_complete_at TIMESTAMPTZ;

-- Cheap lookup for the backstop sweep: only in_progress rows with a deadline.
CREATE INDEX IF NOT EXISTS household_bookings_auto_complete_at_idx
  ON public.household_bookings (auto_complete_at)
  WHERE status = 'in_progress' AND auto_complete_at IS NOT NULL;
