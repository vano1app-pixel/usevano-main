-- Timed-job countdown.
--
-- When a timed job (cleaning, tutoring, garden, moving) starts, household-arrival
-- stamps job_ends_at = start + the booked duration. The helper and customer
-- screens count down to it; once it's up, the customer rates + marks the job
-- complete to pay the helper. The job is never auto-completed — the timer is
-- only a guide. One-off jobs leave this null.

ALTER TABLE public.household_bookings
  ADD COLUMN IF NOT EXISTS job_ends_at TIMESTAMPTZ;

-- Cheap lookup for in_progress rows with a running timer.
CREATE INDEX IF NOT EXISTS household_bookings_job_ends_at_idx
  ON public.household_bookings (job_ends_at)
  WHERE status = 'in_progress' AND job_ends_at IS NOT NULL;
