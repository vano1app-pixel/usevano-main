-- Timed-job auto-completion.
--
-- When a timed job (cleaning, garden, moving — the categories that store a
-- booked duration) starts, household-arrival stamps job_ends_at = start + the
-- booked duration. The helper and customer screens count down to it, and a
-- cron sweep (auto-complete-timed-jobs) completes + auto-pays any in_progress
-- timed job whose job_ends_at has passed, so completion is reliable even if
-- nobody has the page open. One-off jobs leave this null and are completed by
-- the household tapping "mark done".

ALTER TABLE public.household_bookings
  ADD COLUMN IF NOT EXISTS job_ends_at TIMESTAMPTZ;

-- Cheap lookup for the cron sweep: only in_progress rows with a due timer.
CREATE INDEX IF NOT EXISTS household_bookings_job_ends_at_idx
  ON public.household_bookings (job_ends_at)
  WHERE status = 'in_progress' AND job_ends_at IS NOT NULL;
