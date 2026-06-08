-- Customer lat/lng as top-level columns so progress-email cron can query them
-- without parsing JSONB. last_progress_email_at throttles emails to 1/10 min.

ALTER TABLE public.household_bookings
  ADD COLUMN IF NOT EXISTS customer_lat  NUMERIC(9, 6),
  ADD COLUMN IF NOT EXISTS customer_lng  NUMERIC(9, 6),
  ADD COLUMN IF NOT EXISTS last_progress_email_at TIMESTAMPTZ;

-- Track whether we've sent the "still finding your helper" email so it only
-- fires once per booking, not on every cron tick.
ALTER TABLE public.household_bookings
  ADD COLUMN IF NOT EXISTS no_helpers_email_sent_at TIMESTAMPTZ;
